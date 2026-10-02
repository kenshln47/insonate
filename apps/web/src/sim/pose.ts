import {
  add,
  clamp,
  dot,
  frameFromPose,
  normalize,
  type ProbePose,
  REACHABLE_PHI,
  type SkinSurface,
  scale,
  sub,
  type Vec3,
  worldToPlane,
  wrapDeg,
} from "@insonate/sono-engine";

export const POSE_LIMITS = {
  tilt: 60,
  rock: 40,
} as const;

/** Keep a pose on the reachable skin of a supine patient and within sensible angles. */
export function clampPose(pose: ProbePose, skin: SkinSurface): ProbePose {
  return {
    phiDeg: clamp(pose.phiDeg, REACHABLE_PHI[0], REACHABLE_PHI[1]),
    zMm: clamp(pose.zMm, skin.zMin + 25, skin.zMax - 25),
    rotationDeg: wrapDeg(pose.rotationDeg),
    tiltDeg: clamp(pose.tiltDeg, -POSE_LIMITS.tilt, POSE_LIMITS.tilt),
    rockDeg: clamp(pose.rockDeg, -POSE_LIMITS.rock, POSE_LIMITS.rock),
  };
}

export type Move =
  | "head"
  | "feet"
  | "around-left"
  | "around-right"
  | "rotate-ccw"
  | "rotate-cw"
  | "fan-up"
  | "fan-down"
  | "rock-marker"
  | "rock-away";

/** What a move changes: sliding is in millimetres on the skin, the others in degrees. */
export type MoveAxis = "slide" | "rotate" | "fan" | "rock";

export function moveAxis(move: Move): MoveAxis {
  switch (move) {
    case "head":
    case "feet":
    case "around-left":
    case "around-right":
      return "slide";
    case "rotate-ccw":
    case "rotate-cw":
      return "rotate";
    case "fan-up":
    case "fan-down":
      return "fan";
    case "rock-marker":
    case "rock-away":
      return "rock";
  }
}

/** Move the probe by `amount`: millimetres along the skin for slides, degrees for the rest. */
export function shiftPose(pose: ProbePose, move: Move, amount: number, skin: SkinSurface): ProbePose {
  switch (move) {
    case "head":
      return { ...pose, zMm: pose.zMm + amount };
    case "feet":
      return { ...pose, zMm: pose.zMm - amount };
    case "around-left":
      return { ...pose, phiDeg: pose.phiDeg - amount / skin.mmPerDegree(pose.phiDeg, pose.zMm) };
    case "around-right":
      return { ...pose, phiDeg: pose.phiDeg + amount / skin.mmPerDegree(pose.phiDeg, pose.zMm) };
    case "rotate-ccw":
      return { ...pose, rotationDeg: pose.rotationDeg - amount };
    case "rotate-cw":
      return { ...pose, rotationDeg: pose.rotationDeg + amount };
    case "fan-up":
      return { ...pose, tiltDeg: pose.tiltDeg + amount };
    case "fan-down":
      return { ...pose, tiltDeg: pose.tiltDeg - amount };
    case "rock-marker":
      return { ...pose, rockDeg: pose.rockDeg + amount };
    case "rock-away":
      return { ...pose, rockDeg: pose.rockDeg - amount };
  }
}

/**
 * Slide the probe on the skin by a displacement in the image's own directions: `along` mm toward
 * the marker (the image's left side), `across` mm through the image plane. This is how the hand
 * moves when the student drags the image: the anatomy follows the pointer.
 */
export function slideInImage(pose: ProbePose, skin: SkinSurface, along: number, across: number): ProbePose {
  const frame = frameFromPose(skin, pose);
  const v = add(scale(frame.lateral, along), scale(frame.elevation, across));
  // Around the body: the skin's direction of increasing φ at the probe (the rest is toward the head).
  const before = skin.at(pose.phiDeg - 0.5, pose.zMm).position;
  const after = skin.at(pose.phiDeg + 0.5, pose.zMm).position;
  const around = normalize(sub(after, before));
  return {
    ...pose,
    phiDeg: pose.phiDeg + dot(v, around) / skin.mmPerDegree(pose.phiDeg, pose.zMm),
    zMm: pose.zMm + v[2],
  };
}

