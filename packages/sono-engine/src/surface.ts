import { cross, normalize, rad, type Vec3 } from "./math";
import { TISSUE } from "./tissues";
import type { ClassVolume } from "./volume";

/**
 * The skin as a cylindrical height field: for each slice height z and angle φ
 * around the body's long axis, the distance from the axis to the skin.
 * φ = 0 points anterior, +90° to the patient's right, −90° to the left.
 */
export interface SurfaceMap {
  /** Body axis position (x, y) in mm. */
  readonly center: readonly [number, number];
  /** z (mm) of the first row and spacing between rows. */
  readonly z0: number;
  readonly dz: number;
  readonly rows: number;
  /** Angular samples covering 360°. */
  readonly columns: number;
  /** rows × columns radii in mm (row-major). */
  readonly radius: Float32Array;
}

const OUTSIDE = TISSUE.outside;

/** Half the span of skin (mm) the probe face rests on, in each direction, for its orientation. */
export const FOOTPRINT_MM = 12;
/** Skin samples either side of the probe's centre for that fit. */
const FOOTPRINT_SAMPLES = 4;

/** Measure the skin radius map from a class volume (build time). */
export function buildSurfaceMap(volume: ClassVolume, columns = 180): SurfaceMap {
  const [nx, ny, nz] = volume.dims;
  const [sx, sy, sz] = volume.spacing;
  const [ox, oy, oz] = volume.origin;
  let cx = 0;
  let cy = 0;
  let count = 0;
  for (let k = 0; k < nz; k += 2) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (volume.data[i + nx * (j + ny * k)] === OUTSIDE) continue;
        cx += ox + i * sx;
        cy += oy + j * sy;
        count++;
      }
    }
  }
  const center: [number, number] = [cx / count, cy / count];
  const radius = new Float32Array(nz * columns);
  const step = Math.min(sx, sy) / 2;
  const maxR = Math.hypot(nx * sx, ny * sy);
  for (let k = 0; k < nz; k++) {
    for (let c = 0; c < columns; c++) {
      const phi = rad((c / columns) * 360);
      const dx = Math.sin(phi);
      const dy = Math.cos(phi);
      let inside = 0;
      for (let r = 0; r < maxR; r += step) {
        const i = Math.round((center[0] + dx * r - ox) / sx);
        const j = Math.round((center[1] + dy * r - oy) / sy);
        if (i < 0 || j < 0 || i >= nx || j >= ny) break;
        if (volume.data[i + nx * (j + ny * k)] !== OUTSIDE) inside = r;
        else if (inside > 0 && r - inside > 6) break;
      }
      radius[k * columns + c] = inside;
    }
  }
  smoothRadius(radius, nz, columns, 2);
  return { center, z0: oz, dz: sz, rows: nz, columns, radius };
}

function smoothRadius(radius: Float32Array, rows: number, columns: number, passes: number): void {
  const tmp = new Float32Array(radius.length);
  for (let pass = 0; pass < passes; pass++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        let sum = 0;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= rows) continue;
          for (let dc = -1; dc <= 1; dc++) {
            sum += radius[rr * columns + ((c + dc + columns) % columns)];
            n++;
          }
        }
        tmp[r * columns + c] = sum / n;
      }
    }
    radius.set(tmp);
  }
}

/** A point on the skin with its outward normal. */
export interface SkinPoint {
  readonly position: Vec3;
  readonly normal: Vec3;
  /** Surface tangent pointing towards the patient's head. */
  readonly towardHead: Vec3;
}

export class SkinSurface {
  readonly map: SurfaceMap;

  constructor(map: SurfaceMap) {
    this.map = map;
  }

  get zMin(): number {
    return this.map.z0;
  }

  get zMax(): number {
    return this.map.z0 + (this.map.rows - 1) * this.map.dz;
  }

