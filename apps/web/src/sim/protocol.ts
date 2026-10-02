import type {
  Advice,
  CaseTruth,
  CrossSection,
  FindingSpec,
  GateSample,
  ImageSettings,
  ImageView,
  OrganInfo,
  OrganKey,
  OrganView,
  ProbePose,
  ScanGeometry,
  ScoreParts,
  Variant,
  Vec3,
} from "@insonate/sono-engine";

export type Pixels = Uint8ClampedArray<ArrayBuffer>;

export interface InitMessage {
  type: "init";
  dims: [number, number, number];
  spacing: [number, number, number];
  origin: Vec3;
  data: Uint8Array<ArrayBuffer>;
  surface: { center: [number, number]; z0: number; dz: number; rows: number; columns: number; radius: Float32Array<ArrayBuffer> };
  organs: OrganInfo[];
}

export interface RenderMessage {
  type: "render";
  id: number;
  pose: ProbePose;
  settings: ImageSettings;
  width: number;
  height: number;
  /** Active training task, if any: the coach scores every frame against it. */
  task: string | null;
  /** Also send the tissue map of the image (for the anatomy overlay), at this fraction of the image size. */
  anatomy: number;
  /** Also send the CT cut in the image plane, at this fraction of the image size (0: no). */
  ct: number;
  /** Cine review: render a recorded frame again (no persistence, no coach). */
  review?: boolean;
}

/** The tissue class under each pixel of a reduced copy of the image (0 outside the fan). */
export interface AnatomyMap {
  readonly width: number;
  readonly height: number;
  readonly classes: Uint8Array<ArrayBuffer>;
}

export type ToWorker =
  | InitMessage
  | RenderMessage
  | { type: "measure"; id: number; pose: ProbePose; organ: OrganKey; breath: number }
  | { type: "recycle"; buffer: ArrayBuffer }
  | { type: "variant"; variant: Variant }
  /** An exam case: the patient as scanned, with these findings. */
  | { type: "case"; key: string; specs: FindingSpec[] }
  /** Find a probe position that shows a point (for "Show me" on a finding). */
  | { type: "aim"; id: number; point: Vec3; depthMm: number; through?: number[] }
  | {
      type: "ct";
      dims: [number, number, number];
      spacing: [number, number, number];
      origin: Vec3;
      data: Uint8Array<ArrayBuffer>;
    };

/** The CT in the image plane (0 outside the fan, 1–255 gray inside), at a reduced size. */
export interface CtMap {
  readonly width: number;
  readonly height: number;
  readonly gray: Uint8Array<ArrayBuffer>;
}

/** A finding of a teaching case, as a surface for the 3D view. */
export interface FindingMesh {
  readonly name: string;
  readonly positions: Float32Array<ArrayBuffer>;
  readonly indices: Uint32Array<ArrayBuffer>;
  /** Moves with breathing (it lies in or on an organ that does). */
  readonly breathes: boolean;
}

/** The patient changed into a teaching case. */
export interface VariantMessage {
  type: "variant";
  variant: Variant;
  facts: Readonly<Record<string, number>>;
  focus: Vec3 | null;
  findings: FindingMesh[];
}

/** The exam case as made: each finding (did it fit, its sizes, where), the measurements, its surfaces. */
export interface CaseMessage {
  type: "case";
  key: string;
  findings: Array<{ spec: FindingSpec; applied: boolean; facts: Readonly<Record<string, number>>; focus: Vec3 | null }>;
  truth: CaseTruth;
  liverMiddleX: number | null;
  meshes: FindingMesh[];
}

export interface CoachResult {
  taskId: string;
  parts: ScoreParts;
  /** Geometry × how well the organ is actually seen in this frame. */
  live: number;
  hint: { kind: string; text: string; advice: Advice } | null;
}

export interface FrameMessage {
  type: "frame";
  id: number;
  image: Pixels;
  width: number;
  height: number;
  view: ImageView;
  geometry: ScanGeometry;
  organs: Partial<Record<OrganKey, OrganView>>;
  contact: number;
  coach: CoachResult | null;
  anatomy: AnatomyMap | null;
  /** PW Doppler: the blood in the sample volume. */
  gate: GateSample | null;
  ct: CtMap | null;
  ms: number;
  review: boolean;
}

export type FromWorker =
  | { type: "ready" }
  | FrameMessage
  | VariantMessage
  | CaseMessage
  | { type: "aimed"; id: number; pose: ProbePose | null; breath: 0 | 1 }
  | { type: "measured"; id: number; organ: OrganKey; section: CrossSection }
  | { type: "error"; message: string };
