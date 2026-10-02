import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SETTINGS,
  frameFromPose,
  type ImageBuffer,
  type ImageSettings,
  PROBES,
  type ProbeFrame,
  type ScanGeometry,
  scanGeometry,
} from "../packages/sono-engine/src";
import { UltrasoundSimulator } from "../packages/sono-engine/src/simulate";
import { loadCase } from "./case-files";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { json, volume, skin } = loadCase(root, "s0319");
/** The simulator's pipeline stages, timed one by one (they are private). */
interface Stages {
  render(frame: ProbeFrame, settings: ImageSettings, out: ImageBuffer): unknown;
  acquire(frame: ProbeFrame, g: ScanGeometry, settings: ImageSettings): void;
  beamProfile(g: ScanGeometry, settings: ImageSettings): void;
  compress(g: ScanGeometry, settings: ImageSettings): void;
  scanConvert(g: ScanGeometry, out: ImageBuffer): void;
}
const sim = new UltrasoundSimulator(volume) as unknown as Stages;
const task = json.tasks.find((t) => t.id === "morison");
if (!task) throw new Error("The case has no Morison's pouch task");
const frame = frameFromPose(skin, task.pose);
const settings = { ...DEFAULT_SETTINGS };
const out = { width: 560, height: 440, rgba: new Uint8ClampedArray(560 * 440 * 4) };
for (let i = 0; i < 10; i++) sim.render(frame, settings, out); // warm-up
const g = scanGeometry(PROBES.curvilinear, settings.depthMm, Math.max(3, settings.frequencyMHz));
const time = (label: string, fn: () => void) => {
  const t = performance.now();
  for (let i = 0; i < 20; i++) fn();
  console.log(label.padEnd(12), ((performance.now() - t) / 20).toFixed(2), "ms");
};
time("render", () => sim.render(frame, settings, out));
time("acquire", () => sim.acquire(frame, g, settings));
time("beam", () => sim.beamProfile(g, settings));
time("compress", () => sim.compress(g, settings));
time("scan", () => sim.scanConvert(g, out));
console.log("lines", g.lines, "samples", g.samples);