  /** Skin radius at (φ°, z mm), bilinearly interpolated. */
  radiusAt(phiDeg: number, zMm: number): number {
    const { rows, columns, z0, dz, radius } = this.map;
    const rf = Math.min(rows - 1, Math.max(0, (zMm - z0) / dz));
    const r0 = Math.floor(rf);
    const r1 = Math.min(rows - 1, r0 + 1);
    const tr = rf - r0;
    const cf = ((((phiDeg % 360) + 360) % 360) / 360) * columns;
    const c0 = Math.floor(cf) % columns;
    const c1 = (c0 + 1) % columns;
    const tc = cf - Math.floor(cf);
    const a = radius[r0 * columns + c0] * (1 - tc) + radius[r0 * columns + c1] * tc;
    const b = radius[r1 * columns + c0] * (1 - tc) + radius[r1 * columns + c1] * tc;
    return a * (1 - tr) + b * tr;
  }

  pointAt(phiDeg: number, zMm: number): Vec3 {
    const r = this.radiusAt(phiDeg, zMm);
    const phi = rad(phiDeg);
    return [this.map.center[0] + Math.sin(phi) * r, this.map.center[1] + Math.cos(phi) * r, zMm];
  }

  /**
   * Skin point, outward normal and head-ward tangent. The normal is how the probe face sits on the
   * skin: the skin's slope fitted (least squares) across the face's footprint, FOOTPRINT_MM either
   * way, along the body and around it. A face rests on centimetres of skin, so it bridges the small
   * bumps of a segmented surface rather than tipping the beam over each one; a tip of a few degrees
   * would swing a structure 10 cm deep by a centimetre as the probe slides.
   */
  at(phiDeg: number, zMm: number): SkinPoint {
    const z = Math.min(this.zMax - 2, Math.max(this.zMin + 2, zMm));
    const p = this.pointAt(phiDeg, z);
    const perDegree = this.mmPerDegree(phiDeg, z);
    let alongBody = 0;
    let aroundBody = 0;
    let weight = 0;
    for (let i = 1; i <= FOOTPRINT_SAMPLES; i++) {
      const u = (i / FOOTPRINT_SAMPLES) * FOOTPRINT_MM;
      alongBody += u * (this.radiusAt(phiDeg, z + u) - this.radiusAt(phiDeg, z - u));
      aroundBody += u * (this.radiusAt(phiDeg + u / perDegree, z) - this.radiusAt(phiDeg - u / perDegree, z));
      weight += 2 * u * u;
    }
    // Radius change per mm along the body and per mm around it; then the surface's two tangents.
    const drdz = alongBody / weight;
    const drds = aroundBody / weight;
    const phi = rad(phiDeg);
    const out: Vec3 = [Math.sin(phi), Math.cos(phi), 0];
    const dZ: Vec3 = [out[0] * drdz, out[1] * drdz, 1];
    const dPhi: Vec3 = [Math.cos(phi) + out[0] * drds, -Math.sin(phi) + out[1] * drds, 0];
    let normal = normalize(cross(dZ, dPhi));
    if (normal[0] * out[0] + normal[1] * out[1] < 0) normal = [-normal[0], -normal[1], -normal[2]];
    const towardHead = normalize(dZ);
    return { position: p, normal, towardHead };
  }

  /** (φ°, z) of the skin point closest to a world position (used for clicks in the 3D view). */
  locate(p: Vec3): { phiDeg: number; zMm: number } {
    const phiDeg = (Math.atan2(p[0] - this.map.center[0], p[1] - this.map.center[1]) * 180) / Math.PI;
    return { phiDeg, zMm: Math.min(this.zMax - 2, Math.max(this.zMin + 2, p[2])) };
  }

  /** Arc length (mm) of one degree of φ at this point, for converting slides in mm to angle (over 8°, so the skin's small steps do not jolt it). */
  mmPerDegree(phiDeg: number, zMm: number): number {
    const a = this.pointAt(phiDeg - 4, zMm);
    const b = this.pointAt(phiDeg + 4, zMm);
    return Math.max(0.5, Math.hypot(b[0] - a[0], b[1] - a[1]) / 8);
  }
}
