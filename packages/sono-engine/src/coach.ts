import { clamp, cross, deg, dot, normalize, type Vec3 } from "./math";
import type { OrganInfo } from "./organs";
import {
  frameFromPose,
  PROBES,
  type ProbeFrame,
  type ProbeKind,
  type ProbePose,
  planeToPolar,
  planeToWorld,
  scanGeometry,
  scanline,
  worldToPlane,
} from "./probe";
import type { SkinSurface } from "./surface";
import { isGas, type OrganKey, TISSUE, TISSUE_TO_ORGAN } from "./tissues";
import { type ClassVolume, sampleClass } from "./volume";

export type ViewKind = "long" | "short";
export type Orientation = "longitudinal" | "transverse";

/** What a standard view requires, geometrically. */
export interface TaskTarget {
  readonly id: string;
  readonly organ: OrganKey;
  /** Long axis in the image plane, or the plane perpendicular to it. */
  readonly view: ViewKind;
  /** Use this world axis instead of the organ's own long axis. */
  readonly axis?: Vec3;
  readonly orientation: Orientation;
  readonly probe: ProbeKind;
  readonly depthMm: number;
  /** Other organs that must also be in view (e.g. liver for Morison's pouch). */
  readonly alsoVisible?: readonly OrganKey[];
  readonly measurement?: { readonly kind: "length" | "diameter" };
  /** Standard approach: range of φ (degrees around the body) sonographers use for this view. */
  readonly approach: readonly [number, number];
  /**
   * The breath the view is usually taken in: 1 = deep breath in and hold (brings the liver,
   * gallbladder and kidneys down from under the ribs), 0 = breathe out and hold.
   */
  readonly breath: 0 | 1;
}

/** A supine patient lies on the table: the back is out of reach. */
export const REACHABLE_PHI: readonly [number, number] = [-118, 118];

export const ABDOMEN_TASKS: readonly TaskTarget[] = [
  {
    id: "kidney-right-long",
    organ: "kidneyRight",
    view: "long",
    orientation: "longitudinal",
    probe: "curvilinear",
    depthMm: 180,
    measurement: { kind: "length" },
    approach: [40, 115],
    breath: 1,
  },
  {
    id: "kidney-right-short",
    organ: "kidneyRight",
    view: "short",
    orientation: "transverse",
    probe: "curvilinear",
    depthMm: 180,
    approach: [30, 115],
    breath: 1,
  },
  {
    id: "morison",
    organ: "kidneyRight",
    view: "long",
    orientation: "longitudinal",
    probe: "curvilinear",
    depthMm: 180,
    alsoVisible: ["liver"],
    approach: [55, 115],
    breath: 1,
  },
  {
    id: "gallbladder-long",
    organ: "gallbladder",
    view: "long",
    orientation: "longitudinal",
    probe: "curvilinear",
    depthMm: 140,
    approach: [5, 85],
    breath: 1,
  },
  {
    id: "aorta-transverse",
    organ: "aorta",
    view: "short",
    orientation: "transverse",
    probe: "curvilinear",
    depthMm: 180,
    measurement: { kind: "diameter" },
    approach: [-25, 25],
    breath: 0,
  },
  {
    id: "ivc-long",
    organ: "ivc",
    view: "long",
    orientation: "longitudinal",
    probe: "curvilinear",
    depthMm: 180,
    approach: [-5, 50],
    breath: 0,
  },
  {
    id: "spleen-long",
    organ: "spleen",
    view: "long",
    orientation: "longitudinal",
    probe: "curvilinear",
    depthMm: 160,
    measurement: { kind: "length" },
    approach: [-115, -70],
    breath: 0,
  },
  {
    id: "kidney-left-long",
    organ: "kidneyLeft",
    view: "long",
    orientation: "longitudinal",
    probe: "curvilinear",
    depthMm: 180,
    measurement: { kind: "length" },
    approach: [-115, -60],
    breath: 1,
  },
  {
    id: "bladder-transverse",
    organ: "bladder",
    view: "short",
    axis: [0, 0, 1],
    orientation: "transverse",
    probe: "curvilinear",
    depthMm: 160,
    approach: [-20, 20],
    breath: 0,
  },
  {
    id: "pancreas",
    organ: "pancreas",
    view: "long",
    orientation: "transverse",
    probe: "curvilinear",
    depthMm: 180,
    approach: [-25, 25],
    breath: 1,
  },
];

