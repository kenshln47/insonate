// Renders each teaching case (pathology variant) at a view of its finding, next to the anatomy
// in the same plane, as PNGs in data/previews/cases.
//
//   npx tsx scripts/render-variants.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyVariant,
  type ClassVolume,
  DEFAULT_SETTINGS,
  frameFromPose,
  type ProbePose,
  renderClassMap,
  TISSUE_RGB,
  UltrasoundSimulator,
  VARIANTS,
  type Variant,
} from "../packages/sono-engine/src";
import { loadCase } from "./case-files";
import { encodePng } from "./png";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "data", "previews", "cases");
mkdirSync(outDir, { recursive: true });
const { json, volume, skin } = loadCase(root, "s0319");
const pose = (id: string) => json.tasks.find((t) => t.id === id) ?? json.tasks[0];

/** Where to look at each case's finding, and the breath to look in. */
const VIEWS: Record<Variant, { task: string; patch?: Partial<ProbePose>; depthMm: number }> = {
  normal: { task: "gallbladder-long", depthMm: 140 },
  gallstones: { task: "gallbladder-long", depthMm: 140 },
  freeFluid: { task: "morison", depthMm: 160 },
  hydronephrosis: { task: "kidney-right-long", depthMm: 160 },
  aaa: { task: "aorta-transverse", patch: { zMm: 10, tiltDeg: 0, phiDeg: -12 }, depthMm: 180 },
  liverCyst: { task: "kidney-right-long", depthMm: 160 },
  fattyLiver: { task: "kidney-right-long", depthMm: 160 },
};

const width = 520;
const height = 400;
for (const variant of VARIANTS) {
  const copy: ClassVolume = { ...volume, data: volume.data.slice() };
  const result = applyVariant(copy, variant);
  const simulator = new UltrasoundSimulator(copy);
  simulator.setTissues(result.overrides);
  const view = VIEWS[variant];
  const task = pose(view.task);
  const p = { ...task.pose, ...view.patch };
  const frame = frameFromPose(skin, p);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const settings = {
    ...DEFAULT_SETTINGS,
    depthMm: view.depthMm,
    focusMm: view.depthMm * 0.5,
    noise: false,
    persistence: 0,
    breath: task.breath ?? 0,
  };
  const info = simulator.render(frame, settings, { width, height, rgba });
  const classes = new Uint8Array(width * height);
  renderClassMap(copy, frame, info.geometry, info.view, settings.breath, classes);
  const both = new Uint8Array(width * 2 * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const left = (y * width * 2 + x) * 4;
      both.set(rgba.subarray(src, src + 4), left);
      const [r, g, b] = TISSUE_RGB[classes[y * width + x]];
      both.set([r, g, b, 255], left + width * 4);
    }
  }
  writeFileSync(join(outDir, `${variant}.png`), encodePng(width * 2, height, both));
  console.log(variant.padEnd(16), JSON.stringify(result.facts), result.focus?.map((v) => v.toFixed(0)).join(",") ?? "");
}
