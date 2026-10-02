import { buildSurfaceMap, createVolume, SkinSurface, TISSUE } from "@insonate/sono-engine";
import { describe, expect, it } from "vitest";
import type { CaseLandmarks } from "../case/loader";
import { locateProbe } from "./where";

// A round body (radius 100 mm) from z = -150 to 150, with ribs 9 and 10 crossing the line at φ = 60°.
const spacing = 1.5;
const n = 150;
const nz = 200;
const volume = createVolume(
  [n, n, nz],
  [spacing, spacing, spacing],
  [(-(n - 1) * spacing) / 2, (-(n - 1) * spacing) / 2, (-(nz - 1) * spacing) / 2],
);
for (let k = 0; k < nz; k++) {
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = volume.origin[0] + i * spacing;
      const y = volume.origin[1] + j * spacing;
      volume.data[i + n * (j + n * k)] = Math.hypot(x, y) <= 100 ? TISSUE.soft : TISSUE.outside;
    }
  }
}
const skin = new SkinSurface(buildSurfaceMap(volume));
const landmarks: CaseLandmarks = {
  vertebrae: [
    { name: "T12", centre: [0, -60, 60], front: [0, -40, 60] },
    { name: "L1", centre: [0, -60, 30], front: [0, -40, 30] },
    { name: "L2", centre: [0, -60, 0], front: [0, -40, 0] },
  ],
  costalMargin: [[60, 40]],
  ribLines: [
    {
      phiDeg: 60,
      ribs: [
        [9, 80, 95],
        [10, 40, 55],
      ],
    },
  ],
  xiphoid: [0, 95, 120],
  umbilicus: [0, 100, -40],
  iliacCrests: [
    [80, -40, -90],
    [-80, -40, -90],
  ],
  asis: [
    [90, 30, -120],
    [-90, 30, -120],
  ],
  symphysis: [0, 60, -140],
};
const at = (phiDeg: number, zMm: number) => locateProbe({ phiDeg, zMm, rotationDeg: 0, tiltDeg: 0, rockDeg: 0 }, skin, landmarks);

describe("probe location in words", () => {
  it("knows when the probe is on a rib, between two ribs, or below the rib cage", () => {
    expect(at(60, 48).cage).toEqual({ kind: "rib", rib: 10 });
    expect(at(60, 68).cage).toEqual({ kind: "intercostal", upper: 9, lower: 10 });
    expect(at(60, 20).cage).toEqual({ kind: "subcostal", belowMm: 20 });
  });

  it("measures midline positions from the xiphoid", () => {
    expect(at(0, 90).cage).toEqual({ kind: "belowXiphoid", belowMm: 30 });
    expect(at(0, 90).line).toBe("midline");
    expect(at(0, 90).region).toBe("epigastrium");
  });

  it("names the surface line, the side, the region and the vertebral level", () => {
    expect(at(90, 0).line).toBe("midAxillary");
    expect(at(-90, 0).side).toBe("left");
    expect(at(-90, 0).region).toBe("leftFlank");
    expect(at(35, 20).region).toBe("rightUpperQuadrant");
    expect(at(-35, -60).region).toBe("leftLowerQuadrant");
    expect(at(0, -100).region).toBe("suprapubic");
    expect(at(10, 28).level).toBe("L1");
  });
});
