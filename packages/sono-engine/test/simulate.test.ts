import { describe, expect, it } from "vitest";
import {
  type ClassVolume,
  DEFAULT_SETTINGS,
  frameFromPose,
  type ImageSettings,
  type ProbePose,
  planeToPixel,
  type RenderInfo,
  renderClassMap,
  TISSUE,
  UltrasoundSimulator,
} from "../src";
import { cylinder, ellipsoid, paint, skinOf } from "./phantom";

const SIZE = 320;
// Transverse, from the front: a = toward the patient's right (+x), d = depth (−y).
const POSE: ProbePose = { phiDeg: 0, zMm: 0, rotationDeg: 90, tiltDeg: 0, rockDeg: 0 };
const SETTINGS: ImageSettings = { ...DEFAULT_SETTINGS, depthMm: 140, focusMm: 60, noise: false };

function render(volume: ClassVolume, settings = SETTINGS, pose = POSE): { rgba: Uint8ClampedArray; info: RenderInfo } {
  const simulator = new UltrasoundSimulator(volume);
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  const info = simulator.render(frameFromPose(skinOf(volume), pose), settings, { width: SIZE, height: SIZE, rgba });
  return { rgba, info };
}

/** Mean brightness (0–255) of a small square around plane point (a, d). */
function brightness(result: { rgba: Uint8ClampedArray; info: RenderInfo }, a: number, d: number, halfMm = 4): number {
  const { view } = result.info;
  const centre = planeToPixel(view, a, d);
  const half = Math.max(1, Math.round(halfMm / view.mmPerPixel));
  let sum = 0;
  let n = 0;
  for (let y = Math.round(centre.y) - half; y <= Math.round(centre.y) + half; y++) {
    for (let x = Math.round(centre.x) - half; x <= Math.round(centre.x) + half; x++) {
      sum += result.rgba[(y * SIZE + x) * 4];
      n++;
    }
  }
  return sum / n;
}

/** Anterior skin is at y = 100 mm, so depth d lies at y = 100 − d. */
const atDepth = (x: number, d: number, z = 0): [number, number, number] => [x, 100 - d, z];