export interface ScoreParts {
  /** 0–100 overall. */
  readonly total: number;
  /** Organ centre lies in the scan plane. */
  readonly centred: number;
  /** Plane orientation matches the requested view. */
  readonly aligned: number;
  /** Organ sits inside the image (not cut off, not too deep). */
  readonly inView: number;
  /** Beam reaches the organ without crossing bone or gas. */
  readonly access: number;
  /** The probe face sits on the skin (not rocked or angled off it). */
  readonly contact: number;
  /** Angle between the plane and the ideal orientation, degrees. */
  readonly angleErrorDeg: number;
  /** Distance of the organ centre from the plane, mm. */
  readonly offsetMm: number;
}

/** Axis the view is defined by. */
function targetAxis(organ: OrganInfo, target: TaskTarget): Vec3 {
  return target.axis ?? organ.axes[0];
}

/** Geometry-only score of a pose for a task (cheap: no image rendering). */
export function scorePose(
  volume: ClassVolume,
  skin: SkinSurface,
  organs: ReadonlyMap<OrganKey, OrganInfo>,
  target: TaskTarget,
  pose: ProbePose,
): ScoreParts {
  const organ = organs.get(target.organ);
  if (!organ) return { total: 0, centred: 0, aligned: 0, inView: 0, access: 0, contact: 0, angleErrorDeg: 90, offsetMm: Infinity };
  const frame = frameFromPose(skin, pose);
  const axis = targetAxis(organ, target);
  const e = frame.elevation;
  const cosine = Math.abs(dot(e, axis));
  const angleErrorDeg = target.view === "long" ? deg(Math.asin(clamp(cosine, 0, 1))) : deg(Math.acos(clamp(cosine, 0, 1)));
  const aligned = Math.exp(-((angleErrorDeg / 16) ** 2));
  const plane = worldToPlane(frame, organ.centroid);
  const thickness = target.view === "long" ? organ.extents[2] : organ.extents[0];
  const tolerance = Math.max(5, (target.view === "long" ? 0.22 : 0.15) * thickness);
  const centred = Math.exp(-((plane.off / tolerance) ** 2));
  const inView = fieldOfView(target, plane.a, plane.d) * otherOrgansInView(organs, target, frame);
  const access = beamAccess(volume, frame, target, organ, plane.a, plane.d);
  const contact = faceContact(volume, frame, target);
  const total = 100 * centred ** 0.8 * aligned * inView * access * contact;
  return { total, centred, aligned, inView, access, contact, angleErrorDeg, offsetMm: Math.abs(plane.off) };
}

function fieldOfView(target: TaskTarget, a: number, d: number): number {
  const g = scanGeometry(PROBES[target.probe], target.depthMm, 1);
  const polar = planeToPolar(g, a, d);
  if (!polar) {
    const depthMiss = d < 0 ? -d : d > target.depthMm ? d - target.depthMm : 0;
    return Math.exp(-(((depthMiss + 15) / 30) ** 2)) * 0.3;
  }
  const u = polar.line / (g.lines - 1);
  const lateral = Math.exp(-(((Math.abs(u - 0.5) * 2) / 0.75) ** 4));
  const depthFraction = d / target.depthMm;
  const depth = depthFraction > 0.85 ? Math.exp(-(((depthFraction - 0.85) / 0.1) ** 2)) : 1;
  return lateral * depth;
}

function otherOrgansInView(organs: ReadonlyMap<OrganKey, OrganInfo>, target: TaskTarget, frame: ProbeFrame): number {
  let factor = 1;
  for (const key of target.alsoVisible ?? []) {
    const other = organs.get(key);
    if (!other) continue;
    const plane = worldToPlane(frame, other.centroid);
    // Big organs (liver) need only reach the plane, not be centred on it.
    const reach = Math.max(15, other.extents[2] * 0.6);
    factor *= Math.exp(-((Math.max(0, Math.abs(plane.off) - reach) / 20) ** 2));
  }
  return factor;
}

