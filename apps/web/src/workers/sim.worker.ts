import {
  ABDOMEN_TASKS,
  aimAt,
  applyFindings,
  applyVariant,
  breathShiftMm,
  buildFlowField,
  type ClassVolume,
  type CtVolume,
  crossSection,
  type Finding,
  findingMesh,
  frameFromPose,
  liveScore,
  type OrganInfo,
  type OrganKey,
  organsWithBreath,
  type ProbePose,
  RESPIRATORY,
  renderClassMap,
  renderCtSlice,
  SkinSurface,
  sampleClass,
  scorePose,
  suggestAction,
  UltrasoundSimulator,
  withBreath,
} from "@insonate/sono-engine";
import type { AnatomyMap, CoachResult, CtMap, FindingMesh, FromWorker, Pixels, RenderMessage, ToWorker } from "../sim/protocol";

const port = self as unknown as Worker;

let volume: ClassVolume | null = null;
/** The volume as scanned: teaching cases are made from it. */
let pristine: Uint8Array | null = null;
/** The patient's CT, once the CT–ultrasound view has asked for it. */
let ctVolume: CtVolume | null = null;
let skin: SkinSurface | null = null;
let organs = new Map<OrganKey, OrganInfo>();
let simulator: UltrasoundSimulator | null = null;
const pool: ArrayBuffer[] = [];
let lastPose: ProbePose | null = null;
/** After a cine review, the next live frame must not blend with a reviewed one. */
let reviewed = false;
let lastHint: { taskId: string; pose: ProbePose; at: number; hint: CoachResult["hint"] } | null = null;
/** The patient after the current breath: organs that move with breathing, moved. */
let breathing: { breath: number; volume: ClassVolume; organs: Map<OrganKey, OrganInfo> } | null = null;

function breathe(breath: number): { volume: ClassVolume; organs: Map<OrganKey, OrganInfo> } {
  if (!volume) throw new Error("No case loaded");
  if (!breathing || breathing.breath !== breath) {
    breathing = { breath, volume: withBreath(volume, breath), organs: organsWithBreath(organs, breath, volume) };
  }
  return breathing;
}

function post(message: FromWorker, transfer: Transferable[] = []): void {
  port.postMessage(message, transfer);
}