describe("ultrasound simulator", () => {
  it("shows a fluid-filled cyst as anechoic, with posterior enhancement", () => {
    const volume = cylinder();
    paint(volume, TISSUE.gallbladder, ellipsoid(atDepth(0, 60), [15, 15, 15]));
    const image = render(volume);
    const beside = (brightness(image, 35, 60) + brightness(image, -35, 60)) / 2;
    expect(beside).toBeGreaterThan(40);
    expect(brightness(image, 0, 60)).toBeLessThan(beside * 0.25);
    const behind = brightness(image, 0, 100);
    const besideDeep = (brightness(image, 40, 100) + brightness(image, -40, 100)) / 2;
    expect(behind).toBeGreaterThan(besideDeep + 15);
    // The cyst is measured as the gallbladder, about π·15² mm² in the plane.
    const area = image.info.organs.gallbladder?.areaMm2 ?? 0;
    expect(area).toBeGreaterThan(Math.PI * 15 * 15 * 0.7);
    expect(area).toBeLessThan(Math.PI * 15 * 15 * 1.3);
  });

  it("casts an acoustic shadow behind bone", () => {
    const volume = cylinder();
    paint(volume, TISSUE.bone, (p) => Math.abs(p[0]) <= 15 && p[1] <= 100 - 30 && p[1] >= 100 - 36);
    const image = render(volume);
    const shadow = brightness(image, 0, 80);
    const beside = (brightness(image, 40, 80) + brightness(image, -40, 80)) / 2;
    expect(beside).toBeGreaterThan(40);
    expect(shadow).toBeLessThan(beside * 0.2);
  });

  it("is deterministic without electronic noise", () => {
    const volume = cylinder();
    const a = render(volume);
    const b = render(volume);
    let differences = 0;
    for (let i = 0; i < a.rgba.length; i++) if (a.rgba[i] !== b.rgba[i]) differences++;
    expect(differences).toBe(0);
  });

  it("responds to gain and depth like a real scanner", () => {
    const volume = cylinder();
    const normal = brightness(render(volume), 0, 50, 10);
    const louder = brightness(render(volume, { ...SETTINGS, gainDb: 12 }), 0, 50, 10);
    expect(louder).toBeGreaterThan(normal + 20);
    const shallow = render(volume, { ...SETTINGS, depthMm: 60 });
    expect(shallow.info.geometry.depthMm).toBe(60);
    // Same depth occupies more pixels when the image shows less.
    expect(shallow.info.view.mmPerPixel).toBeLessThan(render(volume).info.view.mmPerPixel);
  });

  it("reports lost contact when the face lifts off the skin", () => {
    const volume = cylinder();
    const resting = render(volume);
    expect(resting.info.contact).toBeGreaterThan(0.95);
    // Rock hard: the heel of the face leaves the skin.
    const rocked = render(volume, SETTINGS, { ...POSE, rockDeg: 60 });
    expect(rocked.info.contact).toBeLessThan(resting.info.contact);
  });

  it("shows a gas pocket as a bright surface with a dirty shadow behind it", () => {
    const volume = cylinder();
    paint(volume, TISSUE.air, ellipsoid(atDepth(0, 35), [12, 4, 30]));
    const image = render(volume);
    const surface = brightness(image, 0, 31, 2);
    const tissue = (brightness(image, 40, 31, 2) + brightness(image, -40, 31, 2)) / 2;
    expect(surface).toBeGreaterThan(tissue + 30);
    const shadow = brightness(image, 0, 95, 5);
    const beside = (brightness(image, 45, 95, 5) + brightness(image, -45, 95, 5)) / 2;
    expect(shadow).toBeLessThan(beside * 0.6);
  });

  it("pushes bowel gas aside under firm pressure (graded compression), but not deep gas", () => {
    const volume = cylinder();
    paint(volume, TISSUE.air, ellipsoid(atDepth(0, 35), [12, 4, 30]));
    const pressed = (pressure: number) => {
      const simulator = new UltrasoundSimulator(volume);
      const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
      const info = simulator.render(
        frameFromPose(skinOf(volume), POSE, pressure),
        { ...SETTINGS, pressure },
        { width: SIZE, height: SIZE, rgba },
      );
      return { rgba, info };
    };
    // At rest, the gas shadows what lies behind it; pressed, the tissue behind shows again.
    const resting = brightness(pressed(0), 0, 95, 5);
    const firm = pressed(1);
    // The face sinks 12 mm into the wall: what was at 95 mm is now at 83 mm.
    const behind = brightness(firm, 0, 83, 5);
    const beside = (brightness(firm, 45, 83, 5) + brightness(firm, -45, 83, 5)) / 2;
    expect(behind).toBeGreaterThan(resting + 20);
    expect(behind).toBeGreaterThan(beside * 0.7);
    // Gas deeper than the pressure reaches stays.
    const deep = cylinder();
    paint(deep, TISSUE.air, ellipsoid(atDepth(0, 100), [12, 4, 30]));
    const deepResult = (() => {
      const simulator = new UltrasoundSimulator(deep);
      const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
      const info = simulator.render(
        frameFromPose(skinOf(deep), POSE, 1),
        { ...SETTINGS, pressure: 1 },
        { width: SIZE, height: SIZE, rgba },
      );
      return { rgba, info };
    })();
    const deepShadow = brightness(deepResult, 0, 120, 5);
    const deepBeside = (brightness(deepResult, 45, 120, 5) + brightness(deepResult, -45, 120, 5)) / 2;
    expect(deepShadow).toBeLessThan(deepBeside * 0.6);
  });

  it("sinks the face into the wall as the probe is pressed", () => {
    const volume = cylinder();
    const skin = skinOf(volume);
    const resting = frameFromPose(skin, POSE);
    const firm = frameFromPose(skin, POSE, 1);
    const sunk = Math.hypot(firm.origin[0] - resting.origin[0], firm.origin[1] - resting.origin[1], firm.origin[2] - resting.origin[2]);
    expect(sunk).toBeCloseTo(12, 5);
    expect(firm.beam).toEqual(resting.beam);
  });

  it("mirrors the liver beyond the diaphragm, unlike bowel gas", () => {
    const withLung = cylinder();
    paint(withLung, TISSUE.lung, (p) => p[1] < 100 - 80);
    const withGas = cylinder();
    paint(withGas, TISSUE.air, (p) => p[1] < 100 - 80);
    const lung = brightness(render(withLung), 0, 102, 6);
    const gas = brightness(render(withGas), 0, 102, 6);
    expect(lung).toBeGreaterThan(40);
    expect(lung).toBeGreaterThan(gas + 20);
  });
});

describe("anatomy map", () => {
  it("names the tissue under every pixel of the image, in the same plane", () => {
    const volume = cylinder();
    paint(volume, TISSUE.gallbladder, ellipsoid(atDepth(0, 60), [15, 15, 15]));
    const image = render(volume);
    const { view, geometry } = image.info;
    const classes = new Uint8Array(view.width * view.height);
    renderClassMap(volume, frameFromPose(skinOf(volume), POSE), geometry, view, 0, classes);
    const at = (a: number, d: number) => {
      const p = planeToPixel(view, a, d);
      return classes[Math.round(p.y) * view.width + Math.round(p.x)];
    };
    expect(at(0, 60)).toBe(TISSUE.gallbladder);
    expect(at(35, 60)).toBe(TISSUE.liver);
    expect(classes[0]).toBe(TISSUE.outside);
  });
});