/** Fraction of the probe face resting on the skin (within a few mm of it). */
function faceContact(volume: ClassVolume, frame: ProbeFrame, target: TaskTarget): number {
  const g = scanGeometry(PROBES[target.probe], target.depthMm, 1);
  const points = 7;
  let touching = 0;
  for (let p = 0; p < points; p++) {
    const line = Math.round((p / (points - 1)) * (g.lines - 1));
    const sl = scanline(g, line);
    for (let t = -4; t <= 12; t += 2) {
      const pos = planeToWorld(frame, sl.a + sl.da * t, sl.d + sl.dd * t);
      if (sampleClass(volume, pos) !== TISSUE.outside) {
        touching++;
        break;
      }
    }
  }
  const fraction = touching / points;
  return fraction >= 0.99 ? 1 : 0.25 + 0.75 * fraction ** 2;
}

/**
 * Gas thinner than this (mm) along a ray does not block it. Insonate does not model probe pressure,
 * so the image shows every gas pocket: only specks (cleaned away anyway) are tolerated.
 */
const GAS_TOLERANCE_MM = 2;

/** Fraction of three rays from the probe to the organ that avoid bone, lung and thick gas. */
function beamAccess(volume: ClassVolume, frame: ProbeFrame, target: TaskTarget, organ: OrganInfo, a: number, d: number): number {
  // Check rays across the organ as the view shows it: along its length for long-axis views
  // (ribs over a pole matter), across its width for cross-sections.
  const span = target.view === "long" ? Math.min(45, organ.extents[0] * 0.36) : Math.min(25, organ.extents[1] * 0.3);
  let open = 0;
  const offsets = [-span, -span / 2, 0, span / 2, span];
  // The centre of the organ matters most; a shadowed pole costs less than a shadowed middle.
  const weights = [0.14, 0.2, 0.32, 0.2, 0.14];
  for (const [ray, offset] of offsets.entries()) {
    const ta = a + offset;
    const goal = planeToWorld(frame, ta, d);
    // Rays start at the face: for a curvilinear probe, where the line through the target leaves the face.
    const r = PROBES[target.probe].faceRadiusMm;
    let start: Vec3;
    if (target.probe === "curvilinear") {
      const apex = planeToWorld(frame, 0, -r);
      const dir = normalize([goal[0] - apex[0], goal[1] - apex[1], goal[2] - apex[2]]);
      start = [apex[0] + dir[0] * r, apex[1] + dir[1] * r, apex[2] + dir[2] * r];
    } else {
      start = planeToWorld(frame, ta, 0);
    }
    const dx = goal[0] - start[0];
    const dy = goal[1] - start[1];
    const dz = goal[2] - start[2];
    const length = Math.hypot(dx, dy, dz);
    const steps = Math.max(1, Math.ceil(length / 2));
    let blocked = false;
    let entered = false;
    let gasRun = 0;
    const stepMm = length / steps;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const c = sampleClass(volume, [start[0] + dx * t, start[1] + dy * t, start[2] + dz * t]);
      if (c === TISSUE.outside) {
        if (entered) {
          blocked = true;
          break;
        }
        continue;
      }
      entered = true;
      if (TISSUE_TO_ORGAN[c] === target.organ) break;
      // Small bowel-gas pockets can be pushed aside with probe pressure; bone and aerated lung cannot.
      gasRun = isGas(c) ? gasRun + stepMm : 0;
      if (c === TISSUE.bone || c === TISSUE.lung || gasRun > GAS_TOLERANCE_MM) {
        blocked = true;
        break;
      }
    }
    if (!blocked) open += weights[ray];
  }
  return 0.1 + 0.9 * open;
}

/** Live score: geometry, discounted when the organ is not actually well seen in the rendered image. */
export function liveScore(geometry: ScoreParts, organ: OrganInfo, target: TaskTarget, visibleAreaMm2: number): number {
  const [e0, e1, e2] = organ.extents;
  const expected = target.view === "long" ? (Math.PI / 4) * e0 * e1 * 0.7 : (Math.PI / 4) * e1 * e2 * 0.7;
  const visible = clamp(visibleAreaMm2 / Math.max(1, expected), 0, 1);
  return geometry.total * (0.35 + 0.65 * visible);
}

