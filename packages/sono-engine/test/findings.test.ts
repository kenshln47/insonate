import { describe, expect, it } from "vitest";
import { applyFindings, type ClassVolume, type FindingSpec, measureCase, TISSUE } from "../src";
import { cylinder, ellipsoid, paint } from "./phantom";

/**
 * A small patient (2 mm voxels): body wall, deep fat, liver with a gallbladder, both kidneys with
 * their sinus, the spleen, an aorta, the bladder, a loop of bowel, and the lungs above the diaphragm.
 */
function patient(): ClassVolume {
  // Painting the phantom is the slow part: paint it once, hand out copies.
  base ??= paintPatient();
  return { ...base, data: base.data.slice() };
}
let base: ClassVolume | null = null;

function paintPatient(): ClassVolume {
  const volume = cylinder(100, 300, 2);
  paint(volume, TISSUE.fat, () => true);
  paint(volume, TISSUE.outside, (p) => Math.hypot(p[0], p[1]) > 100);
  paint(volume, TISSUE.deepFat, (p) => Math.hypot(p[0], p[1]) < 82);
  paint(volume, TISSUE.lung, (p) => Math.hypot(p[0], p[1]) < 80 && p[2] > 112);
  paint(volume, TISSUE.liver, ellipsoid([45, 15, 72], [45, 42, 45]));
  paint(volume, TISSUE.gallbladderWall, ellipsoid([40, 46, 32], [17, 15, 33]));
  paint(volume, TISSUE.gallbladder, ellipsoid([40, 46, 32], [15, 13, 31]));
  paint(volume, TISSUE.kidneyRight, ellipsoid([55, -40, 10], [24, 20, 54]));
  paint(volume, TISSUE.sinusRight, ellipsoid([50, -40, 10], [13, 12, 34]));
  paint(volume, TISSUE.kidneyLeft, ellipsoid([-58, -40, 20], [22, 18, 52]));
  paint(volume, TISSUE.sinusLeft, ellipsoid([-54, -40, 20], [12, 11, 32]));
  paint(volume, TISSUE.spleen, ellipsoid([-55, -15, 80], [22, 28, 48]));
  paint(volume, TISSUE.aortaWall, (p) => Math.hypot(p[0] + 12, p[1] + 10) <= 10 && p[2] > -120 && p[2] < 100);
  paint(volume, TISSUE.aorta, (p) => Math.hypot(p[0] + 12, p[1] + 10) <= 8.5 && p[2] > -120 && p[2] < 100);
  paint(volume, TISSUE.bladder, ellipsoid([0, 20, -110], [30, 25, 20]));
  paint(volume, TISSUE.bowelWall, ellipsoid([-10, 45, -30], [30, 12, 12]));
  paint(volume, TISSUE.air, ellipsoid([-10, 45, -30], [26, 8, 8]));
  return volume;
}

const count = (volume: ClassVolume, tissue: number) => volume.data.reduce((n, t) => n + (t === tissue ? 1 : 0), 0);

function make(spec: FindingSpec, volume = patient()) {
  const result = applyFindings(volume, [spec]);
  return { volume, result, made: result.results[0] };
}

