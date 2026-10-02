import {
  buildSurfaceMap,
  createVolume,
  frameFromPose,
  type ProbePose,
  SkinSurface,
  TISSUE,
  type Vec3,
  worldToPlane,
} from "@insonate/sono-engine";
import { describe, expect, it } from "vitest";
import { bring, gripAt, slideInImage } from "./pose";

/** A body-like cylinder (radius 100 mm along z), for a skin to slide on. */
function skin(): SkinSurface {
  const spacing = 2;
  const n = 112;
  const nz = 120;
  const half = (count: number) => (-(count - 1) * spacing) / 2;
  const volume = createVolume([n, n, nz], [spacing, spacing, spacing], [half(n), half(n), half(nz)]);
  const [ox, oy] = volume.origin;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (Math.hypot(ox + i * spacing, oy + j * spacing) <= 100) volume.data[i + n * (j + n * k)] = TISSUE.liver;
      }
    }
  }
  return new SkinSurface(buildSurfaceMap(volume));
}

/** A point in the image plane of `pose`: `a` mm toward the marker, `d` mm deep. */
function inPlane(surface: SkinSurface, pose: ProbePose, a: number, d: number): Vec3 {
  const frame = frameFromPose(surface, pose);
  return [0, 1, 2].map((i) => frame.origin[i] + frame.lateral[i] * a + frame.beam[i] * d) as unknown as Vec3;
}

describe("sliding in the image's directions", () => {
  const surface = skin();

  it("brings a structure to the middle of the image, or keeps it under a dragging pointer", () => {
    for (const rotationDeg of [0, 90, 35]) {
      const pose: ProbePose = { phiDeg: 10, zMm: 0, rotationDeg, tiltDeg: 0, rockDeg: 0 };
      const target = inPlane(surface, pose, 25, 60);
      const centred = worldToPlane(frameFromPose(surface, bring(gripAt(pose, target, surface), surface, 0, 40).pose), target);
      expect(Math.abs(centred.a)).toBeLessThan(0.5);
      expect(Math.abs(centred.off)).toBeLessThan(1);
      // Dragged 10 mm toward the image's right (away from the marker), in pointer-sized steps: it follows.
      let grip = gripAt(pose, target, surface);
      let pose1 = pose;
      for (let a = 24; a >= 15; a--) ({ grip, pose: pose1 } = bring(grip, surface, a));
      expect(worldToPlane(frameFromPose(surface, pose1), target).a).toBeCloseTo(15, 0);
    }
  });

  it("follows a long drag smoothly, and the probe never leaps ahead of the pointer", () => {
    const pose: ProbePose = { phiDeg: -20, zMm: -30, rotationDeg: 60, tiltDeg: 5, rockDeg: 0 };
    // On this small body (10 cm radius), a point 6 cm deep is already near the pivot of a slide.
    for (const depth of [30, 60]) {
      const point = inPlane(surface, pose, 30, depth);
      let grip = gripAt(pose, point, surface);
      let last = pose;
      for (let a = 29; a >= -20; a--) {
        const moved = bring(grip, surface, a);
        grip = moved.grip;
        const leap = Math.hypot(moved.pose.zMm - last.zMm, (moved.pose.phiDeg - last.phiDeg) * surface.mmPerDegree(last.phiDeg, last.zMm));
        // Never more than three times what the pointer asked for (1 mm here), plus a little.
        expect(leap).toBeLessThan(4.5);
        last = moved.pose;
      }
      const shown = worldToPlane(frameFromPose(surface, last), point);
      expect(shown.a).toBeCloseTo(-20, 0);
      expect(Math.abs(shown.off)).toBeLessThan(2);
    }
  });

  it("heel–toes where sliding cannot bring a deep point, and undoes it on the way back", () => {
    // A point at the body's axis: sliding round a cylinder pivots about it, so only heel–toe moves it in the image.
    const pose: ProbePose = { phiDeg: 0, zMm: 0, rotationDeg: 90, tiltDeg: 0, rockDeg: 0 };
    const axis: Vec3 = [surface.map.center[0], surface.map.center[1], 0];
    let grip = gripAt(pose, axis, surface);
    let moved = { grip, pose };
    for (let a = -1; a >= -20; a--) moved = bring(moved.grip, surface, a);
    expect(worldToPlane(frameFromPose(surface, moved.pose), axis).a).toBeCloseTo(-20, 0);
    expect(Math.abs(moved.grip.rock)).toBeGreaterThan(5);
    for (let a = -19; a <= 0; a++) moved = bring(moved.grip, surface, a);
    expect(Math.abs(moved.grip.rock)).toBeLessThan(1);
    grip = moved.grip;
    expect(Math.abs(worldToPlane(frameFromPose(surface, moved.pose), axis).a)).toBeLessThan(1);
    expect(grip.target).toBe(0);
  });

  it("slides the probe along the image as far as asked, at the skin", () => {
    const pose: ProbePose = { phiDeg: 0, zMm: 0, rotationDeg: 0, tiltDeg: 0, rockDeg: 0 };
    // Longitudinal: toward the marker is toward the head.
    expect(slideInImage(pose, surface, 25, 0).zMm).toBeCloseTo(25, 5);
  });

  it("slides across the image plane without moving along it", () => {
    const pose: ProbePose = { phiDeg: 0, zMm: 0, rotationDeg: 0, tiltDeg: 0, rockDeg: 0 };
    // Longitudinal at the midline: across the plane is around the body.
    const moved = slideInImage(pose, surface, 0, 20);
    expect(Math.abs(moved.zMm - pose.zMm)).toBeLessThan(0.5);
    expect(Math.abs(moved.phiDeg - pose.phiDeg)).toBeGreaterThan(5);
    // Transverse: along the image is around the body, across is toward the head or feet.
    const transverse = slideInImage({ ...pose, rotationDeg: 90 }, surface, 0, 20);
    expect(Math.abs(transverse.zMm)).toBeCloseTo(20, 0);
  });
});