/** An anatomical direction, from the patient's point of view. */
export type Direction = "head" | "feet" | "right" | "left" | "anterior" | "posterior";

/** What the coach advises, as data (so that it can be worded in any language). */
export type Advice =
  | { readonly move: "slide" | "rotate" | "fan"; readonly toward: Direction }
  | { readonly move: "rock"; readonly toward: "marker" | "away" }
  | { readonly move: "find-height"; readonly toward: "head" | "feet"; readonly cm: number }
  | { readonly move: "find-side"; readonly toward: "right" | "left" }
  | { readonly move: "find-orientation"; readonly orientation: Orientation }
  | { readonly move: "sweep" };

export interface Action {
  readonly kind: "slide" | "rotate" | "tilt" | "rock";
  readonly pose: ProbePose;
  readonly gain: number;
  readonly advice: Advice;
  /** The advice in English. */
  readonly text: string;
}

const DIRECTION_TEXT: Readonly<Record<Direction, string>> = {
  head: "the head",
  feet: "the feet",
  right: "the patient's right",
  left: "the patient's left",
  anterior: "the front (anterior)",
  posterior: "the back (posterior)",
};

/** The advice in plain English (organ names in lower case). */
export function adviceText(advice: Advice, organ: string): string {
  switch (advice.move) {
    case "slide":
      return `Slide the probe toward ${DIRECTION_TEXT[advice.toward]}`;
    case "rotate":
      return `Rotate the probe: turn the marker toward ${DIRECTION_TEXT[advice.toward]}`;
    case "fan":
      return `Fan the beam toward ${DIRECTION_TEXT[advice.toward]}`;
    case "rock":
      return `Rock the probe (heel–toe) to angle the beam toward the ${advice.toward === "marker" ? "marker" : "non-marker"} side`;
    case "find-height":
      return `Slide toward the ${advice.toward}: the ${organ} is ${advice.cm} cm ${advice.toward === "head" ? "higher" : "lower"}`;
    case "find-side":
      return `Slide around the body toward the patient's ${advice.toward} side`;
    case "find-orientation":
      return advice.orientation === "longitudinal"
        ? "Rotate toward a longitudinal plane (marker toward the head)"
        : "Rotate toward a transverse plane (marker toward the patient's right)";
    case "sweep":
      return `Fan the beam slowly through the area to find the ${organ}`;
  }
}

const SLIDE_MM = 8;

/** Try small moves of each kind; return the most helpful one, in plain words. */
export function suggestAction(
  volume: ClassVolume,
  skin: SkinSurface,
  organs: ReadonlyMap<OrganKey, OrganInfo>,
  target: TaskTarget,
  pose: ProbePose,
): Action | null {
  const base = scorePose(volume, skin, organs, target, pose).total;
  if (base < 5) return coarseHint(skin, organs, target, pose);
  const frame = frameFromPose(skin, pose);
  const dPhi = SLIDE_MM / skin.mmPerDegree(pose.phiDeg, pose.zMm);
  const candidates: Array<{ kind: Action["kind"]; pose: ProbePose }> = [
    { kind: "slide", pose: { ...pose, zMm: pose.zMm + SLIDE_MM } },
    { kind: "slide", pose: { ...pose, zMm: pose.zMm - SLIDE_MM } },
    { kind: "slide", pose: { ...pose, phiDeg: pose.phiDeg + dPhi } },
    { kind: "slide", pose: { ...pose, phiDeg: pose.phiDeg - dPhi } },
    { kind: "rotate", pose: { ...pose, rotationDeg: pose.rotationDeg + 12 } },
    { kind: "rotate", pose: { ...pose, rotationDeg: pose.rotationDeg - 12 } },
    { kind: "tilt", pose: { ...pose, tiltDeg: clamp(pose.tiltDeg + 8, -60, 60) } },
    { kind: "tilt", pose: { ...pose, tiltDeg: clamp(pose.tiltDeg - 8, -60, 60) } },
    { kind: "rock", pose: { ...pose, rockDeg: clamp(pose.rockDeg + 8, -40, 40) } },
    { kind: "rock", pose: { ...pose, rockDeg: clamp(pose.rockDeg - 8, -40, 40) } },
  ];
  let best: Action | null = null;
  for (const candidate of candidates) {
    const score = scorePose(volume, skin, organs, target, candidate.pose).total;
    const gain = score - base;
    if (gain > 1.5 && (!best || gain > best.gain)) {
      const advice = describe(candidate.kind, frame, frameFromPose(skin, candidate.pose));
      best = { kind: candidate.kind, pose: candidate.pose, gain, advice, text: adviceText(advice, "") };
    }
  }
  return best;
}

