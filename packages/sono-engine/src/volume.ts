import type { Vec3 } from "./math";
import { BREATH_EXCURSION_MM, RESPIRATORY, TISSUE } from "./tissues";

/**
 * A tissue-class volume in world millimetres. Axes: x → patient right,
 * y → anterior, z → superior (RAS). Index = i + nx·(j + ny·k).
 */
export interface ClassVolume {
  readonly dims: readonly [number, number, number];
  readonly spacing: readonly [number, number, number];
  /** World position (mm) of the centre of voxel (0, 0, 0). */
  readonly origin: Vec3;
  readonly data: Uint8Array;
  /**
   * Breathing, per slice: tissue that moves with breathing and shows in slice k comes from slice
   * k + breathShift[k] (it has moved toward the feet). Absent for the volume as scanned (expiration).
   */
  readonly breathShift?: Int16Array;
}

const profiles = new WeakMap<Uint8Array, Float32Array>();

/**
 * How much of the full excursion the abdomen's contents travel at each slice in a deep breath in.
 * The diaphragm pushes them down: everything within 6 cm of it (the top of the liver) moves the
 * full distance, and the motion fades to nothing at the top of the bladder, which does not move.
 * So the liver moves most, the kidneys about three quarters as far, the lower bowel a little.
 */
export function breathProfile(volume: ClassVolume): Float32Array {
  const cached = profiles.get(volume.data);
  if (cached && cached.length === volume.dims[2]) return cached;
  const [nx, ny, nz] = volume.dims;
  let liverTop = -1;
  let bladderTop = -1;
  for (let k = 0; k < nz; k++) {
    const base = k * nx * ny;
    for (let p = base; p < base + nx * ny; p++) {
      const t = volume.data[p];
      if (t === TISSUE.liver || t === TISSUE.liverCapsule) liverTop = k;
      else if (t === TISSUE.bladder || t === TISSUE.bladderWall) bladderTop = k;
    }
  }
  const profile = new Float32Array(nz);
  const high = liverTop - Math.round(60 / volume.spacing[2]);
  // Without both landmarks (a phantom, say), everything moves the full distance.
  const low = liverTop < 0 || bladderTop < 0 || bladderTop >= high ? Number.NEGATIVE_INFINITY : bladderTop;
  for (let k = 0; k < nz; k++) profile[k] = low === Number.NEGATIVE_INFINITY ? 1 : Math.min(1, Math.max(0, (k - low) / (high - low)));
  profiles.set(volume.data, profile);
  return profile;
}

/** How far (mm) tissue that moves with breathing travels at height z, for a breath (0 = out, 1 = deep breath in). */
export function breathShiftMm(volume: ClassVolume, breath: number, zMm: number): number {
  const profile = breathProfile(volume);
  const k = Math.min(volume.dims[2] - 1, Math.max(0, Math.round((zMm - volume.origin[2]) / volume.spacing[2])));
  return Math.max(0, Math.min(1, breath)) * BREATH_EXCURSION_MM * profile[k];
}

/** The same volume, with the abdomen's contents moved by a breath (0 = out, as scanned; 1 = deep breath in). */
export function withBreath(volume: ClassVolume, breath: number): ClassVolume {
  const b = Math.max(0, Math.min(1, breath));
  if (b === 0)
    return volume.breathShift ? { dims: volume.dims, spacing: volume.spacing, origin: volume.origin, data: volume.data } : volume;
  const profile = breathProfile(volume);
  const sz = volume.spacing[2];
  const breathShift = Int16Array.from(profile, (f) => Math.round((b * BREATH_EXCURSION_MM * f) / sz));
  return { ...volume, breathShift };
}

/**
 * Tissue at voxel (i, j, k), inside the volume, with the breathing shift applied. Only the abdomen's
 * moving contents move: moving tissue from higher up takes the place of moving tissue here. Fixed
 * structures (body wall, muscles, bone, aorta, bladder) are never overwritten, so organs slide beside
 * them, not into them; where nothing moving arrives, what is here stays.
 */
export function classAtVoxel(volume: ClassVolume, i: number, j: number, k: number): number {
  const [nx, ny, nz] = volume.dims;
  const here = volume.data[i + nx * (j + ny * k)];
  const shift = volume.breathShift?.[k] ?? 0;
  if (shift === 0 || !RESPIRATORY[here]) return here;
  const ks = k + shift;
  const moved = ks < nz ? volume.data[i + nx * (j + ny * ks)] : 0;
  return RESPIRATORY[moved] ? moved : here;
}

export function createVolume(
  dims: readonly [number, number, number],
  spacing: readonly [number, number, number],
  origin: Vec3,
): ClassVolume {
  return { dims, spacing, origin, data: new Uint8Array(dims[0] * dims[1] * dims[2]) };
}

export function voxelIndex(volume: ClassVolume, i: number, j: number, k: number): number {
  return i + volume.dims[0] * (j + volume.dims[1] * k);
}

/** Tissue class at a world position (nearest voxel); 0 outside the volume. */
export function sampleClass(volume: ClassVolume, p: Vec3): number {
  const i = Math.round((p[0] - volume.origin[0]) / volume.spacing[0]);
  const j = Math.round((p[1] - volume.origin[1]) / volume.spacing[1]);
  const k = Math.round((p[2] - volume.origin[2]) / volume.spacing[2]);
  const [nx, ny, nz] = volume.dims;
  if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return 0;
  return classAtVoxel(volume, i, j, k);
}

export function worldOf(volume: ClassVolume, i: number, j: number, k: number): Vec3 {
  return [volume.origin[0] + i * volume.spacing[0], volume.origin[1] + j * volume.spacing[1], volume.origin[2] + k * volume.spacing[2]];
}

/** World-space bounding box (voxel centres). */
export function bounds(volume: ClassVolume): { min: Vec3; max: Vec3 } {
  const [nx, ny, nz] = volume.dims;
  return { min: volume.origin, max: worldOf(volume, nx - 1, ny - 1, nz - 1) };
}
