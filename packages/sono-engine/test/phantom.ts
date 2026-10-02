import { buildSurfaceMap, type ClassVolume, createVolume, SkinSurface, TISSUE, type Vec3 } from "../src";

/** Fill every voxel whose centre satisfies `inside` with `tissue`. */
export function paint(volume: ClassVolume, tissue: number, inside: (p: Vec3) => boolean): void {
  const [nx, ny, nz] = volume.dims;
  const [sx, sy, sz] = volume.spacing;
  const [ox, oy, oz] = volume.origin;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (inside([ox + i * sx, oy + j * sy, oz + k * sz])) volume.data[i + nx * (j + ny * k)] = tissue;
      }
    }
  }
}

/**
 * A body-like phantom: a cylinder of liver-like tissue along z, centred on the origin.
 * The anterior skin (φ = 0) is at y = +radius.
 */
export function cylinder(radiusMm = 100, lengthMm = 240, spacing = 1.5): ClassVolume {
  const n = Math.ceil((2 * radiusMm + 24) / spacing);
  const nz = Math.ceil(lengthMm / spacing);
  const half = (count: number) => (-(count - 1) * spacing) / 2;
  const volume = createVolume([n, n, nz], [spacing, spacing, spacing], [half(n), half(n), half(nz)]);
  paint(volume, TISSUE.liver, (p) => Math.hypot(p[0], p[1]) <= radiusMm);
  return volume;
}

export function ellipsoid(center: Vec3, semiAxes: Vec3): (p: Vec3) => boolean {
  return (p) =>
    ((p[0] - center[0]) / semiAxes[0]) ** 2 + ((p[1] - center[1]) / semiAxes[1]) ** 2 + ((p[2] - center[2]) / semiAxes[2]) ** 2 <= 1;
}

export function skinOf(volume: ClassVolume): SkinSurface {
  return new SkinSurface(buildSurfaceMap(volume));
}