/** Mean world position of a tissue. */
function centreOf(volume: ClassVolume, tissue: number): [number, number, number] {
  const [nx, ny] = volume.dims;
  const sum = [0, 0, 0];
  let n = 0;
  for (let p = 0; p < volume.data.length; p++) {
    if (volume.data[p] !== tissue) continue;
    sum[0] += volume.origin[0] + (p % nx) * volume.spacing[0];
    sum[1] += volume.origin[1] + (Math.floor(p / nx) % ny) * volume.spacing[1];
    sum[2] += volume.origin[2] + Math.floor(p / (nx * ny)) * volume.spacing[2];
    n++;
  }
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

// Real-sized voxel work (distance transforms over organs): slower than most unit tests.
describe("findings", { timeout: 30_000 }, () => {
  it("is deterministic: the same specs make exactly the same patient", () => {
    const specs: FindingSpec[] = [
      { kind: "gallstones", count: 4, largestMm: 10, seed: 3 },
      { kind: "liverCyst", sizeMm: 20, seed: 9 },
      { kind: "renalCyst", side: "left", sizeMm: 24, pole: "upper", seed: 5 },
    ];
    const a = patient();
    const b = patient();
    applyFindings(a, specs);
    applyFindings(b, specs);
    expect(a.data).toEqual(b.data);
  });

  it("measures the organs as a sonographer would", () => {
    const truth = measureCase(patient());
    // The kidneys and spleen pole to pole, the aorta across (outer wall to outer wall).
    expect(truth.kidneyRightMm).toBeGreaterThan(104);
    expect(truth.kidneyRightMm).toBeLessThan(114);
    expect(truth.kidneyLeftMm).toBeGreaterThan(100);
    expect(truth.kidneyLeftMm).toBeLessThan(110);
    expect(truth.spleenMm).toBeGreaterThan(92);
    expect(truth.spleenMm).toBeLessThan(102);
    expect(truth.aortaMm).toBeGreaterThan(17);
    expect(truth.aortaMm).toBeLessThan(23);
  });

  it("makes the stones asked for, inside the gallbladder only", () => {
    const { volume, made } = make({ kind: "gallstones", count: 2, largestMm: 14, seed: 4 });
    expect(made.applied).toBe(true);
    expect(made.facts.stones).toBe(2);
    expect(made.facts.largestMm).toBe(14);
    // The wall is untouched: stones replace bile, nothing else.
    expect(count(volume, TISSUE.gallbladderWall)).toBe(count(patient(), TISSUE.gallbladderWall));
  });

  it("hangs a polyp from the upper (non-dependent) wall, where a stone could not stay", () => {
    const { volume, made } = make({ kind: "gbPolyp", sizeMm: 7, seed: 2 });
    expect(made.applied).toBe(true);
    expect(count(volume, TISSUE.polyp)).toBeGreaterThan(5);
    expect(centreOf(volume, TISSUE.polyp)[1]).toBeGreaterThan(46);
  });

  it("thickens the wall outward in acute cholecystitis, keeping the gallbladder distended", () => {
    const before = count(patient(), TISSUE.gallbladder);
    const { volume, made } = make({ kind: "cholecystitis", wallMm: 7, stones: 1, largestMm: 10, seed: 1 });
    expect(made.facts.wallMm).toBe(7);
    expect(count(volume, TISSUE.wallOedema)).toBeGreaterThan(200);
    // Bile is lost only to the stone in the neck.
    expect(before - count(volume, TISSUE.gallbladder)).toBe(count(volume, TISSUE.stone));
    // Fluid around it.
    expect(count(volume, TISSUE.freeFluid)).toBeGreaterThan(50);
  });

  it("makes a fatty liver brighter and more attenuating with each grade, spared beside the gallbladder", () => {
    const props = ([1, 2, 3] as const).map((grade) => make({ kind: "fattyLiver", grade, sparing: false }).made.overrides[0].props);
    expect(props[0].backscatter ?? 0).toBeGreaterThan(0.55);
    expect(props[1].backscatter ?? 0).toBeGreaterThan(props[0].backscatter ?? 0);
    expect(props[2].backscatter ?? 0).toBeGreaterThan(props[1].backscatter ?? 0);
    expect(props[2].attenuation ?? 0).toBeGreaterThan(props[0].attenuation ?? 0);
    const { volume } = make({ kind: "fattyLiver", grade: 2, sparing: true });
    expect(count(volume, TISSUE.liverSpared)).toBeGreaterThan(50);
  });

  it("puts liver lesions inside the liver", () => {
    const liver = patient();
    const inside = new Uint8Array(liver.data.length);
    for (let p = 0; p < liver.data.length; p++) inside[p] = liver.data[p] === TISSUE.liver ? 1 : 0;
    for (const spec of [
      { kind: "liverCyst", sizeMm: 24, seed: 3 },
      { kind: "hemangioma", sizeMm: 20, seed: 8 },
      { kind: "metastases", count: 3, largestMm: 18, seed: 6 },
    ] as FindingSpec[]) {
      const { volume, made } = make(spec);
      expect(made.applied).toBe(true);
      for (let p = 0; p < volume.data.length; p++) {
        const t = volume.data[p];
        if (t === TISSUE.cyst || t === TISSUE.hemangioma || t === TISSUE.metastasis || t === TISSUE.metastasisHalo) {
          expect(inside[p]).toBe(1);
        }
      }
    }
    const { volume, made } = make({ kind: "metastases", count: 3, largestMm: 18, seed: 6 });
    expect(made.facts.count).toBeGreaterThanOrEqual(2);
    // Target lesions: a core inside a dark halo.
    expect(count(volume, TISSUE.metastasis)).toBeGreaterThan(0);
    expect(count(volume, TISSUE.metastasisHalo)).toBeGreaterThan(0);
  });

  it("dilates more of the collecting system with each grade of hydronephrosis, on the side asked", () => {
    const urine = ([1, 2, 3] as const).map((grade) =>
      count(make({ kind: "hydronephrosis", side: "left", grade }).volume, TISSUE.renalPelvis),
    );
    expect(urine[0]).toBeGreaterThan(20);
    expect(urine[1]).toBeGreaterThan(urine[0]);
    expect(urine[2]).toBeGreaterThan(urine[1]);
    const { volume } = make({ kind: "hydronephrosis", side: "left", grade: 2 });
    expect(centreOf(volume, TISSUE.renalPelvis)[0]).toBeLessThan(-40);
    // The right kidney is untouched.
    expect(count(volume, TISSUE.sinusRight)).toBe(count(patient(), TISSUE.sinusRight));
  });

  it("puts a kidney stone in the lower pole, and a cortical cyst bulging out of the kidney", () => {
    const stone = make({ kind: "renalStone", side: "right", sizeMm: 8, site: "lowerPole" });
    expect(stone.made.applied).toBe(true);
    expect(centreOf(stone.volume, TISSUE.stone)[2]).toBeLessThan(10);
    const before = patient();
    const cyst = make({ kind: "renalCyst", side: "right", sizeMm: 30, pole: "mid", seed: 4 });
    let outside = 0;
    let within = 0;
    for (let p = 0; p < cyst.volume.data.length; p++) {
      if (cyst.volume.data[p] !== TISSUE.cyst) continue;
      if (before.data[p] === TISSUE.kidneyRight || before.data[p] === TISSUE.sinusRight) within++;
      else outside++;
    }
    // Part inside the kidney, part outside it: exophytic.
    expect(within).toBeGreaterThan(30);
    expect(outside).toBeGreaterThan(30);
  });

  it("makes an aneurysm of the size asked, and can bring an aneurysm back to a normal calibre", () => {
    const { result } = make({ kind: "aaa", diameterMm: 46, lumenFraction: 0.6 });
    expect(result.truth.aortaMm).toBeGreaterThan(40);
    expect(result.truth.aortaMm).toBeLessThan(50);
    const volume = patient();
    applyFindings(volume, [{ kind: "aaa", diameterMm: 40, lumenFraction: 1 }]);
    const narrowed = applyFindings(volume, [{ kind: "aortaCalibre", diameterMm: 18 }]);
    expect(narrowed.truth.aortaMm).toBeLessThan(21);
  });

  it("spreads more free fluid with each amount, never into an organ", () => {
    const fluid = ([1, 2, 3] as const).map((amount) => {
      const { volume } = make({ kind: "freeFluid", amount });
      return count(volume, TISSUE.freeFluid) + count(volume, TISSUE.pelvicFluid);
    });
    expect(fluid[0]).toBeGreaterThan(0);
    expect(fluid[1]).toBeGreaterThan(fluid[0]);
    expect(fluid[2]).toBeGreaterThan(fluid[1]);
    const { volume } = make({ kind: "freeFluid", amount: 3 });
    expect(count(volume, TISSUE.liver)).toBe(count(patient(), TISSUE.liver));
    expect(count(volume, TISSUE.kidneyRight)).toBe(count(patient(), TISSUE.kidneyRight));
  });

  it("grows the spleen toward the length asked", () => {
    const { result, made } = make({ kind: "splenomegaly", lengthMm: 140 });
    expect(made.applied).toBe(true);
    expect(result.truth.spleenMm).toBeGreaterThan(125);
    expect(result.truth.spleenMm).toBeLessThan(150);
  });

  it("fills only the lung base on the side asked with pleural fluid, deepest at the back", () => {
    const { volume, made } = make({ kind: "pleuralEffusion", side: "right", depthMm: 30 });
    expect(made.applied).toBe(true);
    const lungBefore = patient();
    for (let p = 0; p < volume.data.length; p++) {
      if (volume.data[p] === TISSUE.pleuralFluid) expect(lungBefore.data[p]).toBe(TISSUE.lung);
    }
    const centre = centreOf(volume, TISSUE.pleuralFluid);
    expect(centre[0]).toBeGreaterThan(0);
    expect(centre[1]).toBeLessThan(-20);
  });

  it("reports when a finding cannot be made in this patient", () => {
    const volume = patient();
    paint(volume, TISSUE.liver, (p) => volume.data.length > 0 && Math.hypot(p[0] - 40, p[1] - 46, p[2] - 32) < 40);
    const { made } = make({ kind: "gbPolyp", sizeMm: 5, seed: 1 }, volume);
    expect(made.applied).toBe(false);
    expect(made.parts).toHaveLength(0);
  });
});
