// Renders every kind of finding the report exam can make, in both patients, at the view the
// "Show me" aim finds for it, next to the anatomy in the same plane: PNGs in data/previews/findings.
// A check that each finding looks like the real thing and that the aim really shows it.
//
//   npx tsx scripts/render-findings.ts [s0319|s0139] [kind...]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aimAt,
  applyFindings,
  breathShiftMm,
  type ClassVolume,
  DEFAULT_SETTINGS,
  type FindingSpec,
  frameFromPose,
  RESPIRATORY,
  renderClassMap,
  sampleClass,
  TISSUE,
  TISSUE_RGB,
  UltrasoundSimulator,
  withBreath,
} from "../packages/sono-engine/src";
import { loadCase } from "./case-files";
import { encodePng } from "./png";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "data", "previews", "findings");
mkdirSync(outDir, { recursive: true });

const SAMPLES: Record<string, FindingSpec> = {
  gallstones: { kind: "gallstones", count: 4, largestMm: 11, seed: 7 },
  bigStone: { kind: "gallstones", count: 1, largestMm: 22, seed: 3 },
  gbPolyp: { kind: "gbPolyp", sizeMm: 6, seed: 5 },
  cholecystitis: { kind: "cholecystitis", wallMm: 8.5, stones: 2, largestMm: 12, seed: 9 },
  fatty1: { kind: "fattyLiver", grade: 1, sparing: false },
  fatty2: { kind: "fattyLiver", grade: 2, sparing: true },
  fatty3: { kind: "fattyLiver", grade: 3, sparing: true },
  liverCyst: { kind: "liverCyst", sizeMm: 28, seed: 11 },
  hemangioma: { kind: "hemangioma", sizeMm: 22, seed: 4 },
  metastases: { kind: "metastases", count: 5, largestMm: 26, seed: 8 },
  hydro1: { kind: "hydronephrosis", side: "right", grade: 1 },
  hydro2Left: { kind: "hydronephrosis", side: "left", grade: 2 },
  hydro3: { kind: "hydronephrosis", side: "right", grade: 3 },
  renalStone: { kind: "renalStone", side: "left", sizeMm: 9, site: "lowerPole" },
  renalCyst: { kind: "renalCyst", side: "right", sizeMm: 36, pole: "lower", seed: 2 },
  aaa: { kind: "aaa", diameterMm: 61, lumenFraction: 0.55 },
  fluid1: { kind: "freeFluid", amount: 1 },
  fluid3: { kind: "freeFluid", amount: 3 },
  spleen: { kind: "splenomegaly", lengthMm: 175 },
  effusion: { kind: "pleuralEffusion", side: "right", depthMm: 45 },
  effusionLeft: { kind: "pleuralEffusion", side: "left", depthMm: 40 },
};

const patients = process.argv[2]?.startsWith("s") ? [process.argv[2]] : ["s0319", "s0139"];
const only = process.argv.slice(process.argv[2]?.startsWith("s") ? 3 : 2);
const width = 520;
const height = 400;
for (const id of patients) {
  const { volume, skin } = loadCase(root, id);
  for (const [name, spec] of Object.entries(SAMPLES)) {
    if (only.length > 0 && !only.includes(name)) continue;
    const copy: ClassVolume = { ...volume, data: volume.data.slice() };
    const t0 = Date.now();
    const made = applyFindings(copy, [spec]);
    const ms = Date.now() - t0;
    const result = made.results[0];
    // The organ a fatty liver is judged against (the kidney), for a finding with no single point.
    const focus = result.focus ?? (spec.kind === "fattyLiver" ? ([70, -20, 70] as const) : null);
    if (!focus) {
      console.log(id, name.padEnd(14), "not made in this patient");
      continue;
    }
    const depthMm = spec.kind === "aaa" || spec.kind === "freeFluid" || spec.kind === "pleuralEffusion" ? 180 : 160;
    let best: { breath: number; pose: NonNullable<ReturnType<typeof aimAt>>["pose"]; score: number } | null = null;
    for (const breath of [1, 0]) {
      const moved = withBreath(copy, breath);
      const moves = RESPIRATORY[sampleClass(copy, [focus[0], focus[1], focus[2]])] === 1;
      const target: [number, number, number] = [focus[0], focus[1], focus[2] - (moves ? breathShiftMm(copy, breath, focus[2]) : 0)];
      // A pleural effusion is seen from the flank through the liver (right) or spleen (left).
      const through =
        spec.kind === "pleuralEffusion"
          ? spec.side === "right"
            ? [TISSUE.liver, TISSUE.liverVessel, TISSUE.liverSpared]
            : [TISSUE.spleen]
          : undefined;
      const aim = aimAt(moved, skin, target, depthMm, { through });
      if (aim && (!best || aim.score > best.score + 5)) best = { breath, pose: aim.pose, score: aim.score };
    }
    if (!best) {
      console.log(id, name.padEnd(14), "no view found");
      continue;
    }
    const simulator = new UltrasoundSimulator(copy);
    simulator.setTissues(made.overrides);
    const frame = frameFromPose(skin, best.pose);
    const rgba = new Uint8ClampedArray(width * height * 4);
    const settings = { ...DEFAULT_SETTINGS, depthMm, focusMm: depthMm * 0.5, noise: false, persistence: 0, breath: best.breath };
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
    writeFileSync(join(outDir, `${id}-${name}.png`), encodePng(width * 2, height, both));
    console.log(
      id,
      name.padEnd(14),
      `${String(ms).padStart(5)} ms`,
      JSON.stringify(result.facts),
      `aim ${best.score.toFixed(0)} breath ${best.breath}`,
      JSON.stringify(best.pose),
      JSON.stringify(made.truth),
    );
  }
}
