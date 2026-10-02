import { describe, expect, it } from "vitest";
import { applyVariant, type ClassVolume, findingMesh, TISSUE } from "../src";
import { cylinder, ellipsoid, paint } from "./phantom";

/** A small patient: liver, gallbladder, right kidney with its sinus, an aorta, a bladder and fat between them. */
function patient(): ClassVolume {
  // Painting is the slow part: paint once, hand out copies.
  base ??= paintPatient();
  return { ...base, data: base.data.slice() };
}
let base: ClassVolume | null = null;

function paintPatient(): ClassVolume {
  // 2 mm voxels keep the phantom small enough for fast tests.
  const volume = cylinder(100, 260, 2);
  paint(volume, TISSUE.fat, () => true);
  paint(volume, TISSUE.outside, (p) => Math.hypot(p[0], p[1]) > 100);
  paint(volume, TISSUE.liver, ellipsoid([45, 20, 70], [45, 40, 45]));
  paint(volume, TISSUE.gallbladder, ellipsoid([40, 45, 30], [16, 14, 32]));
  paint(volume, TISSUE.kidneyRight, ellipsoid([55, -40, 20], [24, 20, 52]));
  paint(volume, TISSUE.sinusRight, ellipsoid([50, -40, 20], [13, 12, 34]));
  paint(volume, TISSUE.aorta, (p) => Math.hypot(p[0] + 15, p[1] + 10) <= 10 && p[2] > -110 && p[2] < 110);
  paint(volume, TISSUE.kidneyLeft, ellipsoid([-60, -40, 25], [20, 17, 45]));
  paint(volume, TISSUE.bladder, ellipsoid([0, 20, -100], [30, 25, 20]));
  return volume;
}

const count = (volume: ClassVolume, tissue: number) => volume.data.reduce((n, t) => n + (t === tissue ? 1 : 0), 0);

// Real-sized voxel work (distance transforms, measurements): slower than most unit tests.
describe("teaching cases", { timeout: 30_000 }, () => {
  it("leaves the patient as scanned for the normal case", () => {
    const volume = patient();
    const before = volume.data.slice();
    const result = applyVariant(volume, "normal");
    expect(result.findings).toHaveLength(0);
    expect(volume.data).toEqual(before);
  });

  it("puts gallstones on the dependent (posterior) wall of the gallbladder", () => {
    const volume = patient();
    const result = applyVariant(volume, "gallstones");
    expect(count(volume, TISSUE.stone)).toBeGreaterThan(50);
    expect(result.facts.stones).toBe(3);
    // The stones lie in the back half of the gallbladder (its centre is at y = 45).
    const [nx, ny] = volume.dims;
    let sum = 0;
    let n = 0;
    for (let p = 0; p < volume.data.length; p++) {
      if (volume.data[p] !== TISSUE.stone) continue;
      sum += volume.origin[1] + (Math.floor(p / nx) % ny) * volume.spacing[1];
      n++;
    }
    expect(sum / n).toBeLessThan(40);
    const mesh = findingMesh(volume, result.findings[0]);
    expect(mesh.indices.length).toBeGreaterThan(30);
  });

  it("opens Morison's pouch with free fluid between liver and right kidney", () => {
    const volume = patient();
    const kidneyVoxels = count(volume, TISSUE.kidneyRight);
    const result = applyVariant(volume, "freeFluid");
    expect(count(volume, TISSUE.freeFluid)).toBeGreaterThan(100);
    expect(result.facts.morisonMl).toBeGreaterThan(0);
    // Fluid never replaces an organ.
    expect(count(volume, TISSUE.kidneyRight)).toBe(kidneyVoxels);
  });

  it("fills the renal pelvis with urine in hydronephrosis, keeping a rim of sinus fat", () => {
    const volume = patient();
    const result = applyVariant(volume, "hydronephrosis");
    expect(count(volume, TISSUE.renalPelvis)).toBeGreaterThan(200);
    expect(count(volume, TISSUE.sinusRight)).toBeGreaterThan(0);
    expect(result.facts.pelvisApMm).toBeGreaterThan(8);
  });

  it("widens the infrarenal aorta into a 5 cm aneurysm with thrombus around the lumen", () => {
    const volume = patient();
    const result = applyVariant(volume, "aaa");
    expect(result.facts.diameterMm).toBeGreaterThanOrEqual(50);
    expect(count(volume, TISSUE.thrombus)).toBeGreaterThan(500);
    // The widest slice really measures about 5 cm across.
    const [nx, ny, nz] = volume.dims;
    let widest = 0;
    for (let k = 0; k < nz; k++) {
      let lo = Number.POSITIVE_INFINITY;
      let hi = Number.NEGATIVE_INFINITY;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const t = volume.data[i + nx * (j + ny * k)];
          if (t !== TISSUE.thrombus && t !== TISSUE.aorta && t !== TISSUE.aortaWall) continue;
          lo = Math.min(lo, i);
          hi = Math.max(hi, i);
        }
      }
      if (hi >= lo) widest = Math.max(widest, (hi - lo + 1) * volume.spacing[0]);
    }
    expect(widest).toBeGreaterThan(46);
    expect(widest).toBeLessThan(58);
  });

  it("makes a fatty liver brighter and more attenuating, without changing the anatomy", () => {
    const volume = patient();
    const before = volume.data.slice();
    const result = applyVariant(volume, "fattyLiver");
    expect(volume.data).toEqual(before);
    const liver = result.overrides.find((o) => o.tissue === TISSUE.liver);
    expect(liver?.props.backscatter).toBeGreaterThan(1.2);
    expect(liver?.props.attenuation).toBeGreaterThan(0.7);
  });
});
