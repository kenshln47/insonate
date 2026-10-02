import { describe, expect, it } from "vitest";
import {
  BREATH_EXCURSION_MM,
  breathShiftMm,
  classAtVoxel,
  createVolume,
  MOVES_WITH_BREATH,
  type OrganInfo,
  type OrganKey,
  organStats,
  organsWithBreath,
  sampleClass,
  TISSUE,
  withBreath,
} from "../src";
import { ellipsoid, paint } from "./phantom";

// The inside of an abdomen (deep soft tissue, which moves) behind a fixed body wall, with a kidney
// (moves with breathing) on a muscle (does not), and the aorta (does not).
function patient() {
  const spacing = 1.5;
  const volume = createVolume([80, 60, 120], [spacing, spacing, spacing], [-59.25, -44.25, -89.25]);
  paint(volume, TISSUE.deepSoft, () => true);
  paint(volume, TISSUE.soft, (p) => p[1] > 30);
  paint(volume, TISSUE.kidneyRight, ellipsoid([25, 0, 0], [15, 12, 30]));
  paint(volume, TISSUE.muscle, ellipsoid([25, -20, -40], [10, 8, 30]));
  paint(volume, TISSUE.aorta, ellipsoid([-25, 0, 0], [8, 8, 40]));
  return volume;
}

describe("breathing", () => {
  it("moves the abdomen's contents toward the feet, and nothing fixed", () => {
    const volume = patient();
    const held = withBreath(volume, 1);
    // Without a liver and bladder to scale by (a phantom), everything moves the full distance.
    const lowerPole = -30 - BREATH_EXCURSION_MM;
    expect(sampleClass(volume, [25, 0, lowerPole + 3])).toBe(TISSUE.deepSoft);
    expect(sampleClass(held, [25, 0, lowerPole + 3])).toBe(TISSUE.kidneyRight);
    // The aorta is fixed to the spine, the body wall to the skin: unchanged.
    for (const z of [-35, 0, 35]) {
      expect(sampleClass(held, [-25, 0, z])).toBe(sampleClass(volume, [-25, 0, z]));
      expect(sampleClass(held, [0, 40, z])).toBe(TISSUE.soft);
    }
  });

  it("never lets a moving organ into fixed tissue: the kidney slides along the muscle, not into it", () => {
    const volume = patient();
    const held = withBreath(volume, 1);
    // Where the kidney's lower pole would arrive, the muscle stays muscle...
    expect(sampleClass(volume, [25, -14, -40])).toBe(TISSUE.muscle);
    expect(sampleClass(held, [25, -14, -40])).toBe(TISSUE.muscle);
    // ...and beside the muscle, the kidney does arrive.
    expect(sampleClass(held, [25, 0, -40])).toBe(TISSUE.kidneyRight);
    // Nothing fixed changes anywhere in the volume.
    const [nx, ny, nz] = volume.dims;
    let changed = 0;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const c = volume.data[i + nx * (j + ny * k)];
          if ((c === TISSUE.muscle || c === TISSUE.soft || c === TISSUE.aorta) && classAtVoxel(held, i, j, k) !== c) changed++;
        }
      }
    }
    expect(changed).toBe(0);
  });

  it("is the scanned volume itself when the breath is out", () => {
    const volume = patient();
    expect(withBreath(volume, 0)).toBe(volume);
  });

  it("moves organs less the further they are from the diaphragm, and the bladder not at all", () => {
    const spacing = 2;
    const volume = createVolume([60, 50, 160], [spacing, spacing, spacing], [-59, -49, -159]);
    paint(volume, TISSUE.deepSoft, () => true);
    paint(volume, TISSUE.liver, ellipsoid([20, 0, 120], [30, 30, 30]));
    paint(volume, TISSUE.kidneyRight, ellipsoid([25, -20, 20], [12, 10, 25]));
    paint(volume, TISSUE.bladder, ellipsoid([0, 10, -120], [20, 18, 15]));
    const liverTop = 150;
    const bladderTop = -105;
    // Just under the diaphragm: the full excursion; the kidney, lower down, less; the bladder, none.
    expect(breathShiftMm(volume, 1, liverTop - 50)).toBeCloseTo(BREATH_EXCURSION_MM, 0);
    const kidney = breathShiftMm(volume, 1, 20);
    expect(kidney).toBeGreaterThan(0.4 * BREATH_EXCURSION_MM);
    expect(kidney).toBeLessThan(0.85 * BREATH_EXCURSION_MM);
    expect(breathShiftMm(volume, 1, bladderTop - 10)).toBe(0);
    const held = withBreath(volume, 1);
    expect(sampleClass(held, [0, 10, -120])).toBe(TISSUE.bladder);
    // Quiet breathing moves everything proportionally less.
    expect(breathShiftMm(volume, 0.5, 20)).toBeCloseTo(kidney / 2, 1);
  });

  it("shifts the coach's organ centres the same way", () => {
    const volume = patient();
    const organs = new Map<OrganKey, OrganInfo>(organStats(volume).map((o) => [o.key, o]));
    const moved = organsWithBreath(organs, 1, volume);
    expect(MOVES_WITH_BREATH.kidneyRight).toBe(true);
    expect(MOVES_WITH_BREATH.aorta).toBe(false);
    const kidney = organs.get("kidneyRight");
    expect(moved.get("kidneyRight")?.centroid[2]).toBeCloseTo((kidney?.centroid[2] ?? 0) - BREATH_EXCURSION_MM, 5);
    expect(moved.get("aorta")?.centroid).toEqual(organs.get("aorta")?.centroid);
  });

  it("moves the stomach and bowel, but never bone: organs slide under the ribs, not through them", () => {
    const volume = patient();
    paint(volume, TISSUE.stomachWall, ellipsoid([0, 20, 40], [10, 6, 8]));
    paint(volume, TISSUE.bowelWall, ellipsoid([0, 20, -20], [10, 6, 8]));
    paint(volume, TISSUE.bone, ellipsoid([25, 0, -45], [6, 6, 3]));
    const held = withBreath(volume, 1);
    expect(sampleClass(held, [0, 20, 40 - BREATH_EXCURSION_MM])).toBe(TISSUE.stomachWall);
    expect(sampleClass(held, [0, 20, -20 - BREATH_EXCURSION_MM])).toBe(TISSUE.bowelWall);
    // The kidney's lower pole slides down to where the bone is, but the bone stays.
    expect(sampleClass(held, [25, 0, -45])).toBe(TISSUE.bone);
  });
});
