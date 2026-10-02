import { describe, expect, it } from "vitest";
import { meshVolume, smoothMesh, surfaceNets } from "../src";

describe("surface nets", () => {
  it("meshes a sphere with the right enclosed volume", () => {
    const n = 32;
    const dims = [n, n, n] as const;
    const field = new Float32Array(n * n * n);
    const r = 10;
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) field[i + n * (j + n * k)] = Math.hypot(i - 15.5, j - 15.5, k - 15.5) <= r ? 1 : 0;
      }
    }
    const mesh = surfaceNets(field, dims, (i, j, k) => [i * 2, j * 2, k * 2]);
    expect(mesh.indices.length % 3).toBe(0);
    const truth = (4 / 3) * Math.PI * (r * 2) ** 3;
    expect(Math.abs(meshVolume(mesh)) / truth).toBeGreaterThan(0.9);
    expect(Math.abs(meshVolume(mesh)) / truth).toBeLessThan(1.1);
    // Taubin smoothing should not shrink it much.
    smoothMesh(mesh);
    expect(Math.abs(meshVolume(mesh)) / truth).toBeGreaterThan(0.88);
  });
});
