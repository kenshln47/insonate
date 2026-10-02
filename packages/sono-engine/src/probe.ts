import { cross, madd, normalize, rad, rotate, type Vec3 } from "./math";
import type { SkinSurface } from "./surface";

export type ProbeKind = "curvilinear" | "linear";

export interface ProbeSpec {
  readonly kind: ProbeKind;
  readonly name: string;
  /** Model name in the usual style: type, highest and lowest frequency (MHz). */
  readonly model: string;
  /** Radius of the curved face (curvilinear), mm. */
  readonly faceRadiusMm: number;
  /** Sector angle (curvilinear), degrees. */
  readonly fovDeg: number;
  /** Face width (linear), mm. */
  readonly widthMm: number;
  readonly lines: number;
  readonly frequencyMHz: number;
  readonly frequencyRange: readonly [number, number];
  readonly depthMm: number;
  readonly depthRange: readonly [number, number];
}

export const PROBES: Readonly<Record<ProbeKind, ProbeSpec>> = {
  curvilinear: {
    kind: "curvilinear",
    name: "Curvilinear (abdominal)",
    model: "C6-2",
    faceRadiusMm: 50,
    fovDeg: 68,
    widthMm: 0,
    lines: 192,
    frequencyMHz: 3.5,
    frequencyRange: [2, 6],
    depthMm: 160,
    depthRange: [40, 240],
  },
  linear: {
    kind: "linear",
    name: "Linear (high frequency)",
    model: "L14-5",
    faceRadiusMm: 0,
    fovDeg: 0,
    widthMm: 40,
    lines: 160,
    frequencyMHz: 8,
    frequencyRange: [5, 14],
    depthMm: 60,
    depthRange: [20, 100],
  },
};

/**
 * How the probe is held, in sonographers' terms.
 * - φ / z: where it sits on the skin (angle around the body, height along it).
 * - rotation: 0° = longitudinal (marker toward the head), 90° = transverse (marker toward the patient's right).
 * - tilt (fanning): sweeps the beam out of the image plane.
 * - rock (heel–toe): angles the beam within the image plane.
 */
export interface ProbePose {
  phiDeg: number;
  zMm: number;
  rotationDeg: number;
  tiltDeg: number;
  rockDeg: number;
}

/** The scan plane in world space. */
export interface ProbeFrame {
  /** Centre of the probe face on the skin. */
  readonly origin: Vec3;
  /** Unit vector into the body along the central beam. */
  readonly beam: Vec3;
  /** Unit vector along the face, toward the probe marker (shown on the left of the image). */
  readonly lateral: Vec3;
  /** Unit normal of the image plane. */
  readonly elevation: Vec3;
  /** Outward skin normal at the contact point. */
  readonly skinNormal: Vec3;
}

/**
 * Graded compression: how far (mm) firm pressure sinks the probe face into the abdominal wall, and
 * how deep (mm below the face) it pushes gas-filled bowel aside, at full pressure.
 */
export const PRESS_WALL_MM = 12;
export const PRESS_CLEAR_MM = 75;

/** The scan plane for a pose; `pressure` (0–1) sinks the face into the wall along the beam. */
export function frameFromPose(skin: SkinSurface, pose: ProbePose, pressure = 0): ProbeFrame {
  const point = skin.at(pose.phiDeg, pose.zMm);
  const n = point.normal;
  const head = point.towardHead;
  const right = normalize(cross(n, head));
  const theta = rad(pose.rotationDeg);
  let lateral = normalize([
    head[0] * Math.cos(theta) + right[0] * Math.sin(theta),
    head[1] * Math.cos(theta) + right[1] * Math.sin(theta),
    head[2] * Math.cos(theta) + right[2] * Math.sin(theta),
  ]);
  let beam: Vec3 = [-n[0], -n[1], -n[2]];
  // Fanning: rotate the beam about the probe's long axis.
  beam = normalize(rotate(beam, lateral, rad(pose.tiltDeg)));
  // Heel–toe: rotate beam and face about the plane normal.
  const elevation0 = normalize(cross(lateral, beam));
  beam = normalize(rotate(beam, elevation0, rad(pose.rockDeg)));
  lateral = normalize(rotate(lateral, elevation0, rad(pose.rockDeg)));
  const elevation = normalize(cross(lateral, beam));
  const sink = Math.max(0, Math.min(1, pressure)) * PRESS_WALL_MM;
  const origin = sink > 0 ? madd(point.position, beam, sink) : point.position;
  return { origin, beam, lateral, elevation, skinNormal: n };
}

