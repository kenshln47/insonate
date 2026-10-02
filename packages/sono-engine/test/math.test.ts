import { describe, expect, it } from "vitest";
import { cross, dot, length, normalize, rotate, symmetricEigen, wrapDeg } from "../src";

describe("vector maths", () => {
  it("rotates about an axis (right-handed)", () => {
    const v = rotate([1, 0, 0], [0, 0, 1], Math.PI / 2);
    expect(v[0]).toBeCloseTo(0);
    expect(v[1]).toBeCloseTo(1);
    expect(v[2]).toBeCloseTo(0);
  });

  it("keeps cross products orthogonal and normalises", () => {
    const a = normalize([1, 2, 3]);
    const b = normalize([-2, 0.5, 1]);
    const c = cross(a, b);
    expect(dot(c, a)).toBeCloseTo(0);
    expect(dot(c, b)).toBeCloseTo(0);
    expect(length(a)).toBeCloseTo(1);
  });

  it("wraps angles into (−180, 180]", () => {
    expect(wrapDeg(190)).toBe(-170);
    expect(wrapDeg(-190)).toBe(170);
    expect(wrapDeg(180)).toBe(180);
    expect(wrapDeg(-180)).toBe(180);
    expect(wrapDeg(725)).toBe(5);
  });

  it("finds eigenvalues of a symmetric matrix, largest first", () => {
    // Rotate diag(3, 1, 2) by 30° about z: same eigenvalues, rotated vectors.
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const m = [
      [3 * c * c + 1 * s * s, (3 - 1) * c * s, 0],
      [(3 - 1) * c * s, 3 * s * s + 1 * c * c, 0],
      [0, 0, 2],
    ];
    const { values, vectors } = symmetricEigen(m);
    expect(values[0]).toBeCloseTo(3);
    expect(values[1]).toBeCloseTo(2);
    expect(values[2]).toBeCloseTo(1);
    expect(Math.abs(dot(vectors[0], [c, s, 0]))).toBeCloseTo(1);
    expect(Math.abs(vectors[1][2])).toBeCloseTo(1);
  });
});
