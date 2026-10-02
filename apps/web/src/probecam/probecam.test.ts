import { buildSurfaceMap, createVolume, SkinSurface, TISSUE } from "@insonate/sono-engine";
import aruco from "js-aruco2";
import { describe, expect, it } from "vitest";
import { FRONT_AXES, OneEuro, ProbeCamMapper, readMarker } from "./mapping";
import { DICTIONARY, focalLength, MARKER_BITS, MARKER_ID } from "./marker";
import { type CameraModel, greyToRgba, IDENTITY, type Matrix3, multiply, renderMarker, rotation } from "./synthetic";
import { type MarkerObservation, MarkerTracker } from "./tracker";
import { AR } from "./vendor/aruco.js";

const camera: CameraModel = { width: 480, height: 360, focalPx: focalLength(480) };
const tracker = new MarkerTracker();

function observe(r: Matrix3, t: [number, number, number]): MarkerObservation {
  const image = { width: camera.width, height: camera.height, data: greyToRgba(renderMarker(camera, r, t)) };
  const seen = tracker.detect(image);
  if (!seen) throw new Error("marker not found");
  return seen;
}

describe("printed marker", () => {
  it("matches the js-aruco2 dictionary, original and vendored", () => {
    expect(new aruco.AR.Dictionary(DICTIONARY).codeList[MARKER_ID]).toBe(MARKER_BITS);
    expect(new AR.Dictionary(DICTIONARY).codeList[MARKER_ID]).toBe(MARKER_BITS);
  });
});

describe("marker tracking", () => {
  it("finds the marker and its distance", () => {
    const seen = observe(IDENTITY, [0, 0, 350]);
    expect(seen.corners).toHaveLength(4);
    expect(seen.position[2]).toBeGreaterThan(330);
    expect(seen.position[2]).toBeLessThan(370);
  });

  it("reads position as the user sees it in the mirrored preview", () => {
    const left = readMarker(observe(IDENTITY, [-40, 0, 350]));
    const right = readMarker(observe(IDENTITY, [40, 25, 350]));
    // Camera x is mirrored for the user.
    expect(left.x - right.x).toBeGreaterThan(70);
    expect(right.y - left.y).toBeGreaterThan(20);
  });

  it("reads roll (anticlockwise for the user is positive)", () => {
    const flat = readMarker(observe(IDENTITY, [0, 0, 350]));
    const turned = readMarker(observe(rotation("z", 30), [0, 0, 350]));
    expect(flat.roll).toBeCloseTo(0, -0.5);
    // Anticlockwise for the camera looks clockwise in the mirror.
    expect(turned.roll - flat.roll).toBeCloseTo(-30, -0.5);
  });

  it("separates fanning from rocking, whatever the roll", () => {
    for (const roll of [0, 60]) {
      const base = rotation("z", roll);
      const fanned = readMarker(observe(multiply(base, rotation("x", 25)), [0, 0, 350]));
      const rocked = readMarker(observe(multiply(base, rotation("y", 25)), [0, 0, 350]));
      expect(Math.abs(fanned.fan)).toBeGreaterThan(17);
      expect(Math.abs(fanned.rock)).toBeLessThan(8);
      expect(Math.abs(rocked.rock)).toBeGreaterThan(17);
      expect(Math.abs(rocked.fan)).toBeLessThan(8);
    }
  });
});

describe("one-euro filter", () => {
  it("smooths jitter but follows a real movement", () => {
    const filter = new OneEuro();
    let out = 0;
    for (let i = 0; i < 60; i++) out = filter.filter(i % 2 === 0 ? 0.5 : -0.5, i * 33);
    expect(Math.abs(out)).toBeLessThan(0.35);
    for (let i = 60; i < 90; i++) out = filter.filter(50, i * 33);
    expect(out).toBeGreaterThan(48);
  });
});

describe("probe mapping", () => {
  // A cylindrical body, radius 120 mm.
  const n = 100;
  const volume = createVolume([n, n, 80], [3, 3, 3], [-(n - 1) * 1.5, -(n - 1) * 1.5, -79 * 1.5]);
  for (let k = 0; k < 80; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (Math.hypot(i * 3 + volume.origin[0], j * 3 + volume.origin[1]) <= 120) volume.data[i + n * (j + n * k)] = TISSUE.soft;
      }
    }
  }
  const skin = new SkinSurface(buildSurfaceMap(volume));
  const start = { phiDeg: 0, zMm: 0, rotationDeg: 0, tiltDeg: 0, rockDeg: 0 };
  const reading = (x: number, y = 0, roll = 0, fan = 0, rock = 0) => ({ x, y, roll, fan, rock });

  /** Feed readings for a second (30 Hz) so the filter settles; return the final pose. */
  function drive(mapper: ProbeCamMapper, readings: ReturnType<typeof reading>[]) {
    let pose = start;
    let t = 0;
    for (const r of readings) {
      for (let i = 0; i < 30; i++) {
        pose = mapper.update(r, t, pose, skin, FRONT_AXES) ?? pose;
        t += 33;
      }
    }
    return pose;
  }

  it("does not move the probe when the marker is first found", () => {
    const mapper = new ProbeCamMapper();
    expect(mapper.update(reading(10), 0, start, skin, FRONT_AXES)).toBeNull();
  });

  it("slides the probe the way the marker moves on screen", () => {
    // Front view: screen right is the patient's left (φ decreases), screen up is the head.
    const right = drive(new ProbeCamMapper(), [reading(0), reading(20)]);
    expect(right.phiDeg).toBeLessThan(-10);
    expect(Math.abs(right.zMm)).toBeLessThan(1);
    const up = drive(new ProbeCamMapper(), [reading(0), reading(0, 20)]);
    expect(up.zMm).toBeGreaterThan(25);
    expect(Math.abs(up.phiDeg)).toBeLessThan(1);
  });

  it("turns, fans and rocks relative to the grip", () => {
    const pose = drive(new ProbeCamMapper(), [reading(0), reading(0, 0, 40, 15, -10)]);
    expect(pose.rotationDeg).toBeCloseTo(40, 0);
    expect(pose.tiltDeg).toBeCloseTo(15, 0);
    expect(pose.rockDeg).toBeCloseTo(-10, 0);
  });

  it("treats a big jump as a new grip, not a movement", () => {
    const pose = drive(new ProbeCamMapper(), [reading(0), reading(120)]);
    expect(Math.abs(pose.phiDeg)).toBeLessThan(1);
  });
});
