import { describe, expect, it } from "vitest";
import { aimAt, frameFromPose, sampleClass, TISSUE, worldToPlane } from "../src";
import { cylinder, ellipsoid, paint, skinOf } from "./phantom";

describe("aiming the probe at a point", () => {
  it("puts the point in the image plane, in the sector, at a reachable depth", () => {
    const volume = cylinder(100, 240, 2);
    paint(volume, TISSUE.cyst, ellipsoid([30, 20, 10], [8, 8, 8]));
    const skin = skinOf(volume);
    const target: [number, number, number] = [30, 20, 10];
    const aim = aimAt(volume, skin, target, 160);
    expect(aim).not.toBeNull();
    if (!aim) return;
    const plane = worldToPlane(frameFromPose(skin, aim.pose), target);
    expect(Math.abs(plane.off)).toBeLessThan(3);
    expect(plane.d).toBeGreaterThan(20);
    expect(plane.d).toBeLessThan(148);
    // Near the middle of the sector.
    expect(Math.abs(plane.a)).toBeLessThan(25);
  });

  it("looks around bone rather than through it", () => {
    const volume = cylinder(100, 240, 2);
    // A slab of bone over the front of the target: the aim must come from the side.
    paint(volume, TISSUE.bone, (p) => p[1] > 40 && p[1] < 50 && Math.abs(p[0]) < 60 && Math.abs(p[2]) < 60);
    const skin = skinOf(volume);
    const target: [number, number, number] = [0, 10, 0];
    const aim = aimAt(volume, skin, target, 160);
    expect(aim).not.toBeNull();
    if (!aim) return;
    const frame = frameFromPose(skin, aim.pose);
    // March from the probe to the target: no bone on the way.
    let bone = 0;
    for (let t = 0.02; t < 0.95; t += 0.02) {
      const p: [number, number, number] = [
        frame.origin[0] + (target[0] - frame.origin[0]) * t,
        frame.origin[1] + (target[1] - frame.origin[1]) * t,
        frame.origin[2] + (target[2] - frame.origin[2]) * t,
      ];
      if (sampleClass(volume, p) === TISSUE.bone) bone++;
    }
    expect(bone).toBe(0);
  });
});
