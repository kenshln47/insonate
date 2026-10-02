// Screens candidate cases by their segmentation alone (small downloads):
// which abdominal organs are present, and are any cut off by the scan range?
//
//   npm exec tsx scripts/screen-cases.ts s0245 s0193 …
import { gunzipSync } from "node:zlib";
import { parseNifti } from "../packages/sono-engine/src/nifti";
import { listRemoteZip, readRemoteEntry } from "./remote-zip";

const BASE = "https://huggingface.co/datasets/YongchengYAO/TotalSegmentator-CT-Lite/resolve/main";
const LABELS: Record<number, string> = {
  1: "spleen",
  2: "kidneyR",
  3: "kidneyL",
  4: "GB",
  5: "liver",
  7: "pancreas",
  21: "bladder",
  52: "aorta",
  63: "IVC",
  64: "portal",
};

const ids = process.argv.slice(2);
const entries = await listRemoteZip(`${BASE}/Masks.zip`);
for (const id of ids) {
  const entry = entries.find((e) => e.name.endsWith(`/${id}.nii.gz`));
  if (!entry) {
    console.log(id, "not found");
    continue;
  }
  const volume = parseNifti(gunzipSync(await readRemoteEntry(`${BASE}/Masks.zip`, entry)));
  const [nx, ny, nz] = volume.dims;
  const counts = new Map<number, number>();
  const zMin = new Map<number, number>();
  const zMax = new Map<number, number>();
  const data = volume.data;
  for (let z = 0; z < nz; z++) {
    for (let i = z * nx * ny; i < (z + 1) * nx * ny; i++) {
      const label = data[i];
      if (!LABELS[label]) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
      zMin.set(label, Math.min(zMin.get(label) ?? z, z));
      zMax.set(label, Math.max(zMax.get(label) ?? z, z));
    }
  }
  const voxelMl = (volume.spacing[0] * volume.spacing[1] * volume.spacing[2]) / 1000;
  const summary = Object.entries(LABELS)
    .map(([key, name]) => {
      const label = Number(key);
      const count = counts.get(label) ?? 0;
      if (!count) return `${name}:—`;
      const cut = zMin.get(label) === 0 || zMax.get(label) === nz - 1 ? "!" : "";
      return `${name}:${Math.round(count * voxelMl)}ml${cut}`;
    })
    .join(" ");
  console.log(
    `${id} ${nx}×${ny}×${nz} @ ${volume.spacing.map((s) => s.toFixed(2)).join("×")} mm  z-span ${(nz * volume.spacing[2]).toFixed(0)} mm  ${summary}`,
  );
}
