import type { Vec3 } from "./math";
import { PRESS_CLEAR_MM, type ProbeFrame, planeToPolar, planeToWorld, type ScanGeometry } from "./probe";
import { type ImageView, pixelToPlane } from "./simulate";
import { BREATH_EXCURSION_MM, RESPIRATORY, TISSUE, TISSUE_PROPS } from "./tissues";
import { breathProfile, type ClassVolume, classAtVoxel, withBreath } from "./volume";

/**
 * The answer key for an ultrasound image: the tissue class under every pixel of the fan
 * (0 outside it), sampled in the same plane, with the same breathing shift as the simulator.
 */
export function renderClassMap(
  volume: ClassVolume,
  frame: ProbeFrame,
  geometry: ScanGeometry,
  view: ImageView,
  breath: number,
  out: Uint8Array,
  pressure = 0,
): void {
  const moved = withBreath(volume, breath);
  // Under probe pressure, gas in the near field is pushed aside (as in the image).
  const clearMm = Math.max(0, Math.min(1, pressure)) * PRESS_CLEAR_MM;
  const [nx, ny, nz] = volume.dims;
  const [sx, sy, sz] = volume.spacing;
  const [ox, oy, oz] = volume.origin;
  for (let y = 0; y < view.height; y++) {
    for (let x = 0; x < view.width; x++) {
      const p = y * view.width + x;
      const { a, d } = pixelToPlane(view, x + 0.5, y + 0.5);
      if (!planeToPolar(geometry, a, d)) {
        out[p] = TISSUE.outside;
        continue;
      }
      const w = planeToWorld(frame, a, d);
      const i = Math.round((w[0] - ox) / sx);
      const j = Math.round((w[1] - oy) / sy);
      const k = Math.round((w[2] - oz) / sz);
      const c = i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? TISSUE.outside : classAtVoxel(moved, i, j, k);
      out[p] = d < clearMm && (c === TISSUE.air || c === TISSUE.stomachGas) ? TISSUE.bowelWall : c;
    }
  }
}

/** RGB colour of each tissue class, from the tissue table. */
export const TISSUE_RGB: readonly (readonly [number, number, number])[] = TISSUE_PROPS.map((p) => {
  const hex = p.color.replace("#", "");
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)] as const;
});

/** The patient's CT on a coarser grid (8-bit, windowed), for the CT–ultrasound view. */
export interface CtVolume {
  readonly dims: readonly [number, number, number];
  readonly spacing: readonly [number, number, number];
  readonly origin: Vec3;
  readonly data: Uint8Array;
}

/**
 * The CT cut in the image plane, pixel for pixel like the ultrasound (0 outside the fan, 1–255 inside),
 * trilinearly interpolated. Tissue that moves with breathing is taken from where the breath has moved
 * it from, exactly as the simulator does, so CT and ultrasound always show the same anatomy.
 */
export function renderCtSlice(
  ct: CtVolume,
  volume: ClassVolume,
  frame: ProbeFrame,
  geometry: ScanGeometry,
  view: ImageView,
  breath: number,
  out: Uint8Array,
): void {
  const shifts = withBreath(volume, breath).breathShift;
  // The CT moves by the field's exact (sub-voxel) amount, so its edges do not step from slice to slice.
  const profile = breathProfile(volume);
  const excursion = Math.max(0, Math.min(1, breath)) * BREATH_EXCURSION_MM;
  const [nx, ny, nz] = volume.dims;
  const [vx, vy, vz] = volume.spacing;
  const [ox, oy, oz] = volume.origin;
  const [cx, cy, cz] = ct.dims;
  const [csx, csy, csz] = ct.spacing;
  const [cox, coy, coz] = ct.origin;
  const sample = (x: number, y: number, z: number): number => {
    const fi = (x - cox) / csx;
    const fj = (y - coy) / csy;
    const fk = (z - coz) / csz;
    const i0 = Math.floor(fi);
    const j0 = Math.floor(fj);
    const k0 = Math.floor(fk);
    if (i0 < 0 || j0 < 0 || k0 < 0 || i0 >= cx - 1 || j0 >= cy - 1 || k0 >= cz - 1) return 0;
    const ti = fi - i0;
    const tj = fj - j0;
    const tk = fk - k0;
    const d = ct.data;
    const at = (i: number, j: number, k: number) => d[i + cx * (j + cy * k)];
    const c00 = at(i0, j0, k0) * (1 - ti) + at(i0 + 1, j0, k0) * ti;
    const c10 = at(i0, j0 + 1, k0) * (1 - ti) + at(i0 + 1, j0 + 1, k0) * ti;
    const c01 = at(i0, j0, k0 + 1) * (1 - ti) + at(i0 + 1, j0, k0 + 1) * ti;
    const c11 = at(i0, j0 + 1, k0 + 1) * (1 - ti) + at(i0 + 1, j0 + 1, k0 + 1) * ti;
    return (c00 * (1 - tj) + c10 * tj) * (1 - tk) + (c01 * (1 - tj) + c11 * tj) * tk;
  };
  for (let y = 0; y < view.height; y++) {
    for (let x = 0; x < view.width; x++) {
      const p = y * view.width + x;
      const { a, d } = pixelToPlane(view, x + 0.5, y + 0.5);
      if (!planeToPolar(geometry, a, d)) {
        out[p] = 0;
        continue;
      }
      const w = planeToWorld(frame, a, d);
      let z = w[2];
      if (shifts) {
        const i = Math.round((w[0] - ox) / vx);
        const j = Math.round((w[1] - oy) / vy);
        const k = Math.round((w[2] - oz) / vz);
        if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && shifts[k] > 0) {
          const here = volume.data[i + nx * (j + ny * k)];
          const ks = k + shifts[k];
          const there = ks < nz ? volume.data[i + nx * (j + ny * ks)] : 0;
          if (RESPIRATORY[here] && RESPIRATORY[there]) {
            const fk = Math.min(nz - 1.001, Math.max(0, (w[2] - oz) / vz));
            const k0 = Math.floor(fk);
            z += excursion * (profile[k0] + (profile[k0 + 1] - profile[k0]) * (fk - k0));
          }
        }
      }
      out[p] = Math.max(1, Math.round(sample(w[0], w[1], z)));
    }
  }
}
