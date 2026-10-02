import { describe, expect, it } from "vitest";
import {
  buildFlowField,
  cardiacPhase,
  DEFAULT_SETTINGS,
  frameFromPose,
  HEART_RATE_BPM,
  type ImageSettings,
  type ProbePose,
  TISSUE,
  UltrasoundSimulator,
  VESSELS,
  waveform,
} from "../src";
import { cylinder, paint, skinOf } from "./phantom";

// An "aorta" 20 mm wide running head to foot, 100 mm under the front skin. Blood enters at the top.
const volume = cylinder();
paint(volume, TISSUE.aorta, (p) => Math.hypot(p[0], p[1]) <= 10 && Math.abs(p[2]) <= 100);
const skin = skinOf(volume);
const flow = buildFlowField(volume);
const simulator = new UltrasoundSimulator(volume);
simulator.setFlow(flow);
const SYSTOLE_MS = (0.13 * 60000) / HEART_RATE_BPM;

const size = { width: 200, height: 160 };
function colours(pose: ProbePose, patch: Partial<ImageSettings> = {}): { red: number; blue: number } {
  const rgba = new Uint8ClampedArray(size.width * size.height * 4);
  const settings: ImageSettings = {
    ...DEFAULT_SETTINGS,
    noise: false,
    depthMm: 160,
    doppler: "color",
    // A narrow box in the middle of the fan, where every line meets the vessel at the same angle.
    colorBox: { center: 0.5, width: 0.12, top: 60, bottom: 140 },
    scaleCmS: 120,
    timeMs: SYSTOLE_MS,
    ...patch,
  };
  // Each view is a fresh start: no colour persistence carried over from the last one.
  simulator.resetPersistence();
  simulator.render(frameFromPose(skin, pose), settings, { ...size, rgba });
  let red = 0;
  let blue = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] > 140 && rgba[i + 2] < 110 && rgba[i] - rgba[i + 1] > 60) red++;
    if (rgba[i + 2] > 140 && rgba[i] < 110 && rgba[i + 2] - rgba[i + 1] > 30) blue++;
  }
  return { red, blue };
}

// Longitudinal over the vessel, the beam rocked 25° toward the head or toward the feet.
const toHead: ProbePose = { phiDeg: 0, zMm: 0, rotationDeg: 0, tiltDeg: 0, rockDeg: -25 };
const toFeet: ProbePose = { ...toHead, rockDeg: 25 };

describe("Doppler", () => {
  it("finds the direction of flow from the vessel's shape: down the aorta", () => {
    expect(flow.count).toBeGreaterThan(1000);
    let z = 0;
    let n = 0;
    for (let s = 0; s < flow.keys.length; s++) {
      if (flow.keys[s] < 0) continue;
      expect(VESSELS[flow.kind[s]]).toBe("aorta");
      z += flow.direction[s * 3 + 2] / 127;
      n++;
    }
    expect(z / n).toBeLessThan(-0.9);
  });

  it("shows flow toward the probe in red and away in blue (BART)", () => {
    // Beam angled toward the head: blood going to the feet comes toward the probe.
    const toward = colours(toHead);
    expect(toward.red).toBeGreaterThan(100);
    expect(toward.red).toBeGreaterThan(toward.blue * 5);
    const away = colours(toFeet);
    expect(away.blue).toBeGreaterThan(100);
    expect(away.blue).toBeGreaterThan(away.red * 5);
    // Invert swaps the colours.
    const inverted = colours(toHead, { colorInvert: true });
    expect(inverted.blue).toBeGreaterThan(inverted.red * 5);
  });

  it("loses the colour when the beam meets the flow at 90°", () => {
    const perpendicular = colours({ ...toHead, rockDeg: 0 });
    expect(perpendicular.red + perpendicular.blue).toBeLessThan(colours(toHead).red / 10);
  });

  it("aliases when the flow is faster than the scale", () => {
    // At a low scale, the fast core of the vessel wraps around to the opposite colour.
    const aliased = colours(toHead, { scaleCmS: 12 });
    expect(aliased.blue).toBeGreaterThan(30);
    expect(aliased.red).toBeGreaterThan(30);
  });

  it("puts the aorta's triphasic waveform and the vessel's blood in the PW gate", () => {
    const peak = waveform("aorta", 0.13);
    expect(peak).toBeGreaterThan(0.95);
    // Early diastole: brief reversal.
    expect(waveform("aorta", 0.31)).toBeLessThan(0);
    expect(waveform("portal", cardiacPhase(400))).toBeGreaterThan(0.7);
    const rgba = new Uint8ClampedArray(size.width * size.height * 4);
    const info = simulator.render(
      frameFromPose(skin, toHead),
      { ...DEFAULT_SETTINGS, noise: false, depthMm: 160, doppler: "pw", gate: { a: 0, d: 100, lengthMm: 4 } },
      { ...size, rgba },
    );
    const gate = info.gate;
    expect(gate).not.toBeNull();
    expect(gate?.toward.length ?? 0).toBeGreaterThan(20);
    // Toward the probe, at about 90° − 25° to the flow.
    const mean = (gate?.toward ?? new Float32Array()).reduce((sum, v) => sum + v, 0) / (gate?.toward.length || 1);
    expect(mean).toBeGreaterThan(0.1);
    expect(gate?.flowAngleDeg ?? 0).toBeGreaterThan(55);
    expect(gate?.flowAngleDeg ?? 90).toBeLessThan(75);
  });
});