/** Far from the target, small moves do not change the score: point toward the organ's usual window instead. */
function coarseHint(skin: SkinSurface, organs: ReadonlyMap<OrganKey, OrganInfo>, target: TaskTarget, pose: ProbePose): Action | null {
  const organ = organs.get(target.organ);
  if (!organ) return null;
  const located = skin.locate(organ.centroid);
  const phiTarget = clamp(located.phiDeg, target.approach[0], target.approach[1]);
  const dz = organ.centroid[2] - pose.zMm;
  const dPhi = phiTarget - pose.phiDeg;
  const name = organ.name.toLowerCase();
  const action = (kind: Action["kind"], next: ProbePose, advice: Advice): Action => ({
    kind,
    pose: next,
    gain: 0,
    advice,
    text: adviceText(advice, name),
  });
  if (Math.abs(dz) > 25) {
    return action(
      "slide",
      { ...pose, zMm: pose.zMm + Math.sign(dz) * SLIDE_MM },
      { move: "find-height", toward: dz > 0 ? "head" : "feet", cm: Math.round(Math.abs(dz) / 10) },
    );
  }
  if (Math.abs(dPhi) > 10) {
    return action(
      "slide",
      { ...pose, phiDeg: pose.phiDeg + Math.sign(dPhi) * 5 },
      { move: "find-side", toward: dPhi > 0 ? "right" : "left" },
    );
  }
  const wanted = target.orientation === "longitudinal" ? 0 : 90;
  const turn = ((wanted - pose.rotationDeg + 540) % 360) - 180;
  if (Math.abs(turn) > 20) {
    return action(
      "rotate",
      { ...pose, rotationDeg: pose.rotationDeg + Math.sign(turn) * 12 },
      { move: "find-orientation", orientation: target.orientation },
    );
  }
  return action("tilt", pose, { move: "sweep" });
}

/** Name the dominant anatomical direction of a change vector. */
export function anatomicalDirection(v: Vec3): Direction {
  const ax = Math.abs(v[0]);
  const ay = Math.abs(v[1]);
  const az = Math.abs(v[2]);
  if (az >= ax && az >= ay) return v[2] > 0 ? "head" : "feet";
  if (ax >= ay) return v[0] > 0 ? "right" : "left";
  return v[1] > 0 ? "anterior" : "posterior";
}

function describe(kind: Action["kind"], from: ProbeFrame, to: ProbeFrame): Advice {
  const delta = (a: Vec3, b: Vec3): Vec3 => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  switch (kind) {
    case "slide":
      return { move: "slide", toward: anatomicalDirection(delta(from.origin, to.origin)) };
    case "rotate":
      return { move: "rotate", toward: anatomicalDirection(delta(from.lateral, to.lateral)) };
    case "tilt":
      return { move: "fan", toward: anatomicalDirection(delta(from.beam, to.beam)) };
    case "rock":
      return { move: "rock", toward: dot(delta(from.beam, to.beam), from.lateral) > 0 ? "marker" : "away" };
  }
}

/** A view found by the search, with its score. */
export interface PoseCandidate {
  readonly pose: ProbePose;
  readonly score: ScoreParts;
  /** Geometric score weighted by the textbook-layout preference. */
  readonly rank: number;
}

/**
 * Coarse search over the task's approach: height, angle around the body, rotation and fanning.
 * Returns the best few views, at least a little apart from each other (for later refinement).
 */
