import { describe, expect, it } from "vitest";
import { classify, TISSUE } from "../src";

// A small synthetic CT: a soft-tissue cylinder (radius 50 mm) in air, an 8 mm fat layer
// under the skin, a pocket of deep fat, a segmented right kidney and gallbladder, and a
// loop of bowel holding a pocket of gas and one stray gas voxel.
const dims = [90, 90, 50] as const;
const spacing = [1.5, 1.5, 1.5] as const;
const n = dims[0] * dims[1] * dims[2];
const hu = new Int16Array(n);
const labels = new Uint8Array(n);
const centre = [(dims[0] - 1) / 2, (dims[1] - 1) / 2, (dims[2] - 1) / 2];
const mm = (i: number, axis: 0 | 1 | 2) => (i - centre[axis]) * spacing[axis];
const inKidney = (x: number, y: number, z: number) => (x / 20) ** 2 + ((y + 5) / 17) ** 2 + (z / 32) ** 2 <= 1;
const inGallbladder = (x: number, y: number, z: number) => Math.hypot(x + 28, y - 4, z) <= 9;
const inBowel = (x: number, y: number, z: number) => Math.hypot(x + 4, y + 30, z) <= 10;
const inGasPocket = (x: number, y: number, z: number) => Math.hypot(x + 4, y + 30, z - 4) <= 4;

for (let k = 0; k < dims[2]; k++) {
  for (let j = 0; j < dims[1]; j++) {
    for (let i = 0; i < dims[0]; i++) {
      const idx = i + dims[0] * (j + dims[1] * k);
      const [x, y, z] = [mm(i, 0), mm(j, 1), mm(k, 2)];
      const r = Math.hypot(x, y);
      hu[idx] = r > 50 ? -1000 : r > 42 ? -100 : 40;
      if (Math.abs(x) < 8 && y > 15 && y < 25) hu[idx] = -100; // fat 25+ mm below the skin
      if (inKidney(x, y, z)) labels[idx] = 2;
      if (inGallbladder(x, y, z)) {
        labels[idx] = 4;
        hu[idx] = 10;
      }
      if (inBowel(x, y, z)) {
        labels[idx] = 18;
        hu[idx] = 45;
        if (inGasPocket(x, y, z)) hu[idx] = -900;
      }
    }
  }
}

// One isolated voxel of gas in the bowel wall: CT noise, not a pocket.
const speck = [Math.round(centre[0] - 4 / spacing[0]), Math.round(centre[1] - 36 / spacing[1]), Math.round(centre[2] - 6 / spacing[2])];
hu[speck[0] + dims[0] * (speck[1] + dims[1] * speck[2])] = -900;

const { volume } = classify({ dims, spacing, hu, labels });
const count = (tissue: number) => volume.data.reduce((sum, v) => sum + (v === tissue ? 1 : 0), 0);
const sample = (x: number, y: number, z: number) => {
  const [nx, ny, nz] = volume.dims;
  const i = Math.round((x - volume.origin[0]) / volume.spacing[0]);
  const j = Math.round((y - volume.origin[1]) / volume.spacing[1]);
  const k = Math.round((z - volume.origin[2]) / volume.spacing[2]);
  if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1;
  return volume.data[i + nx * (j + ny * k)];
};

describe("classify", () => {
  it("crops to the body and centres the world on it", () => {
    expect(volume.dims[0]).toBeLessThan(dims[0]);
    expect(volume.dims[0] * volume.spacing[0]).toBeGreaterThan(100);
    const extent = (volume.dims[0] - 1) * volume.spacing[0];
    expect(volume.origin[0]).toBeCloseTo(-extent / 2);
    expect(volume.data[0]).toBe(TISSUE.outside);
  });

  it("calls fat under the skin subcutaneous, and deeper fat visceral", () => {
    expect(sample(0, -46, 0)).toBe(TISSUE.fat);
    expect(sample(0, 20, 0)).toBe(TISSUE.deepFat);
  });

  it("gives the kidney cortex, pyramids and a central sinus, outlined by fat", () => {
    expect(count(TISSUE.kidneyRight)).toBeGreaterThan(0);
    expect(count(TISSUE.medullaRight)).toBeGreaterThan(0);
    expect(count(TISSUE.sinusRight)).toBeGreaterThan(0);
    // Walk out from the middle of the kidney toward the patient's right.
    const row: number[] = [];
    for (let x = 0; x <= 33; x += volume.spacing[0]) row.push(sample(x, -5, 0));
    const kidney = new Set<number>([TISSUE.kidneyRight, TISSUE.medullaRight, TISSUE.sinusRight]);
    const last = row.findLastIndex((t) => kidney.has(t));
    expect(row[0]).toBe(TISSUE.sinusRight);
    expect(row[last]).toBe(TISSUE.kidneyRight); // cortex under the capsule
    expect(row[last + 1]).toBe(TISSUE.deepFat); // perirenal fat
    expect(row.at(-1)).toBe(TISSUE.soft);
  });

  it("draws the gallbladder wall as a thin shell around the bile", () => {
    expect(sample(-28, 4, 0)).toBe(TISSUE.gallbladder);
    // Walk out from the centre: bile, then one voxel of wall, then the neighbouring tissue.
    const row: number[] = [];
    for (let x = -28; x <= -16; x += volume.spacing[0]) row.push(sample(x, 4, 0));
    const wall = row.indexOf(TISSUE.gallbladderWall);
    expect(wall).toBeGreaterThan(0);
    expect(row.slice(0, wall).every((t) => t === TISSUE.gallbladder)).toBe(true);
    expect(row[wall + 1]).not.toBe(TISSUE.gallbladder);
  });

  it("keeps pockets of bowel gas and drops isolated specks", () => {
    expect(sample(-4, -30, 4)).toBe(TISSUE.air);
    expect(sample(-4, -36, -6)).not.toBe(TISSUE.air);
    expect(count(TISSUE.air)).toBeGreaterThan(10);
  });
});
