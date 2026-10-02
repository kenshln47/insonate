import {
  type CrossSection,
  frameFromPose,
  type GateSample,
  type ImageSettings,
  type ImageView,
  type OrganKey,
  type OrganView,
  type ProbeFrame,
  type ProbePose,
  type ScanGeometry,
  SkinSurface,
  type Vec3,
} from "@insonate/sono-engine";
import { type CaseData, loadCt } from "../case/loader";
import type { ViewAxes } from "../probecam/mapping";
import { type SonoState, useSono } from "../state/store";
import { ProbeDriver } from "./drive";
import { clampPose, lerpPose } from "./pose";
import type { AnatomyMap, CtMap, FindingMesh, FrameMessage, FromWorker, ToWorker } from "./protocol";

export interface FrameInfo {
  /** The pose the frame was made at (in cine review, a recorded one). */
  readonly pose: ProbePose;
  readonly frame: ProbeFrame;
  readonly view: ImageView;
  readonly geometry: ScanGeometry;
  readonly organs: Partial<Record<OrganKey, OrganView>>;
  readonly contact: number;
  readonly width: number;
  readonly height: number;
  /** Tissue map of the image, when the anatomy overlay is on. */
  readonly anatomy: AnatomyMap | null;
  /** How long the frame took to compute, ms. */
  readonly ms: number;
  /** The breath in this frame: 0 = out (as scanned) to 1 = deep breath in. */
  readonly breath: number;
  /** PW Doppler: the blood in the sample volume. */
  readonly gate: GateSample | null;
  /** The CT in the image plane, when the CT view is on and the CT has loaded. */
  readonly ct: CtMap | null;
}

/** Shape of the ultrasound image (width / height), and the limits of its pixel size. */
export const IMAGE_ASPECT = 640 / 500;
const MIN_WIDTH = 480;
const MAX_WIDTH = 1280;
/** One full breath in normal breathing, ms. */
const BREATH_PERIOD_MS = 4500;
/** Frames kept for cine review: about 10–15 s of scanning. */
const CINE_FRAMES = 240;

/** Which patient the worker should be making: an exam case, or a teaching case (or the patient as scanned). */
function caseKey(state: Pick<SonoState, "exam" | "variant">): string {
  return state.exam ? `exam:${state.exam.case.code}` : `variant:${state.variant}`;
}

/** A probe position that shows a point, and the breath to hold for it. */
export interface Aim {
  readonly pose: ProbePose;
  readonly breath: 0 | 1;
}

/** What one frame was made from, so cine review can make it again. */
export interface CineFrame {
  readonly pose: ProbePose;
  readonly settings: ImageSettings;
  readonly breath: number;
  /** When it was rendered (performance.now(), ms). */
  readonly at: number;
}

/**
 * Owns the simulation worker and the render loop. Reads probe pose and
 * machine settings from the store, draws frames into the ultrasound canvas,
 * and tells listeners (overlay, 3D view) about each new frame.
 */
export class SonoController {
  readonly data: CaseData;
  readonly skin: SkinSurface;
  /** Screen directions of the 3D view (set by the view), so Probe Cam moves the probe the way the hand moves. */
  viewAxes: (() => ViewAxes) | null = null;
  /** Moves the probe while keys or pad buttons are held. */
  readonly drive: ProbeDriver;
  private readonly worker: Worker;
  private ready = false;
  private inFlight = false;
  private dirty = true;
  private renderId = 0;
  private raf = 0;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private readonly listeners = new Set<(info: FrameInfo) => void>();
  private readonly findingListeners = new Set<(findings: FindingMesh[]) => void>();
  private findings: FindingMesh[] = [];
  private lastInfo: FrameInfo | null = null;
  private readonly cine: CineFrame[] = [];
  private reviewDirty = false;
  /** The CT: not asked for, on its way, or with the worker. */
  private ctState: "none" | "loading" | "ready" = "none";
  private animation: { from: ProbePose; to: ProbePose; start: number; duration: number } | null = null;
  private readonly waiters = new Map<number, (section: CrossSection) => void>();
  private readonly aimWaiters = new Map<number, (aim: Aim | null) => void>();
  private measureId = 0;
  /** When the stats readout was last updated; -Infinity so the first frame always reports. */
  private lastStats = Number.NEGATIVE_INFINITY;
  private width = 640;
  private height = 500;
  private framePose: ProbePose;
  private frameBreath = 0;
  private framePressure = 0;
  private unsubscribe: () => void;

