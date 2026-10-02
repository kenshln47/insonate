// Anatomical audit of a case: where each organ sits relative to the vertebrae and the rib cage,
// in the same world coordinates the simulator uses. Prints a table; nothing is written.
//
//   npx tsx scripts/audit-anatomy.ts [s0319]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { parseNifti } from "../packages/sono-engine/src";

const caseId = process.argv[2] ?? "s0319";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const raw = join(root, "data", "raw");
const json = JSON.parse(readFileSync(join(root, "apps", "web", "public", "cases", caseId, "case.json"), "utf8"));

const ct = parseNifti(gunzipSync(readFileSync(join(raw, `${caseId}_ct.nii.gz`))));
const seg = parseNifti(gunzipSync(readFileSync(join(raw, `${caseId}_seg.nii.gz`))));
const flips = [0, 1, 2].map((axis) => ct.affine[axis][axis] < 0);
const [nx, ny, nz] = ct.dims;
const [sx, sy, sz] = ct.spacing;
const labels = new Uint8Array(nx * ny * nz);
for (let k = 0; k < nz; k++) {
  const kk = flips[2] ? nz - 1 - k : k;
  for (let j = 0; j < ny; j++) {
    const jj = flips[1] ? ny - 1 - j : j;
    for (let i = 0; i < nx; i++) {
      const ii = flips[0] ? nx - 1 - i : i;
      labels[i + nx * (j + ny * k)] = seg.data[ii + nx * (jj + ny * kk)];
    }
  }
}

// Same crop as build-case: from 30 mm below the bladder to 45 mm above the liver dome.
const zExtent = (label: number): [number, number] => {
  let lo = nz;
  let hi = -1;
  for (let k = 0; k < nz; k++) {
    for (let p = k * nx * ny; p < (k + 1) * nx * ny; p++) {
      if (labels[p] !== label) continue;
      lo = Math.min(lo, k);
      hi = Math.max(hi, k);
      break;
    }
  }
  return [lo, hi];
};
const bladder = zExtent(21);
const liver = zExtent(5);
const z0 = Math.max(0, bladder[0] - Math.round(30 / sz));
const worldZ = (k: number) => json.volume.origin[2] + (k - z0) * json.volume.spacing[2];

interface Stat {
  n: number;
  zMin: number;
  zMax: number;
  x: number;
  y: number;
  z: number;
}
const stats = new Map<number, Stat>();
for (let k = 0; k < nz; k++) {
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const l = labels[i + nx * (j + ny * k)];
      if (!l) continue;
      let s = stats.get(l);
      if (!s) {
        s = { n: 0, zMin: Infinity, zMax: -Infinity, x: 0, y: 0, z: 0 };
        stats.set(l, s);
      }
      s.n++;
      const z = worldZ(k);
      s.zMin = Math.min(s.zMin, z);
      s.zMax = Math.max(s.zMax, z);
      s.x += i * sx;
      s.y += j * sy;
      s.z += z;
    }
  }
}

const VERTEBRAE: Record<number, string> = {
  26: "S1",
  27: "L5",
  28: "L4",
  29: "L3",
  30: "L2",
  31: "L1",
  32: "T12",
  33: "T11",
  34: "T10",
  35: "T9",
  36: "T8",
  37: "T7",
};
const ORGANS: Record<number, string> = {
  5: "liver",
  4: "gallbladder",
  2: "kidney right",
  3: "kidney left",
  1: "spleen",
  7: "pancreas",
  6: "stomach",
  21: "bladder",
  8: "adrenal right",
  9: "adrenal left",
  52: "aorta",
  63: "IVC",
  64: "portal/splenic v.",
  65: "iliac artery L",
  66: "iliac artery R",
  51: "heart",
};
const level = (z: number): string => {
  // Name the vertebra whose body spans z (or the nearest one).
  let best = "";
  let bestD = Infinity;
  for (const [label, name] of Object.entries(VERTEBRAE)) {
    const s = stats.get(Number(label));
    if (!s) continue;
    const d = z < s.zMin ? s.zMin - z : z > s.zMax ? z - s.zMax : 0;
    if (d < bestD) {
      bestD = d;
      best = d === 0 ? name : `${name}${z > s.zMax ? "+" : "-"}${d.toFixed(0)}mm`;
    }
  }
  return best;
};

console.log(`case ${caseId}: world z = 0 is the centre of the cropped volume; +z toward the head\n`);
console.log("vertebra   z range (mm)        centre");
for (const [label, name] of Object.entries(VERTEBRAE)) {
  const s = stats.get(Number(label));
  if (!s) {
    console.log(`${name.padEnd(9)}  (not in the scan)`);
    continue;
  }
  console.log(`${name.padEnd(9)}  ${s.zMin.toFixed(0).padStart(5)} … ${s.zMax.toFixed(0).padStart(5)}      ${(s.z / s.n).toFixed(0)}`);
}
console.log("\norgan              top (level)            centre (level)         bottom (level)");
for (const [label, name] of Object.entries(ORGANS)) {
  const s = stats.get(Number(label));
  if (!s) continue;
  const c = s.z / s.n;
  console.log(
    `${name.padEnd(18)} ${s.zMax.toFixed(0).padStart(5)} (${level(s.zMax).padEnd(12)})  ${c.toFixed(0).padStart(5)} (${level(c).padEnd(12)})  ${s.zMin.toFixed(0).padStart(5)} (${level(s.zMin)})`,
  );
}

// Lowest point of each of the lower ribs, and of the costal cartilages.
console.log("\nrib                lowest z (level)");
for (const [first, side] of [
  [92, "left"],
  [104, "right"],
] as const) {
  for (let n = 7; n <= 12; n++) {
    const s = stats.get(first + n - 1);
    if (!s) continue;
    console.log(`rib ${side} ${String(n).padEnd(8)} ${s.zMin.toFixed(0).padStart(5)} (${level(s.zMin)})`);
  }
}
const cart = stats.get(117);
if (cart) console.log(`costal cartilage   ${cart.zMin.toFixed(0).padStart(5)} (${level(cart.zMin)})`);
const sternum = stats.get(116);
if (sternum) console.log(`sternum (xiphoid)  ${sternum.zMin.toFixed(0).padStart(5)} (${level(sternum.zMin)})`);
console.log(`\ncrop: slices ${z0}…, liver dome slice ${liver[1]}`);