/** Geometry of the acquired image in its own plane: a = toward marker (mm), d = depth (mm). */
export interface ScanGeometry {
  readonly kind: ProbeKind;
  readonly lines: number;
  readonly samples: number;
  readonly depthMm: number;
  readonly sampleMm: number;
  readonly faceRadiusMm: number;
  readonly fovRad: number;
  readonly widthMm: number;
}

export function scanGeometry(spec: ProbeSpec, depthMm: number, samplesPerMm = 3): ScanGeometry {
  return {
    kind: spec.kind,
    lines: spec.lines,
    samples: Math.round(depthMm * samplesPerMm),
    depthMm,
    sampleMm: 1 / samplesPerMm,
    faceRadiusMm: spec.faceRadiusMm,
    fovRad: rad(spec.fovDeg),
    widthMm: spec.widthMm,
  };
}

/** Start point (a, d) and unit direction (da, dd) of scanline `line` in plane coordinates. */
export function scanline(g: ScanGeometry, line: number): { a: number; d: number; da: number; dd: number } {
  const u = g.lines > 1 ? line / (g.lines - 1) : 0.5;
  if (g.kind === "curvilinear") {
    const alpha = (0.5 - u) * g.fovRad; // line 0 on the marker side
    const r = g.faceRadiusMm;
    return { a: r * Math.sin(alpha), d: -r + r * Math.cos(alpha), da: Math.sin(alpha), dd: Math.cos(alpha) };
  }
  return { a: (0.5 - u) * g.widthMm, d: 0, da: 0, dd: 1 };
}

/** Rounding slack so the outermost scanlines count as inside the image. */
const EDGE = 1e-9;

/** Plane coordinates → (fractional line, fractional sample), or null outside the image. */
export function planeToPolar(g: ScanGeometry, a: number, d: number): { line: number; sample: number } | null {
  let u: number;
  let t: number;
  if (g.kind === "curvilinear") {
    const r = g.faceRadiusMm;
    u = 0.5 - Math.atan2(a, d + r) / g.fovRad;
    t = Math.hypot(a, d + r) - r;
  } else {
    u = 0.5 - a / g.widthMm;
    t = d;
  }
  if (u < -EDGE || u > 1 + EDGE || t < -EDGE || t > g.depthMm + EDGE) return null;
  return { line: Math.min(1, Math.max(0, u)) * (g.lines - 1), sample: Math.max(0, t) / g.sampleMm };
}

/** Bounding box of the image in plane coordinates. */
export function planeExtent(g: ScanGeometry): { aMin: number; aMax: number; dMin: number; dMax: number } {
  if (g.kind === "curvilinear") {
    const r = g.faceRadiusMm;
    const half = g.fovRad / 2;
    const outer = r + g.depthMm;
    return {
      aMin: -outer * Math.sin(half),
      aMax: outer * Math.sin(half),
      dMin: -r + r * Math.cos(half),
      dMax: g.depthMm,
    };
  }
  return { aMin: -g.widthMm / 2, aMax: g.widthMm / 2, dMin: 0, dMax: g.depthMm };
}

/** World position of plane coordinates (a toward the marker, d into the body). */
export function planeToWorld(frame: ProbeFrame, a: number, d: number): Vec3 {
  return madd(madd(frame.origin, frame.lateral, a), frame.beam, d);
}

/** Plane coordinates of a world position (and its distance from the plane). */
export function worldToPlane(frame: ProbeFrame, p: Vec3): { a: number; d: number; off: number } {
  const v: Vec3 = [p[0] - frame.origin[0], p[1] - frame.origin[1], p[2] - frame.origin[2]];
  return {
    a: v[0] * frame.lateral[0] + v[1] * frame.lateral[1] + v[2] * frame.lateral[2],
    d: v[0] * frame.beam[0] + v[1] * frame.beam[1] + v[2] * frame.beam[2],
    off: v[0] * frame.elevation[0] + v[1] * frame.elevation[1] + v[2] * frame.elevation[2],
  };
}
