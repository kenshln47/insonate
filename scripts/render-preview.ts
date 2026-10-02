// Renders the simulated ultrasound at every task's reference pose, next to the
// anatomy in the same plane (the tissue class under each pixel), as PNGs.
//
//   npm run previews [-- outDir]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ABDOMEN_TASKS,
  DEFAULT_SETTINGS,
  frameFromPose,
  PROBES,
  renderClassMap,
  TISSUE_RGB,
  UltrasoundSimulator,
} from "../packages/sono-engine/src";
import { loadCase } from "./case-files";
import { encodePng } from "./png";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] ?? join(root, "data", "previews");
mkdirSync(outDir, { recursive: true });
const { json, volume, skin } = loadCase(root, "s0319");
const simulator = new UltrasoundSimulator(volume);
const width = 520;
const height = 400;

for (const task of json.tasks) {
  const target = ABDOMEN_TASKS.find((t) => t.id === task.id);
  if (!target) continue;
  const frame = frameFromPose(skin, task.pose);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const settings = {
    ...DEFAULT_SETTINGS,
    probe: target.probe,
    depthMm: target.depthMm,
    frequencyMHz: PROBES[target.probe].frequencyMHz,
    focusMm: target.depthMm * 0.5,
    noise: false,
    persistence: 0,
    // The breath the reference view was found in.
    breath: task.breath ?? 0,
  };
  const t0 = performance.now();
  const info = simulator.render(frame, settings, { width, height, rgba });
  const ms = performance.now() - t0;
  const classes = new Uint8Array(width * height);
  renderClassMap(volume, frame, info.geometry, info.view, settings.breath, classes);
  // Side by side: ultrasound | anatomy.
  const both = new Uint8Array(width * 2 * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const left = (y * width * 2 + x) * 4;
      const right = left + width * 4;
      both.set(rgba.subarray(src, src + 4), left);
      const [r, g, b] = TISSUE_RGB[classes[y * width + x]];
      both.set([r, g, b, 255], right);
    }
  }
  writeFileSync(join(outDir, `${task.id}.png`), encodePng(width * 2, height, both));
  const seen = Object.entries(info.organs)
    .map(([k, v]) => `${k}:${Math.round(v?.areaMm2 ?? 0)}`)
    .join(" ");
  console.log(`${task.id.padEnd(20)} ${ms.toFixed(0).padStart(4)} ms  contact ${(info.contact * 100).toFixed(0)}%  ${seen}`);
}