/**
 * The probe in the hand while the student drags the image: the pose and the grabbed anatomy (a world
 * point) at the moment of the grab, how far the hand has slid it (mm toward the marker), heel–toed it
 * (degrees) and fanned it (the tilt, degrees) since, and where the point was last asked to go.
 */
export interface Grip {
  readonly pose: ProbePose;
  readonly point: Vec3;
  readonly slide: number;
  readonly rock: number;
  readonly tiltDeg: number;
  readonly target: number;
}

export function gripAt(pose: ProbePose, point: Vec3, skin: SkinSurface): Grip {
  const target = worldToPlane(frameFromPose(skin, pose), point).a;
  return { pose, point, slide: 0, rock: 0, tiltDeg: pose.tiltDeg, target };
}

/** Heel–toe that bringing a point may use, at most (degrees either way). */
const ROCK_ASSIST = 30;
/** Fanning that keeps a grabbed point in the plane may use, at most (degrees from the grab). */
const FAN_ASSIST = 12;
/**
 * What the hand would rather not do, as a cost per mm of slide and per degree of heel–toe since the
 * grab (square roots of the weights). Small enough never to stop a point following; large enough that
 * where sliding barely moves a deep point (under a curving costal margin), the hand heel–toes instead
 * of sliding a long way, and undoes the heel–toe when sliding can do the job again.
 */
const SLIDE_COST = 0.03;
const ROCK_COST = 0.1;
/** The most one solver step may change slide (mm), heel–toe and fan (degrees). */
const TRUST = [4, 2, 2];
/**
 * How far the hand may move per mm the pointer asks the point to move, plus a little: the probe
 * stays as smooth as the pointer, and where the anatomy cannot keep up, it lags rather than the
 * probe leaping.
 */
const GAIN = [3, 1.5, 1.5];

/**
 * Bring the grabbed anatomy to lateral position `targetA` (mm toward the marker; 0 is the middle of
 * the image), as a sonographer does: slide toward it, heel–toe where sliding only swings the beam past
 * it, and fan the plane back onto it when an oblique slide on a curved body carries it out of the plane.
 *
 * A small damped least-squares solve (Levenberg–Marquardt) over slide, heel–toe and fan, started from
 * where the hand already is: every step is small and must bring the point closer, so the probe never
 * leaps to some far-off spot that also happens to fit, and where nothing reaches the target it stops
 * as close as it gets.
 */
export function bring(grip: Grip, skin: SkinSurface, targetA: number, iterations = 6): { grip: Grip; pose: ProbePose } {
  const { pose, point } = grip;
  const start = [grip.slide, grip.rock, grip.tiltDeg];
  const asked = Math.abs(targetA - grip.target);
  const low = [Number.NEGATIVE_INFINITY, Math.min(0, -ROCK_ASSIST - pose.rockDeg), pose.tiltDeg - FAN_ASSIST].map((v, k) =>
    Math.max(v, start[k] - GAIN[k] * asked - 1),
  );
  const high = [Number.POSITIVE_INFINITY, Math.max(0, ROCK_ASSIST - pose.rockDeg), pose.tiltDeg + FAN_ASSIST].map((v, k) =>
    Math.min(v, start[k] + GAIN[k] * asked + 1),
  );
  const posed = (x: readonly number[]): ProbePose => ({
    ...slideInImage(pose, skin, x[0], 0),
    rockDeg: pose.rockDeg + x[1],
    tiltDeg: x[2],
  });
  // What is wrong with a hand position: the point's miss across the image and out of the plane, and the effort.
  const residual = (x: readonly number[]): number[] => {
    const p = worldToPlane(frameFromPose(skin, posed(x)), point);
    return [p.a - targetA, p.off, SLIDE_COST * x[0], ROCK_COST * x[1]];
  };
  const size = (r: readonly number[]) => r.reduce((sum, v) => sum + v * v, 0);
  let x = [grip.slide, grip.rock, grip.tiltDeg];
  let r = residual(x);
  let damping = 0.02;
  const DELTA = [1, 0.5, 0.5];
  for (let i = 0; i < iterations && Math.hypot(r[0], r[1]) > 0.1; i++) {
    // How each residual changes per mm of slide, per degree of heel–toe and of fan.
    const columns = DELTA.map((h, k) => {
      const y = [...x];
      y[k] += h;
      return residual(y).map((v, j) => (v - r[j]) / h);
    });
    let improved = false;
    for (let attempt = 0; attempt < 5 && !improved; attempt++) {
      // (JᵀJ + λ·diag) Δ = −Jᵀr
      const a = columns.map((ci, p) => columns.map((cj, q) => ci.reduce((sum, v, j) => sum + v * cj[j], 0) * (p === q ? 1 + damping : 1)));
      for (let p = 0; p < 3; p++) a[p][p] += damping * 0.05;
      const b = columns.map((c) => -c.reduce((sum, v, j) => sum + v * r[j], 0));
      const step = solve3(a, b);
      const within = Math.min(1, ...step.map((v, k) => TRUST[k] / Math.max(1e-9, Math.abs(v))));
      const next = x.map((v, k) => clamp(v + step[k] * within, Math.min(low[k], v), Math.max(high[k], v)));
      const tried = residual(next);
      if (size(tried) < size(r)) {
        x = next;
        r = tried;
        damping = Math.max(1e-4, damping / 3);
        improved = true;
      } else {
        damping *= 4;
      }
    }
    if (!improved) break;
  }
  return { grip: { ...grip, slide: x[0], rock: x[1], tiltDeg: x[2], target: targetA }, pose: posed(x) };
}

