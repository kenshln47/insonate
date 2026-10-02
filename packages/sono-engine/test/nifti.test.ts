import { describe, expect, it } from "vitest";
import { parseNifti } from "../src";

/** Build a minimal single-file NIfTI-1 (.nii) holding int16 voxels. */
function makeNifti(values: number[], dims: [number, number, number], littleEndian = true): Uint8Array {
  const offset = 352;
  const bytes = new Uint8Array(offset + values.length * 2);
  const view = new DataView(bytes.buffer);
  const le = littleEndian;
  view.setInt32(0, 348, le);
  view.setInt16(40, 3, le);
  view.setInt16(42, dims[0], le);
  view.setInt16(44, dims[1], le);
  view.setInt16(46, dims[2], le);
  view.setInt16(70, 4, le); // int16
  view.setInt16(72, 16, le);
  view.setFloat32(76, 1, le);
  view.setFloat32(80, 0.8, le);
  view.setFloat32(84, 0.8, le);
  view.setFloat32(88, 2.5, le);
  view.setFloat32(108, offset, le);
  view.setFloat32(112, 1, le);
  view.setFloat32(116, -1024, le);
  view.setInt16(254, 1, le); // sform
  const srow = [
    [-0.8, 0, 0, 100],
    [0, -0.8, 0, 120],
    [0, 0, 2.5, -300],
  ];
  for (const [r, row] of srow.entries()) {
    for (const [c, v] of row.entries()) view.setFloat32(280 + r * 16 + c * 4, v, le);
  }
  bytes.set([0x6e, 0x2b, 0x31, 0], 344); // "n+1\0"
  for (const [i, v] of values.entries()) view.setInt16(offset + i * 2, v, le);
  return bytes;
}

describe("parseNifti", () => {
  const values = Array.from({ length: 2 * 3 * 4 }, (_, i) => i * 10 - 5);

  it("reads dimensions, spacing, scaling, affine and voxels", () => {
    const nii = parseNifti(makeNifti(values, [2, 3, 4]));
    expect(nii.dims).toEqual([2, 3, 4]);
    expect(nii.spacing[0]).toBeCloseTo(0.8);
    expect(nii.spacing[2]).toBeCloseTo(2.5);
    expect(nii.intercept).toBe(-1024);
    expect(nii.slope).toBe(1);
    expect(nii.affine[0][0]).toBeCloseTo(-0.8);
    expect(nii.affine[1][3]).toBeCloseTo(120);
    expect(nii.affine[3]).toEqual([0, 0, 0, 1]);
    expect(Array.from(nii.data)).toEqual(values);
  });

  it("reads big-endian files", () => {
    const nii = parseNifti(makeNifti(values, [2, 3, 4], false));
    expect(Array.from(nii.data)).toEqual(values);
  });

  it("rejects files that are not NIfTI or are truncated", () => {
    expect(() => parseNifti(new Uint8Array(400))).toThrow(/NIfTI/);
    const full = makeNifti(values, [2, 3, 4]);
    expect(() => parseNifti(full.subarray(0, full.length - 4))).toThrow(/truncated/);
  });
});
