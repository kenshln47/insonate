import { REACHABLE_PHI } from "./coach";
import type { Vec3 } from "./math";
import { frameFromPose, type ProbePose, worldToPlane } from "./probe";
import type { SkinSurface } from "./surface";
import { isGas, TISSUE } from "./tissues";
import { type ClassVolume, sampleClass } from "./volume";

/**
 * Aim the probe at a point: where on the skin, and how held, to show it. Used for "Show me" on
 * findings that can be anywhere (a cyst, a metastasis, a stone): the point must lie in the image
 * plane, near the middle of the sector at a comfortable depth, with no bone, gas or aerated lung
 * on the way in, and the probe held the way a sonographer would (little fanning or heel-toe).
 */
export interface AimResult {
  readonly pose: ProbePose;
  /** 0–100: how well the point is shown. */
  readonly score: number;
  /** Depth of the point in the image (mm). */
  readonly depthMm: number;
}

/** Image orientations tried: longitudinal, transverse and the oblique views between. */
const ROTATIONS = [0, 30, 60, 90, -30, -60];

export interface AimOptions {
  /**
   * Tissues the beam should reach the point through (a pleural effusion is seen through the liver or
   * spleen, below the diaphragm): views whose last stretch runs through them are preferred.
   */
  readonly through?: readonly number[];
}

export function aimAt(volume: ClassVolume, skin: SkinSurface, target: Vec3, depthMm: number, options: AimOptions = {}): AimResult | null {
  const candidates: Array<{ pose: ProbePose; geometry: number; d: number }> = [];
  const zLo = Math.max(skin.zMin + 5, target[2] - 100);
  const zHi = Math.min(skin.zMax - 5, target[2] + 100);
  for (let phi = REACHABLE_PHI[0]; phi <= REACHABLE_PHI[1]; phi += 6) {
    for (let z = zLo; z <= zHi; z += 10) {
      const origin = skin.at(phi, z).position;
      const distance = Math.hypot(target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]);
      if (distance > depthMm - 12 || distance < 20) continue;
      for (const rotation of ROTATIONS) {
        const placed = placeInPlane(skin, target, { phiDeg: phi, zMm: z, rotationDeg: rotation, tiltDeg: 0, rockDeg: 0 });
        if (placed) candidates.push(placed);
      }
    }
  }
  if (candidates.length === 0) return null;
  // Only the geometrically best few hundred are worth tracing rays through.
  candidates.sort((a, b) => b.geometry - a.geometry);
  const through = options.through ? tissueSet(options.through) : null;
  let best: AimResult | null = null;
  for (const candidate of candidates.slice(0, through ? 700 : 300)) {
    const open = acousticWindow(volume, skin, candidate.pose, target);
    if (open === 0) continue;
    const window = through ? 0.35 + 0.65 * throughShare(volume, skin, candidate.pose, target, through) : 1;
    const score = candidate.geometry * open * window;
    if (!best || score > best.score) best = { pose: candidate.pose, score, depthMm: candidate.d };
  }
  return best;
}

function tissueSet(tissues: readonly number[]): Uint8Array {
  const set = new Uint8Array(256);
  for (const t of tissues) set[t] = 1;
  return set;
}

/** 0–1: the share of the way in, over its last two thirds, that runs through the wanted tissues. */
function throughShare(volume: ClassVolume, skin: SkinSurface, pose: ProbePose, target: Vec3, through: Uint8Array): number {
  const start = frameFromPose(skin, pose).origin;
  let inside = 0;
  let total = 0;
  for (let t = 0.33; t < 0.96; t += 0.03) {
    total++;
    const c = sampleClass(volume, [
      start[0] + (target[0] - start[0]) * t,
      start[1] + (target[1] - start[1]) * t,
      start[2] + (target[2] - start[2]) * t,
    ]);
    if (through[c]) inside++;
  }
  return total > 0 ? inside / total : 0;
}

