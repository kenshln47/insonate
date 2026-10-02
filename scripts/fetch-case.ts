// Downloads one CT case (image + 117-structure segmentation) from the
// TotalSegmentator dataset (CC BY 4.0, Wasserthal et al.) as repackaged in
// YongchengYAO/TotalSegmentator-CT-Lite, using range requests on the ZIPs.
//
//   npm run data:fetch -- s0319
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listRemoteZip, readRemoteEntry } from "./remote-zip";

const BASE = "https://huggingface.co/datasets/YongchengYAO/TotalSegmentator-CT-Lite/resolve/main";
// s0319 is the case Insonate ships with.
const caseId = process.argv[2] ?? "s0319";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "data", "raw");
mkdirSync(outDir, { recursive: true });

for (const [archive, suffix] of [
  ["Masks.zip", "seg"],
  ["Images.zip", "ct"],
] as const) {
  const target = join(outDir, `${caseId}_${suffix}.nii.gz`);
  if (existsSync(target)) {
    console.log(`already have ${target}`);
    continue;
  }
  const url = `${BASE}/${archive}`;
  console.log(`reading the index of ${archive}…`);
  const entries = await listRemoteZip(url);
  const entry = entries.find((e) => e.name.split("/").pop()?.startsWith(`${caseId}.`));
  if (!entry) {
    throw new Error(`${caseId} not found in ${archive} (${entries.length} entries, e.g. ${entries[1]?.name})`);
  }
  console.log(`downloading ${entry.name} (${(entry.compressedSize / 1e6).toFixed(1)} MB)…`);
  const bytes = await readRemoteEntry(url, entry);
  writeFileSync(target, bytes);
  console.log(`saved ${target}`);
}
