import { describe, expect, it } from "vitest";
import { closeMask, floodOutside, squaredDistance } from "../src";

const at = (dims: readonly [number, number, number], i: number, j: number, k: number) => i + dims[0] * (j + dims[1] * k);

describe("morphology", () => {
  it("computes exact squared Euclidean distances, with anisotropic spacing", () => {
    const dims = [9, 9, 9] as const;
    const mask = new Uint8Array(9 * 9 * 9);
    mask[at(dims, 4, 4, 4)] = 1;
    const d = squaredDistance(mask, dims, [1, 2, 3]);
    expect(d[at(dims, 4, 4, 4)]).toBe(0);
    expect(d[at(dims, 7, 4, 4)]).toBeCloseTo(9); // 3 voxels × 1 mm
    expect(d[at(dims, 4, 6, 4)]).toBeCloseTo(16); // 2 voxels × 2 mm
    expect(d[at(dims, 5, 5, 5)]).toBeCloseTo(1 + 4 + 9);
  });

  it("closing bridges a narrow gap but leaves the outside alone", () => {
    const dims = [20, 10, 10] as const;
    const mask = new Uint8Array(20 * 10 * 10);
    for (let k = 3; k < 7; k++) {
      for (let j = 3; j < 7; j++) {
        for (let i = 2; i < 18; i++) if (i < 9 || i > 10) mask[at(dims, i, j, k)] = 1;
      }
    }
    const closed = closeMask(mask, dims, [1, 1, 1], 2);
    expect(mask[at(dims, 9, 5, 5)]).toBe(0);
    expect(closed[at(dims, 9, 5, 5)]).toBe(1);
    expect(closed[at(dims, 0, 0, 0)]).toBe(0);
    expect(closed[at(dims, 5, 5, 5)]).toBe(1);
  });

  it("floods the outside of each slice but not enclosed cavities", () => {
    const dims = [12, 12, 1] as const;
    const open = new Uint8Array(144).fill(1);
    // A closed ring wall from 3 to 8 encloses a cavity at 5–6.
    for (let j = 3; j <= 8; j++) {
      for (let i = 3; i <= 8; i++) if (i === 3 || i === 8 || j === 3 || j === 8) open[at(dims, i, j, 0)] = 0;
    }
    const outside = floodOutside(open, dims);
    expect(outside[at(dims, 0, 0, 0)]).toBe(1);
    expect(outside[at(dims, 5, 5, 0)]).toBe(0);
    expect(outside[at(dims, 3, 5, 0)]).toBe(0);
  });
});