  constructor(data: CaseData) {
    this.data = data;
    this.skin = new SkinSurface(data.surface);
    this.drive = new ProbeDriver(this.skin, (pose) => this.setPose(pose));
    this.framePose = useSono.getState().pose;
    this.worker = new Worker(new URL("../workers/sim.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<FromWorker>) => this.onMessage(event.data);
    this.worker.onerror = (event) => console.error("Simulation worker failed:", event.message);
    const volume = new Uint8Array(data.volume.data);
    const radius = new Float32Array(data.surface.radius);
    this.post(
      {
        type: "init",
        dims: data.json.volume.dims,
        spacing: data.json.volume.spacing,
        origin: data.json.volume.origin,
        data: volume,
        surface: { ...data.json.surface, radius },
        organs: data.json.organs,
      },
      [volume.buffer, radius.buffer],
    );
    this.unsubscribe = useSono.subscribe((state, previous) => {
      if (
        state.pose !== previous.pose ||
        state.settings !== previous.settings ||
        state.taskId !== previous.taskId ||
        state.breathing !== previous.breathing ||
        state.frozen !== previous.frozen ||
        state.anatomy !== previous.anatomy ||
        state.ct !== previous.ct
      ) {
        this.dirty = true;
      }
      if (state.ct && this.ctState === "none") void this.fetchCt();
      if (state.frozen && (state.cineIndex !== previous.cineIndex || state.anatomy !== previous.anatomy || state.ct !== previous.ct)) {
        this.reviewDirty = true;
      }
      if (caseKey(state) !== caseKey(previous)) this.syncCase(state);
    });
    // Loaded for an exam or a case already chosen (a new patient for it, or a shared link).
    const state = useSono.getState();
    if (caseKey(state) !== "variant:normal") this.syncCase(state);
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Make the patient the store asks for: an exam case's findings, or a teaching case. */
  private syncCase(state: SonoState): void {
    // A new patient: old recordings no longer match it.
    this.cine.length = 0;
    if (state.exam) this.post({ type: "case", key: state.exam.case.code, specs: [...state.exam.case.specs] });
    else this.post({ type: "variant", variant: state.variant });
    this.dirty = true;
  }

  /** Where to hold the probe to show a point (world mm), and the breath; null if nowhere can. */
  aimAt(point: Vec3, depthMm: number, through?: readonly number[]): Promise<Aim | null> {
    const id = ++this.measureId;
    return new Promise((resolve) => {
      this.aimWaiters.set(id, resolve);
      this.post({ type: "aim", id, point: [point[0], point[1], point[2]], depthMm, through: through ? [...through] : undefined });
    });
  }

  attachCanvas(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
    this.context = canvas?.getContext("2d") ?? null;
    if (canvas) {
      canvas.width = this.width;
      canvas.height = this.height;
    }
    this.dirty = true;
  }

  /** Render at this many device pixels across (the screen's size), within limits. */
  setImageWidth(pixels: number): void {
    const width = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, pixels)) / 8) * 8;
    if (width === this.width) return;
    this.width = width;
    this.height = Math.round(width / IMAGE_ASPECT);
    if (this.canvas) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }
    this.dirty = true;
  }

  get imageCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  get latest(): FrameInfo | null {
    return this.lastInfo;
  }

  /** The recorded frames, oldest first (cine review). */
  get cineFrames(): readonly CineFrame[] {
    return this.cine;
  }

  onFrame(listener: (info: FrameInfo) => void): () => void {
    this.listeners.add(listener);
    if (this.lastInfo) listener(this.lastInfo);
    return () => this.listeners.delete(listener);
  }

  /** The current teaching case's findings, as surfaces (empty for the patient as scanned). */
  onFindings(listener: (findings: FindingMesh[]) => void): () => void {
    this.findingListeners.add(listener);
    listener(this.findings);
    return () => this.findingListeners.delete(listener);
  }

  /** Probe frame for the current pose (for the 3D view while dragging). */
  frameFor(pose: ProbePose): ProbeFrame {
    return frameFromPose(this.skin, pose, useSono.getState().settings.pressure);
  }

  setPose(pose: ProbePose): void {
    this.animation = null;
    useSono.getState().setPose(clampPose(pose, this.skin));
  }

  /** Glide the probe to a pose (used by "Show me"). */
  animateTo(pose: ProbePose, duration = 1400): void {
    this.animation = { from: useSono.getState().pose, to: clampPose(pose, this.skin), start: performance.now(), duration };
  }

  /** Whether the CT is ready (for the CT view's status). */
  get ctReady(): boolean {
    return this.ctState === "ready";
  }

  private async fetchCt(): Promise<void> {
    const grid = this.data.json.ct;
    if (!grid) return;
    this.ctState = "loading";
    try {
      const data = await loadCt(this.data.json.id);
      this.post({ type: "ct", dims: grid.dims, spacing: grid.spacing, origin: grid.origin, data }, [data.buffer]);
      this.ctState = "ready";
      this.dirty = true;
      this.reviewDirty = useSono.getState().frozen;
    } catch (err) {
      console.error("Could not load the CT:", err);
      this.ctState = "none";
      useSono.getState().setCt(false);
    }
  }

  /** True in-plane cross-section of an organ at the current pose (for grading measurements). */
  measure(organ: OrganKey): Promise<CrossSection> {
    const id = ++this.measureId;
    return new Promise((resolve) => {
      this.waiters.set(id, resolve);
      // Measure in the plane on screen: in cine review, the recorded frame's.
      const shown = this.lastInfo;
      this.post({ type: "measure", id, pose: shown?.pose ?? useSono.getState().pose, organ, breath: shown?.breath ?? 0 });
    });
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.drive.dispose();
    this.unsubscribe();
    this.worker.terminate();
  }

  private readonly tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    if (this.animation) {
      const { from, to, start, duration } = this.animation;
      const t = Math.min(1, (now - start) / duration);
      useSono.getState().setPose(lerpPose(from, to, t));
      if (t >= 1) this.animation = null;
    }
    // Read the state after the animation step, so the pose we render is the one just set.
    const state = useSono.getState();
    if (!this.ready || this.inFlight) return;
    if (state.frozen) {
      // The frame on screen is the last one recorded unless the cine is being reviewed.
      if (this.reviewDirty && this.cine.length > 0) this.review(state.cineIndex ?? this.cine.length - 1, state.anatomy);
      return;
    }
    // Breathing and colour Doppler (the cardiac cycle) change the image even when nothing else does.
    const live = state.breathing === "normal" || state.settings.doppler === "color";
    if (!this.dirty && !live) return;
    // Quiet breathing moves the organs about half as far as a deep breath in.
    const breath =
      state.breathing === "inspire" ? 1 : state.breathing === "expire" ? 0 : 0.25 - 0.25 * Math.cos((2 * Math.PI * now) / BREATH_PERIOD_MS);
    this.dirty = false;
    this.inFlight = true;
    this.framePose = state.pose;
    this.frameBreath = breath;
    this.framePressure = state.settings.pressure;
    const settings = { ...state.settings, breath, timeMs: now };
    this.post({
      type: "render",
      id: ++this.renderId,
      pose: state.pose,
      settings,
      width: this.width,
      height: this.height,
      task: state.mode === "tasks" ? state.taskId : null,
      anatomy: state.anatomy ? 0.5 : 0,
      ct: state.ct && this.ctState === "ready" ? 0.5 : 0,
    });
    this.cine.push({ pose: state.pose, settings, breath, at: now });
    if (this.cine.length > CINE_FRAMES) this.cine.shift();
  };

  /** Render recorded frame `index` again, for cine review (the image is frozen meanwhile). */
  private review(index: number, anatomy: boolean): void {
    const frame = this.cine[Math.max(0, Math.min(this.cine.length - 1, index))];
    this.reviewDirty = false;
    if (!frame) return;
    this.inFlight = true;
    this.framePose = frame.pose;
    this.frameBreath = frame.breath;
    this.framePressure = frame.settings.pressure;
    this.post({
      type: "render",
      id: ++this.renderId,
      pose: frame.pose,
      settings: { ...frame.settings, breath: frame.breath },
      width: this.width,
      height: this.height,
      task: null,
      anatomy: anatomy ? 0.5 : 0,
      ct: useSono.getState().ct && this.ctState === "ready" ? 0.5 : 0,
      review: true,
    });
  }

  private onMessage(message: FromWorker): void {
    switch (message.type) {
      case "ready":
        this.ready = true;
        this.dirty = true;
        break;
      case "frame":
        this.onRendered(message);
        break;
      case "measured":
        this.waiters.get(message.id)?.(message.section);
        this.waiters.delete(message.id);
        break;
      case "variant": {
        const state = useSono.getState();
        // Ignore a late answer for a case already replaced.
        if (state.exam || message.variant !== state.variant) break;
        state.setCaseInfo({ variant: message.variant, facts: message.facts, focus: message.focus });
        this.findings = message.findings;
        for (const listener of this.findingListeners) listener(this.findings);
        this.dirty = true;
        break;
      }
      case "case": {
        const state = useSono.getState();
        if (!state.exam || state.exam.case.code !== message.key) break;
        state.setExamMade({ code: message.key, findings: message.findings, truth: message.truth, liverMiddleX: message.liverMiddleX });
        this.findings = message.meshes;
        for (const listener of this.findingListeners) listener(this.findings);
        this.dirty = true;
        break;
      }
      case "aimed":
        this.aimWaiters.get(message.id)?.(message.pose ? { pose: message.pose, breath: message.breath } : null);
        this.aimWaiters.delete(message.id);
        break;
      case "error":
        console.error("Simulation worker:", message.message);
        this.inFlight = false;
        break;
    }
  }

  private onRendered(message: FrameMessage): void {
    this.inFlight = false;
    const state = useSono.getState();
    // Frozen, only cine review frames reach the screen.
    if (this.context && (!state.frozen || message.review)) {
      this.context.putImageData(new ImageData(message.image, message.width, message.height), 0, 0);
    }
    this.post({ type: "recycle", buffer: message.image.buffer }, [message.image.buffer]);
    const info: FrameInfo = {
      pose: this.framePose,
      frame: frameFromPose(this.skin, this.framePose, this.framePressure),
      view: message.view,
      geometry: message.geometry,
      organs: message.organs,
      contact: message.contact,
      width: message.width,
      height: message.height,
      anatomy: message.anatomy,
      ms: message.ms,
      breath: this.frameBreath,
      gate: message.gate,
      ct: message.ct,
    };
    this.lastInfo = info;
    for (const listener of this.listeners) listener(info);
    if (!message.review && (message.coach !== null || state.coach !== null)) state.setCoach(message.coach);
    const now = performance.now();
    if (now - this.lastStats > 500) {
      this.lastStats = now;
      state.setStats({ ms: message.ms, contact: message.contact });
    }
  }

  private post(message: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(message, transfer);
  }
}