export function candidatePoses(
  volume: ClassVolume,
  skin: SkinSurface,
  organs: ReadonlyMap<OrganKey, OrganInfo>,
  target: TaskTarget,
  count = 12,
): PoseCandidate[] {
  const organ = organs.get(target.organ);
  if (!organ) throw new Error(`Organ ${target.organ} is not in this case`);
  const [phiMin, phiMax] = target.approach;
  const rotations = target.orientation === "longitudinal" ? range(-60, 60, 10) : range(30, 150, 10);
  const all: PoseCandidate[] = [];
  for (let dz = -120; dz <= 120; dz += 10) {
    for (let phiDeg = phiMin; phiDeg <= phiMax + 1e-9; phiDeg += 6) {
      const zMm = clamp(organ.centroid[2] + dz, skin.zMin + 5, skin.zMax - 5);
      for (const rotationDeg of rotations) {
        for (const tiltDeg of [-40, -25, -10, 0, 10, 25, 40]) {
          const pose = { phiDeg, zMm, rotationDeg, tiltDeg, rockDeg: 0 };
          const score = scorePose(volume, skin, organs, target, pose);
          if (score.total <= 1) continue;
          all.push({ pose, score, rank: score.total * displayPreference(skin, organ, target, pose) });
        }
      }
    }
  }
  all.sort((a, b) => b.rank - a.rank);
  const chosen: PoseCandidate[] = [];
  for (const candidate of all) {
    const near = chosen.some(
      (c) =>
        Math.abs(c.pose.phiDeg - candidate.pose.phiDeg) < 10 &&
        Math.abs(c.pose.zMm - candidate.pose.zMm) < 20 &&
        Math.abs(c.pose.rotationDeg - candidate.pose.rotationDeg) < 20,
    );
    if (near) continue;
    chosen.push(candidate);
    if (chosen.length >= count) break;
  }
  return chosen;
}

/** Coordinate refinement of a view (steps of 6, 3 and 1.5 mm or degrees), by geometric score and layout. */
export function refinePose(
  volume: ClassVolume,
  skin: SkinSurface,
  organs: ReadonlyMap<OrganKey, OrganInfo>,
  target: TaskTarget,
  start: ProbePose,
): PoseCandidate {
  const organ = organs.get(target.organ);
  if (!organ) throw new Error(`Organ ${target.organ} is not in this case`);
  const [phiMin, phiMax] = target.approach;
  const evaluate = (pose: ProbePose): PoseCandidate => {
    const score = scorePose(volume, skin, organs, target, pose);
    return { pose, score, rank: score.total * displayPreference(skin, organ, target, pose) };
  };
  let current = evaluate(start);
  for (const step of [6, 3, 1.5]) {
    let improved = true;
    for (let round = 0; improved && round < 40; round++) {
      improved = false;
      const p = current.pose;
      const moves: ProbePose[] = [
        { ...p, zMm: p.zMm + step },
        { ...p, zMm: p.zMm - step },
        { ...p, phiDeg: clamp(p.phiDeg + step / 2, phiMin, phiMax) },
        { ...p, phiDeg: clamp(p.phiDeg - step / 2, phiMin, phiMax) },
        { ...p, rotationDeg: p.rotationDeg + step },
        { ...p, rotationDeg: p.rotationDeg - step },
        { ...p, tiltDeg: clamp(p.tiltDeg + step, -60, 60) },
        { ...p, tiltDeg: clamp(p.tiltDeg - step, -60, 60) },
        { ...p, rockDeg: clamp(p.rockDeg + step, -30, 30) },
        { ...p, rockDeg: clamp(p.rockDeg - step, -30, 30) },
      ];
      for (const pose of moves) {
        const next = evaluate(pose);
        if (next.rank > current.rank + 1e-6) {
          current = next;
          improved = true;
        }
      }
    }
  }
  return current;
}

