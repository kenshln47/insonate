import { listRemoteZip } from "./remote-zip";

const BASE = "https://huggingface.co/datasets/YongchengYAO/TotalSegmentator-CT-Lite/resolve/main";
const meta = await (await fetch(`${BASE}/meta.csv`)).text();
const rows = meta
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => l.replace(/^﻿/, "").split(";"));
const candidates = rows.filter((r) => r[4].trim() === "ct abdomen-pelvis" && r[9] === "no_pathology").map((r) => r[0]);
console.log("abdomen-pelvis, no pathology:", candidates.length, candidates.slice(0, 40).join(" "));
const images = await listRemoteZip(`${BASE}/Images.zip`);
console.log(
  "image entries:",
  images.length,
  images.slice(0, 3).map((e) => e.name),
);
const sizes = new Map(images.map((e) => [(e.name.split("/").pop() ?? e.name).replace(".nii.gz", ""), e.compressedSize]));
console.log(
  candidates
    .slice(0, 40)
    .map((c) => `${c}:${((sizes.get(c) ?? 0) / 1e6).toFixed(0)}MB`)
    .join("  "),
);
