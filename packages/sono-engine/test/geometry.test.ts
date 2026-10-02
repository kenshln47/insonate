import { describe, expect, it } from "vitest";
import {
  createVolume,
  dot,
  frameFromPose,
  length,
  PROBES,
  planeToPolar,
  planeToWorld,
  scanGeometry,
  scanline,
  TISSUE,
  worldToPlane,
} from "../src";
import { cylinder, paint, skinOf } from "./phantom";

const skin = skinOf(cylinder(100, 200));

describe("skin surface", () => {
  it("measures the radius of a cylindrical body", () => {
    for (const phi of [0, 45, 90, -90, 170]) expect(skin.radiusAt(phi, 0)).toBeCloseTo(100, -0.5);
  });

  it("gives an outward normal and a head-ward tangent", () => {
    const anterior = skin.at(0, 0);
    expect(anterior.normal[1]).toBeCloseTo(1, 1);
    expect(anterior.towardHead[2]).toBeCloseTo(1, 1);
    // φ = +90° is the patient's right (+x).
    expect(skin.at(90, 0).normal[0]).toBeCloseTo(1, 1);
  });

  it("rests the probe on the skin's shape, not on each small bump of it", () => {
    // A body whose skin steps in and out 1.5 mm every centimetre along it, like a segmented surface.
    const spacing = 1.5;
    const n = Math.ceil(230 / spacing);
    const nz = Math.ceil(160 / spacing);
    const half = (count: number) => (-(count - 1) * spacing) / 2;
    const bumpy = createVolume([n, n, nz], [spacing, spacing, spacing], [half(n), half(n), half(nz)]);
    paint(bumpy, TISSUE.liver, (p) => Math.hypot(p[0], p[1]) <= 100 + 1.5 * Math.sin((2 * Math.PI * p[2]) / 10));
    const surface = skinOf(bumpy);
    for (let z = -40; z <= 40; z += 1) {
      // The face bridges the bumps: the beam stays within 2° of square to the body as the probe slides.
      const normal = surface.at(0, z).normal;
      expect((Math.acos(Math.min(1, normal[1])) * 180) / Math.PI).toBeLessThan(2);
    }
  });

  it("locates the skin point under a world position", () => {
    const { phiDeg, zMm } = skin.locate([30, 30, 12]);
    expect(phiDeg).toBeCloseTo(45);
    expect(zMm).toBeCloseTo(12);
    expect(skin.mmPerDegree(0, 0)).toBeCloseTo((2 * Math.PI * 100) / 360, 0);
  });
});

describe("probe frame", () => {
  it("is orthonormal for any pose", () => {
    for (const pose of [
      { phiDeg: 0, zMm: 0, rotationDeg: 0, tiltDeg: 0, rockDeg: 0 },
      { phiDeg: 60, zMm: 20, rotationDeg: 75, tiltDeg: -20, rockDeg: 10 },
      { phiDeg: -100, zMm: -40, rotationDeg: -30, tiltDeg: 35, rockDeg: -15 },
    ]) {
      const f = frameFromPose(skin, pose);
      expect(length(f.beam)).toBeCloseTo(1);
      expect(length(f.lateral)).toBeCloseTo(1);
      expect(dot(f.beam, f.lateral)).toBeCloseTo(0);
      expect(dot(f.beam, f.elevation)).toBeCloseTo(0);
      expect(dot(f.lateral, f.elevation)).toBeCloseTo(0);
    }
  });

  it("follows sonographers' conventions: marker to the head, or to the patient's right", () => {
    const longitudinal = frameFromPose(skin, { phiDeg: 0, zMm: 0, rotationDeg: 0, tiltDeg: 0, rockDeg: 0 });
    expect(longitudinal.beam[1]).toBeCloseTo(-1, 1); // into the body from the front
    expect(longitudinal.lateral[2]).toBeCloseTo(1, 1); // marker toward the head
    const transverse = frameFromPose(skin, { phiDeg: 0, zMm: 0, rotationDeg: 90, tiltDeg: 0, rockDeg: 0 });
    expect(transverse.lateral[0]).toBeCloseTo(1, 1); // marker toward the patient's right
  });

  it("fanning tilts the beam out of the plane, rocking within it", () => {
    const base = frameFromPose(skin, { phiDeg: 0, zMm: 0, rotationDeg: 0, tiltDeg: 0, rockDeg: 0 });
    const fanned = frameFromPose(skin, { phiDeg: 0, zMm: 0, rotationDeg: 0, tiltDeg: 20, rockDeg: 0 });
    const rocked = frameFromPose(skin, { phiDeg: 0, zMm: 0, rotationDeg: 0, tiltDeg: 0, rockDeg: 20 });
    expect(Math.abs(dot(fanned.beam, base.elevation))).toBeCloseTo(Math.sin((20 * Math.PI) / 180));
    expect(Math.abs(dot(rocked.beam, base.lateral))).toBeCloseTo(Math.sin((20 * Math.PI) / 180));
    expect(dot(rocked.elevation, base.elevation)).toBeCloseTo(1);
  });

  it("maps plane coordinates to the world and back", () => {
    const f = frameFromPose(skin, { phiDeg: 30, zMm: 10, rotationDeg: 40, tiltDeg: 12, rockDeg: -6 });
    const p = planeToWorld(f, 23, 71);
    const back = worldToPlane(f, p);
    expect(back.a).toBeCloseTo(23);
    expect(back.d).toBeCloseTo(71);
    expect(back.off).toBeCloseTo(0);
  });
});

describe("scan geometry", () => {
  for (const kind of ["curvilinear", "linear"] as const) {
    it(`${kind}: points along a scanline map back to that line`, () => {
      const g = scanGeometry(PROBES[kind], 120);
      for (const line of [0, 37, g.lines - 1]) {
        const sl = scanline(g, line);
        const t = 50;
        const polar = planeToPolar(g, sl.a + sl.da * t, sl.d + sl.dd * t);
        expect(polar).not.toBeNull();
        expect(polar?.line).toBeCloseTo(line, 6);
        expect(polar?.sample).toBeCloseTo(t / g.sampleMm, 6);
      }
      expect(planeToPolar(g, 0, g.depthMm + 5)).toBeNull();
    });
  }

  it("puts line 0 on the marker side", () => {
    const g = scanGeometry(PROBES.curvilinear, 120);
    expect(scanline(g, 0).a).toBeGreaterThan(0);
    expect(scanline(g, g.lines - 1).a).toBeLessThan(0);
  });
});