/** Solve a 3×3 linear system (Cramer's rule); a singular one gives no step. */
function solve3(a: readonly (readonly number[])[], b: readonly number[]): number[] {
  const det = (m: readonly (readonly number[])[]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(a);
  if (Math.abs(d) < 1e-12) return [0, 0, 0];
  return [0, 1, 2].map((k) => det(a.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)))) / d);
}

/** One step of each kind (mm or degrees), normal and fine. */
const STEPS: Readonly<Record<MoveAxis, readonly [number, number]>> = {
  slide: [4, 1.5],
  rotate: [4.5, 1.5],
  fan: [3, 1],
  rock: [3, 1],
};

/** Apply one small probe movement. `fine` uses smaller steps. */
export function movePose(pose: ProbePose, move: Move, skin: SkinSurface, fine = false): ProbePose {
  return shiftPose(pose, move, STEPS[moveAxis(move)][fine ? 1 : 0], skin);
}

/** Smoothly interpolate between two poses (shortest way round for rotation). */
export function lerpPose(a: ProbePose, b: ProbePose, t: number): ProbePose {
  const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const mix = (x: number, y: number) => x + (y - x) * e;
  return {
    phiDeg: mix(a.phiDeg, b.phiDeg),
    zMm: mix(a.zMm, b.zMm),
    rotationDeg: a.rotationDeg + wrapDeg(b.rotationDeg - a.rotationDeg) * e,
    tiltDeg: mix(a.tiltDeg, b.tiltDeg),
    rockDeg: mix(a.rockDeg, b.rockDeg),
  };
}

/** Named starting positions, in sonographers' terms (names are in the language files). */
export const QUICK_POSITIONS: ReadonlyArray<{ id: string; pose: ProbePose }> = [
  { id: "epigastric", pose: { phiDeg: 0, zMm: 105, rotationDeg: 90, tiltDeg: 15, rockDeg: 0 } },
  { id: "ruq", pose: { phiDeg: 40, zMm: 40, rotationDeg: 55, tiltDeg: -25, rockDeg: 0 } },
  { id: "right-flank", pose: { phiDeg: 98, zMm: 60, rotationDeg: 8, tiltDeg: 8, rockDeg: 0 } },
  { id: "left-flank", pose: { phiDeg: -105, zMm: 95, rotationDeg: -25, tiltDeg: 0, rockDeg: 0 } },
  { id: "midline", pose: { phiDeg: -5, zMm: 60, rotationDeg: 0, tiltDeg: 0, rockDeg: 0 } },
  { id: "suprapubic", pose: { phiDeg: 0, zMm: -160, rotationDeg: 90, tiltDeg: 10, rockDeg: 0 } },
];