/**
 * Fan the probe until the point is in the image plane, then heel-toe (a little) to bring it to the
 * middle of the sector. Null when no fanning within ±45° reaches it.
 */
function placeInPlane(skin: SkinSurface, target: Vec3, pose: ProbePose): { pose: ProbePose; geometry: number; d: number } | null {
  const off = (tilt: number) => worldToPlane(frameFromPose(skin, { ...pose, tiltDeg: tilt }), target).off;
  let lo = -45;
  let hi = 45;
  let fLo = off(lo);
  const fHi = off(hi);
  if (fLo * fHi > 0) return null;
  for (let step = 0; step < 16; step++) {
    const mid = (lo + hi) / 2;
    const fMid = off(mid);
    if (fMid * fLo <= 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  const tilt = (lo + hi) / 2;
  let placed = { ...pose, tiltDeg: tilt };
  let plane = worldToPlane(frameFromPose(skin, placed), target);
  if (plane.d <= 0) return null;
  // Heel–toe toward the point, up to 15°, if that centres it better.
  const rock = Math.max(-15, Math.min(15, (Math.atan2(plane.a, plane.d) * 180) / Math.PI));
  for (const sign of [1, -1]) {
    const tried = { ...placed, rockDeg: sign * rock };
    const there = worldToPlane(frameFromPose(skin, tried), target);
    if (Math.abs(there.off) < 3 && Math.abs(there.a) < Math.abs(plane.a) && there.d > 0) {
      placed = tried;
      plane = there;
      break;
    }
  }
  if (Math.abs(plane.off) > 3) return null;
  const geometry =
    100 -
    0.6 * Math.abs(plane.a) -
    0.4 * Math.max(0, Math.abs(placed.tiltDeg) - 20) -
    0.5 * Math.abs(placed.rockDeg) -
    0.15 * Math.max(0, plane.d - 90) -
    3 * Math.abs(plane.off);
  return { pose: { ...placed, tiltDeg: round(placed.tiltDeg), rockDeg: round(placed.rockDeg) }, geometry, d: plane.d };
}

/**
 * Rays checked from the face to around the point: lateral offsets (mm, in the image plane) and their
 * weights. A beam is millimetres wide and an image is a sector, not a line: a gap between bowel loops
 * that one ray slips through still leaves the image in the shadow of the gas around it.
 */
const RAYS: ReadonlyArray<readonly [number, number]> = [
  [-16, 0.12],
  [-8, 0.2],
  [0, 0.36],
  [8, 0.2],
  [16, 0.12],
];

/** 0–1: how open the way in is (no bone, gas or aerated lung); 0 if the point itself is hidden. */
function acousticWindow(volume: ClassVolume, skin: SkinSurface, pose: ProbePose, target: Vec3): number {
  const frame = frameFromPose(skin, pose);
  const start = frame.origin;
  let open = 0;
  for (const [shift, weight] of RAYS) {
    const goal: Vec3 = [target[0] + frame.lateral[0] * shift, target[1] + frame.lateral[1] * shift, target[2] + frame.lateral[2] * shift];
    const length = Math.hypot(goal[0] - start[0], goal[1] - start[1], goal[2] - start[2]);
    const steps = Math.max(1, Math.ceil(length / 1.5));
    let clear = true;
    // Stop short of the point: what is at the point itself is what we came to see.
    for (let s = 1; s < steps - 2 && clear; s++) {
      const t = s / steps;
      const c = sampleClass(volume, [
        start[0] + (goal[0] - start[0]) * t,
        start[1] + (goal[1] - start[1]) * t,
        start[2] + (goal[2] - start[2]) * t,
      ]);
      if (c === TISSUE.bone || c === TISSUE.lung || isGas(c)) clear = false;
    }
    if (shift === 0 && !clear) return 0;
    if (clear) open += weight;
  }
  return open;
}

const round = (v: number) => Math.round(v * 10) / 10;