/** Search for the best pose for a task: coarse grid, then coordinate refinement. */
export function optimizePose(
  volume: ClassVolume,
  skin: SkinSurface,
  organs: ReadonlyMap<OrganKey, OrganInfo>,
  target: TaskTarget,
): { pose: ProbePose; score: ScoreParts } {
  const [first] = candidatePoses(volume, skin, organs, target, 1);
  if (!first) throw new Error(`No view of ${target.organ} found`);
  const best = refinePose(volume, skin, organs, target, first.pose);
  return { pose: best.pose, score: best.score };
}

/**
 * How textbook-like a view is laid out (0.75-1): for long-axis views, the organ's long axis should run
 * across the image rather than along the beam, so its walls face the beam and the whole organ fits.
 */
export function displayPreference(skin: SkinSurface, organ: OrganInfo, target: TaskTarget, pose: ProbePose): number {
  if (target.view !== "long") return 1;
  const frame = frameFromPose(skin, pose);
  const axis = targetAxis(organ, target);
  const across = Math.abs(dot(axis, frame.lateral));
  const along = Math.abs(dot(axis, frame.beam));
  const inPlane = Math.hypot(across, along);
  return inPlane > 1e-6 ? 0.75 + 0.25 * (across / inPlane) : 0.75;
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(v);
  return out;
}

/** True value a measurement should match. */
export function measurementTruth(organ: OrganInfo, kind: "length" | "diameter"): number {
  return kind === "length" ? organ.extents[0] : (organ.extents[1] + organ.extents[2]) / 2;
}

/** Plane normal helper for callers that only have a pose. */
export function planeNormal(skin: SkinSurface, pose: ProbePose): Vec3 {
  const frame = frameFromPose(skin, pose);
  return normalize(cross(frame.lateral, frame.beam));
}

export interface CrossSection {
  /** Area of the organ in the scan plane, mm². */
  readonly areaMm2: number;
  /** Longest in-plane dimension (2D principal axis), mm. */
  readonly lengthMm: number;
  /** In-plane dimension across the longest one, mm. */
  readonly widthMm: number;
  /** Anterior–posterior (beam-direction) extent, mm. */
  readonly apMm: number;
  /** Diameter of a circle with the same area, mm. */
  readonly equivalentDiameterMm: number;
}

/** Measure an organ's cross-section in the current scan plane (sampled at `stepMm`). */
export function crossSection(
  volume: ClassVolume,
  frame: ProbeFrame,
  organ: OrganKey,
  depthMm = 260,
  halfWidthMm = 180,
  stepMm = 0.5,
): CrossSection {
  const points: number[] = [];
  for (let d = 0; d <= depthMm; d += stepMm) {
    for (let a = -halfWidthMm; a <= halfWidthMm; a += stepMm) {
      const c = sampleClass(volume, planeToWorld(frame, a, d));
      if (TISSUE_TO_ORGAN[c] === organ) points.push(a, d);
    }
  }
  const n = points.length / 2;
  if (n === 0) return { areaMm2: 0, lengthMm: 0, widthMm: 0, apMm: 0, equivalentDiameterMm: 0 };
  let ma = 0;
  let md = 0;
  for (let i = 0; i < points.length; i += 2) {
    ma += points[i];
    md += points[i + 1];
  }
  ma /= n;
  md /= n;
  let saa = 0;
  let sad = 0;
  let sdd = 0;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const u = points[i] - ma;
    const v = points[i + 1] - md;
    saa += u * u;
    sad += u * v;
    sdd += v * v;
    dMin = Math.min(dMin, points[i + 1]);
    dMax = Math.max(dMax, points[i + 1]);
  }
  const angle = 0.5 * Math.atan2(2 * sad, saa - sdd);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let lo = Infinity;
  let hi = -Infinity;
  let wlo = Infinity;
  let whi = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const u = points[i] - ma;
    const v = points[i + 1] - md;
    const t = u * ux + v * uy;
    const w = -u * uy + v * ux;
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
    wlo = Math.min(wlo, w);
    whi = Math.max(whi, w);
  }
  const areaMm2 = n * stepMm * stepMm;
  return {
    areaMm2,
    lengthMm: hi - lo + stepMm,
    widthMm: whi - wlo + stepMm,
    apMm: dMax - dMin + stepMm,
    equivalentDiameterMm: 2 * Math.sqrt(areaMm2 / Math.PI),
  };
}