port.onmessage = (event: MessageEvent<ToWorker>) => {
  try {
    const message = event.data;
    switch (message.type) {
      case "init":
        volume = { dims: message.dims, spacing: message.spacing, origin: message.origin, data: message.data };
        pristine = message.data.slice();
        skin = new SkinSurface(message.surface);
        organs = new Map(message.organs.map((o) => [o.key, o]));
        breathing = null;
        simulator = new UltrasoundSimulator(volume);
        post({ type: "ready" });
        break;
      case "render":
        render(message);
        break;
      case "measure": {
        if (!volume || !skin) return;
        const section = crossSection(breathe(message.breath).volume, frameFromPose(skin, message.pose), message.organ);
        post({ type: "measured", id: message.id, organ: message.organ, section });
        break;
      }
      case "recycle":
        if (pool.length < 4) pool.push(message.buffer);
        break;
      case "ct":
        ctVolume = { dims: message.dims, spacing: message.spacing, origin: message.origin, data: message.data };
        break;
      case "variant": {
        if (!volume || !pristine || !simulator) return;
        // Back to the patient as scanned, then add the case's finding.
        volume.data.set(pristine);
        const result = applyVariant(volume, message.variant);
        changed(result.overrides);
        const findings = meshesOf(result.findings);
        post(
          { type: "variant", variant: message.variant, facts: result.facts, focus: result.focus, findings },
          findings.flatMap((f) => [f.positions.buffer, f.indices.buffer]),
        );
        break;
      }
      case "case": {
        if (!volume || !pristine || !simulator) return;
        volume.data.set(pristine);
        const made = applyFindings(volume, message.specs);
        changed(made.overrides);
        const meshes = meshesOf(made.results.flatMap((r) => r.parts));
        post(
          {
            type: "case",
            key: message.key,
            findings: made.results.map((r) => ({ spec: r.spec, applied: r.applied, facts: r.facts, focus: r.focus })),
            truth: made.truth,
            liverMiddleX: organs.get("liver")?.centroid[0] ?? null,
            meshes,
          },
          meshes.flatMap((f) => [f.positions.buffer, f.indices.buffer]),
        );
        break;
      }
      case "aim": {
        if (!volume || !skin) return;
        // The point moves with breathing if what it lies in does: try the breath held in and out.
        const p = message.point;
        const moves = RESPIRATORY[sampleClass(volume, p)] === 1;
        let best: { pose: ProbePose; breath: 0 | 1; score: number } | null = null;
        for (const breath of [1, 0] as const) {
          const target: [number, number, number] = [p[0], p[1], p[2] - (moves ? breathShiftMm(volume, breath, p[2]) : 0)];
          const aim = aimAt(breathe(breath).volume, skin, target, message.depthMm, { through: message.through });
          if (aim && (!best || aim.score > best.score + 5)) best = { pose: aim.pose, breath, score: aim.score };
        }
        post({ type: "aimed", id: message.id, pose: best?.pose ?? null, breath: best?.breath ?? 0 });
        break;
      }
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

/** The tissue volume changed: new acoustics, no old blood flow, breathing or hints. */
function changed(overrides: ReadonlyArray<{ readonly tissue: number; readonly props: object }>): void {
  if (!simulator) return;
  simulator.setTissues(overrides);
  simulator.clearFlow();
  simulator.resetPersistence();
  breathing = null;
  lastHint = null;
}

function meshesOf(findings: readonly Finding[]): FindingMesh[] {
  return findings.map((finding) => {
    const mesh = findingMesh(volume as ClassVolume, finding);
    return {
      name: finding.name,
      positions: Float32Array.from(mesh.positions),
      indices: Uint32Array.from(mesh.indices),
      breathes: finding.tissues.some((t) => RESPIRATORY[t] === 1),
    };
  });
}

function render(message: RenderMessage): void {
  if (!volume || !skin || !simulator) return;
  // Blood flow for Doppler: about a second to build, so only when Doppler is first switched on
  // (and not counted in the frame time).
  if (message.settings.doppler !== "off" && !simulator.hasFlow) simulator.setFlow(buildFlowField(volume));
  const t0 = performance.now();
  const bytes = message.width * message.height * 4;
  let buffer = pool.pop();
  if (!buffer || buffer.byteLength !== bytes) buffer = new ArrayBuffer(bytes);
  const image = new Uint8ClampedArray(buffer) as Pixels;
  // Pressing sinks the face into the wall: the image, the outlines and the CT cut all start there.
  const frame = frameFromPose(skin, message.pose, message.settings.pressure);
  if (message.review || reviewed || !lastPose || poseDistance(lastPose, message.pose) > 12) simulator.resetPersistence();
  reviewed = Boolean(message.review);
  if (!message.review) lastPose = message.pose;
  const info = simulator.render(frame, message.settings, { width: message.width, height: message.height, rgba: image });
  const coach = message.task ? evaluate(message.task, message.pose, info.organs, message.settings.breath) : null;
  let anatomy: AnatomyMap | null = null;
  if (message.anatomy > 0) {
    // The same plane at a reduced size: enough for outlines, a few milliseconds to sample.
    const width = Math.max(64, Math.round(message.width * message.anatomy));
    const height = Math.max(50, Math.round(message.height * message.anatomy));
    const scale = message.width / width;
    const view = { ...info.view, width, height, mmPerPixel: info.view.mmPerPixel * scale };
    const classes = new Uint8Array(width * height);
    renderClassMap(volume, frame, info.geometry, view, message.settings.breath, classes, message.settings.pressure);
    anatomy = { width, height, classes };
  }
  let ct: CtMap | null = null;
  if (message.ct > 0 && ctVolume) {
    const width = Math.max(64, Math.round(message.width * message.ct));
    const height = Math.max(50, Math.round(message.height * message.ct));
    const view = { ...info.view, width, height, mmPerPixel: info.view.mmPerPixel * (message.width / width) };
    const gray = new Uint8Array(width * height);
    renderCtSlice(ctVolume, volume, frame, info.geometry, view, message.settings.breath, gray);
    ct = { width, height, gray };
  }
  post(
    {
      type: "frame",
      id: message.id,
      image,
      width: message.width,
      height: message.height,
      view: info.view,
      geometry: info.geometry,
      organs: info.organs,
      contact: info.contact,
      coach,
      anatomy,
      gate: info.gate,
      ct,
      ms: performance.now() - t0,
      review: Boolean(message.review),
    },
    [image.buffer, ...(anatomy ? [anatomy.classes.buffer] : []), ...(ct ? [ct.gray.buffer] : [])],
  );
}

function evaluate(
  taskId: string,
  pose: ProbePose,
  seen: Partial<Record<OrganKey, { areaMm2: number }>>,
  breath: number,
): CoachResult | null {
  const target = ABDOMEN_TASKS.find((t) => t.id === taskId);
  if (!target || !volume || !skin) return null;
  // Score against the organs where this breath has put them.
  const patient = breathe(breath);
  const organ = patient.organs.get(target.organ);
  if (!organ) return null;
  const parts = scorePose(patient.volume, skin, patient.organs, target, pose);
  const live = liveScore(parts, organ, target, seen[target.organ]?.areaMm2 ?? 0);
  // Hints cost ten extra pose evaluations: refresh them a few times a second, or when the probe moves.
  const now = performance.now();
  const moved = !lastHint || lastHint.taskId !== taskId || poseDistance(lastHint.pose, pose) > 0.5;
  if (!lastHint || (moved && now - lastHint.at > 250) || now - lastHint.at > 1200) {
    const action = live >= 85 ? null : suggestAction(patient.volume, skin, patient.organs, target, pose);
    lastHint = { taskId, pose, at: now, hint: action ? { kind: action.kind, text: action.text, advice: action.advice } : null };
  }
  return { taskId, parts, live, hint: lastHint.hint };
}

function poseDistance(a: ProbePose, b: ProbePose): number {
  return (
    Math.abs(a.phiDeg - b.phiDeg) +
    Math.abs(a.zMm - b.zMm) / 2 +
    Math.abs(a.rotationDeg - b.rotationDeg) +
    Math.abs(a.tiltDeg - b.tiltDeg) +
    Math.abs(a.rockDeg - b.rockDeg)
  );
}
