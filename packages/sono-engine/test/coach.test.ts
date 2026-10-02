import { describe, expect, it } from "vitest";
import {
  adviceText,
  crossSection,
  frameFromPose,
  type OrganInfo,
  type OrganKey,
  optimizePose,
  organStats,
  type ProbePose,
  scorePose,
  suggestAction,
  type TaskTarget,
  TISSUE,
} from "../src";
import { cylinder, ellipsoid, paint, skinOf } from "./phantom";

// A "kidney" 110 mm long (along z), 50 mm wide and 40 mm deep, centred 70 mm below the front skin.
const volume = cylinder();
paint(volume, TISSUE.kidneyRight, ellipsoid([0, 30, 0], [25, 20, 55]));
const skin = skinOf(volume);
const organs = new Map<OrganKey, OrganInfo>(organStats(volume).map((o) => [o.key, o]));
const target: TaskTarget = {
  id: "test-long",
  organ: "kidneyRight",
  view: "long",
  orientation: "longitudinal",
  probe: "curvilinear",
  depthMm: 160,
  measurement: { kind: "length" },
  approach: [-30, 30],
  breath: 0,
};
const ideal: ProbePose = { phiDeg: 0, zMm: 0, rotationDeg: 0, tiltDeg: 0, rockDeg: 0 };
const score = (pose: ProbePose) => scorePose(volume, skin, organs, target, pose);

describe("organ statistics", () => {
  it("finds the organ's centre, long axis and size", () => {
    const kidney = organs.get("kidneyRight");
    expect(kidney).toBeDefined();
    expect(kidney?.centroid[1]).toBeCloseTo(30, 0);
    expect(Math.abs(kidney?.axes[0][2] ?? 0)).toBeCloseTo(1, 2);
    expect(kidney?.extents[0]).toBeGreaterThan(105);
    expect(kidney?.extents[0]).toBeLessThan(115);
    expect(kidney?.volumeMl).toBeCloseTo(((4 / 3) * Math.PI * 25 * 20 * 55) / 1000, -1);
  });
});

describe("view coach", () => {
  it("scores the textbook plane highly", () => {
    const parts = score(ideal);
    expect(parts.total).toBeGreaterThan(80);
    expect(parts.offsetMm).toBeLessThan(2);
    expect(parts.angleErrorDeg).toBeLessThan(3);
  });

  it("penalises the wrong orientation and an off-centre plane", () => {
    expect(score({ ...ideal, rotationDeg: 90 }).total).toBeLessThan(10);
    const off = score({ ...ideal, phiDeg: 40 });
    expect(off.offsetMm).toBeGreaterThan(15);
    expect(off.total).toBeLessThan(20);
  });

  it("suggests a move that improves a nearly-right view", () => {
    const pose = { ...ideal, phiDeg: 10, rotationDeg: 14 };
    const action = suggestAction(volume, skin, organs, target, pose);
    expect(action).not.toBeNull();
    expect(score(action?.pose ?? pose).total).toBeGreaterThan(score(pose).total);
    expect(action?.text).toMatch(/^(Slide|Rotate|Fan|Rock)/);
  });

  it("points the way when the organ is nowhere near the plane", () => {
    const below = suggestAction(volume, skin, organs, target, { ...ideal, zMm: -90 });
    expect(below?.text).toMatch(/toward the head/);
    const aside = suggestAction(volume, skin, organs, target, { ...ideal, phiDeg: 80 });
    expect(aside?.text).toMatch(/patient's left/);
  });

  it("finds the standard view by search", () => {
    const best = optimizePose(volume, skin, organs, target);
    expect(best.score.total).toBeGreaterThan(85);
    expect(Math.abs(best.pose.phiDeg)).toBeLessThan(8);
  });

  it("measures the organ's true cross-section in the plane", () => {
    const long = crossSection(volume, frameFromPose(skin, ideal), "kidneyRight");
    expect(long.lengthMm).toBeGreaterThan(105);
    expect(long.lengthMm).toBeLessThan(115);
    expect(long.apMm).toBeGreaterThan(36);
    expect(long.apMm).toBeLessThan(44);
    // A plane 15 mm off-centre cuts the organ short: the trap of foreshortening.
    const offCentre = crossSection(volume, frameFromPose(skin, { ...ideal, phiDeg: 30 }), "kidneyRight");
    expect(offCentre.lengthMm).toBeLessThan(long.lengthMm - 10);
  });

  it("gives its advice as data that any language can word", () => {
    const action = suggestAction(volume, skin, organs, target, { ...ideal, phiDeg: 10, rotationDeg: 14 });
    expect(action).not.toBeNull();
    if (!action) return;
    expect(["slide", "rotate", "fan", "rock"]).toContain(action.advice.move);
    expect(action.text).toBe(adviceText(action.advice, ""));
    // Far below the organ, whatever the move, it heads for the head.
    const far = suggestAction(volume, skin, organs, target, { ...ideal, zMm: -90 });
    expect(far?.advice.move === "find-height" || far?.advice.move === "slide").toBe(true);
    expect(far && "toward" in far.advice ? far.advice.toward : null).toBe("head");
  });
});
