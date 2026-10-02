// Turns one TotalSegmentator case (CT + 117-label segmentation) into the
// compact assets the simulator loads:
//
//   volume.u8.gz    tissue class per voxel (1.5 mm), the acoustic "patient"
//   surface.f32.gz  skin radius map, for sliding the probe on the body
//   meshes.bin.gz   organ/skin/bone surfaces for the 3D context view
//   case.json       geometry, organ statistics and reference probe poses
//
//   npm run data:build -- s0319
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  ABDOMEN_TASKS,
  buildSurfaceMap,
  type ClassVolume,
  candidatePoses,
  classify,
  DEFAULT_SETTINGS,
  displayPreference,
  frameFromPose,
  liveScore,
  type Mesh,
  ORGANS,
  type OrganInfo,
  type OrganKey,
  organStats,
  organsWithBreath,
  PROBES,
  type ProbePose,
  parseNifti,
  refinePose,
  type ScoreParts,
  SkinSurface,
  smoothMesh,
  surfaceNets,
  TISSUE,
  UltrasoundSimulator,
  withBreath,
} from "../packages/sono-engine/src";
import { measureLandmarks } from "./landmarks";

const caseId = process.argv[2] ?? "s0319";
/** Mesh positions are stored as int16 multiples of this (mm). */
const POSITION_UNIT = 0.02;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const raw = join(root, "data", "raw");
const outDir = join(root, "apps", "web", "public", "cases", caseId);
mkdirSync(outDir, { recursive: true });

const t0 = performance.now();
const log = (message: string) => console.log(`[${((performance.now() - t0) / 1000).toFixed(1)}s] ${message}`);

const ct = parseNifti(gunzipSync(readFileSync(join(raw, `${caseId}_ct.nii.gz`))));
const seg = parseNifti(gunzipSync(readFileSync(join(raw, `${caseId}_seg.nii.gz`))));
if (ct.dims.join() !== seg.dims.join()) throw new Error("CT and segmentation sizes differ");
log(`loaded ${ct.dims.join("×")} @ ${ct.spacing.map((s) => s.toFixed(2)).join("×")} mm`);

// Bring both volumes to RAS voxel order (x right, y anterior, z superior) by flipping axes as needed.
const flips = [0, 1, 2].map((axis) => {
  const column = [0, 1, 2].map((row) => ct.affine[row][axis]);
  const dominant = column.reduce((best, v, row) => (Math.abs(v) > Math.abs(column[best]) ? row : best), 0);
  if (dominant !== axis) throw new Error(`Unsupported orientation: voxel axis ${axis} maps to world axis ${dominant}`);
  return column[axis] < 0;
});
const [nx, ny, nz] = ct.dims;
const hu = new Int16Array(nx * ny * nz);
const labels = new Uint8Array(nx * ny * nz);
for (let k = 0; k < nz; k++) {
  const kk = flips[2] ? nz - 1 - k : k;
  for (let j = 0; j < ny; j++) {
    const jj = flips[1] ? ny - 1 - j : j;
    for (let i = 0; i < nx; i++) {
      const ii = flips[0] ? nx - 1 - i : i;
      const src = ii + nx * (jj + ny * kk);
      const dst = i + nx * (j + ny * k);
      hu[dst] = Math.round(ct.data[src] * ct.slope + ct.intercept);
      labels[dst] = seg.data[src];
    }
  }
}
log(`oriented to RAS (flips: ${flips.map((f) => (f ? "yes" : "no")).join("/")})`);

// Keep from just below the bladder to just above the liver dome (lung bases included for intercostal views).
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
const sz = ct.spacing[2];
const bladder = zExtent(21);
const liver = zExtent(5);
const zRange: [number, number] = [Math.max(0, bladder[0] - Math.round(30 / sz)), Math.min(nz - 1, liver[1] + Math.round(45 / sz))];
log(`slices ${zRange[0]}–${zRange[1]} (bladder ${bladder.join("–")}, liver ${liver.join("–")})`);

const { volume, offset } = classify({ dims: ct.dims, spacing: ct.spacing, hu, labels, zRange, margin: 4 });

// The CT itself, for the CT–ultrasound view: the same crop, averaged to 3 mm voxels (about 1 MB),
// in an abdominal window (−160 to 240 HU, level 40, width 400).
const CT_FACTOR = 2;
const CT_WINDOW: [number, number] = [-160, 240];
const ctDims = volume.dims.map((d) => Math.floor(d / CT_FACTOR)) as [number, number, number];
const ctData = new Uint8Array(ctDims[0] * ctDims[1] * ctDims[2]);
for (let k = 0; k < ctDims[2]; k++) {
  for (let j = 0; j < ctDims[1]; j++) {
    for (let i = 0; i < ctDims[0]; i++) {
      let sum = 0;
      for (let dk = 0; dk < CT_FACTOR; dk++) {
        for (let dj = 0; dj < CT_FACTOR; dj++) {
          for (let di = 0; di < CT_FACTOR; di++) {
            const x = i * CT_FACTOR + di + offset[0];
            const y = j * CT_FACTOR + dj + offset[1];
            const z = k * CT_FACTOR + dk + offset[2];
            sum += hu[x + nx * (y + ny * z)];
          }
        }
      }
      const mean = sum / CT_FACTOR ** 3;
      ctData[i + ctDims[0] * (j + ctDims[1] * k)] = Math.round(
        Math.min(1, Math.max(0, (mean - CT_WINDOW[0]) / (CT_WINDOW[1] - CT_WINDOW[0]))) * 255,
      );
    }
  }
}
// Each 3 mm voxel is centred between the 1.5 mm voxels it averages.
const ctGrid = {
  dims: ctDims,
  spacing: volume.spacing.map((s) => s * CT_FACTOR),
  origin: volume.origin.map((o, a) => o + ((CT_FACTOR - 1) / 2) * volume.spacing[a]),
  window: CT_WINDOW,
};
log(`tissue volume ${volume.dims.join("×")} (${(volume.data.length / 1e6).toFixed(1)} M voxels)`);

// Organ statistics; the aorta and IVC are restricted to their abdominal segment near the kidneys.
const first = new Map(organStats(volume).map((o) => [o.key, o]));
const kidneyZ = ((first.get("kidneyRight")?.centroid[2] ?? 0) + (first.get("kidneyLeft")?.centroid[2] ?? 0)) / 2;
const liverInfo = first.get("liver");
const liverTop = liverInfo ? liverInfo.centroid[2] + liverInfo.extents[0] / 2 : kidneyZ + 120;
const organs = new Map<OrganKey, OrganInfo>(
  organStats(volume, {
    aorta: [kidneyZ - 30, kidneyZ + 30],
    ivc: [kidneyZ, liverTop - 40],
  }).map((o) => [o.key, o]),
);
for (const o of organs.values()) {
  log(`  ${o.name.padEnd(20)} ${o.volumeMl.toFixed(0).padStart(5)} ml  extents ${o.extents.map((e) => e.toFixed(0)).join(" × ")} mm`);
}

const surfaceMap = buildSurfaceMap(volume);
const skin = new SkinSurface(surfaceMap);
log(`skin map ${surfaceMap.rows}×${surfaceMap.columns}`);

// Landmarks: vertebral levels, the costal margin and the ribs under the skin, xiphoid, umbilicus, pelvis.
const landmarks = measureLandmarks(volume, skin, { labels, dims: ct.dims, offset });
log(
  `landmarks: ${landmarks.vertebrae.map((v) => `${v.name} ${v.centre[2].toFixed(0)}`).join(", ")}; xiphoid ${landmarks.xiphoid[2].toFixed(0)}, umbilicus ${landmarks.umbilicus[2].toFixed(0)}, symphysis ${landmarks.symphysis[2].toFixed(0)} mm`,
);

// Reference views ("Show me"): the geometric search proposes candidates; the simulator then shows how
// much of the organ each one really reveals (shadows from ribs and gas included), and the best is kept.
const simulator = new UltrasoundSimulator(volume);
const imageSize = { width: 192, height: 150 };
const rgba = new Uint8ClampedArray(imageSize.width * imageSize.height * 4);
/** Best view for a task with the patient holding one breath (0 = out, 1 = deep breath in). */
function bestView(target: (typeof ABDOMEN_TASKS)[number], breath: 0 | 1): { pose: ProbePose; score: ScoreParts; live: number } {
  const organ = organs.get(target.organ);
  if (!organ) throw new Error(`${target.organ} is missing`);
  const settings = {
    ...DEFAULT_SETTINGS,
    probe: target.probe,
    frequencyMHz: PROBES[target.probe].frequencyMHz,
    depthMm: target.depthMm,
    focusMm: target.depthMm / 2,
    noise: false,
    speckleReduction: 0,
    persistence: 0,
    breath,
  };
  // The organs where this breath puts them.
  const patient = withBreath(volume, breath);
  const moved = organsWithBreath(organs, breath, volume);
  let best: { pose: ProbePose; score: ScoreParts; live: number } | null = null;
  for (const candidate of candidatePoses(patient, skin, moved, target, 16)) {
    const refined = refinePose(patient, skin, moved, target, candidate.pose);
    const info = simulator.render(frameFromPose(skin, refined.pose), settings, { ...imageSize, rgba });
    const seen = info.organs[target.organ]?.areaMm2 ?? 0;
    const live = liveScore(refined.score, organ, target, seen) * displayPreference(skin, organ, target, refined.pose);
    if (!best || live > best.live) best = { pose: refined.pose, score: refined.score, live };
  }
  if (!best) throw new Error(`No view found for ${target.id}`);
  return best;
}

// Each task is tried in both breaths. The usual one (the task's) is kept unless the other shows the
// organ clearly better in this patient: then "Show me" asks for that breath instead.
const tasks = ABDOMEN_TASKS.map((target) => {
  const usual = bestView(target, target.breath);
  const otherBreath = target.breath === 1 ? 0 : 1;
  const other = target.organ === "bladder" ? null : bestView(target, otherBreath);
  const useOther = other !== null && other.live > usual.live * 1.15;
  const best = useOther && other ? other : usual;
  const breath = useOther ? otherBreath : target.breath;
  const pose = {
    phiDeg: round(best.pose.phiDeg, 1),
    zMm: round(best.pose.zMm, 1),
    rotationDeg: round(best.pose.rotationDeg, 1),
    tiltDeg: round(best.pose.tiltDeg, 1),
    rockDeg: round(best.pose.rockDeg, 1),
  };
  log(
    `  task ${target.id.padEnd(20)} breath ${breath}  score ${best.score.total.toFixed(0).padStart(3)}  live ${best.live.toFixed(0).padStart(3)} (breath ${target.breath}: ${usual.live.toFixed(0)}, breath ${otherBreath}: ${other ? other.live.toFixed(0) : "-"})  pose ${JSON.stringify(pose)}`,
  );
  return { id: target.id, pose, breath, score: round(best.score.total, 1) };
});

// Surfaces for the 3D view.
interface MeshGroup {
  name: string;
  /** Tissue classes of the case volume that make up the surface... */
  tissues: number[];
  /** ...or, for structures the tissue classes merge (bowel, muscles), TotalSegmentator labels. */
  labels?: number[];
  color: string;
  opacity: number;
  factor: number;
  smooth: number;
}
const organ = (key: OrganKey): number[] => [...ORGANS[key].tissues];
const groups: MeshGroup[] = [
  { name: "skin", tissues: [], color: "#e8c4a8", opacity: 0.16, factor: 4, smooth: 6 },
  { name: "bone", tissues: [TISSUE.bone], color: "#f2efe6", opacity: 0.9, factor: 3, smooth: 2 },
  { name: "lung", tissues: [TISSUE.lung], color: "#d9c3c3", opacity: 0.18, factor: 3, smooth: 4 },
  { name: "liver", tissues: organ("liver"), color: "#a0583a", opacity: 0.55, factor: 2, smooth: 4 },
  { name: "gallbladder", tissues: organ("gallbladder"), color: "#3fae5a", opacity: 0.85, factor: 2, smooth: 4 },
  { name: "kidneyRight", tissues: organ("kidneyRight"), color: "#c0504d", opacity: 0.85, factor: 2, smooth: 4 },
  { name: "kidneyLeft", tissues: organ("kidneyLeft"), color: "#c0504d", opacity: 0.85, factor: 2, smooth: 4 },
  { name: "spleen", tissues: organ("spleen"), color: "#8e44ad", opacity: 0.8, factor: 2, smooth: 4 },
  { name: "pancreas", tissues: organ("pancreas"), color: "#e1b12c", opacity: 0.85, factor: 2, smooth: 3 },
  { name: "bladder", tissues: organ("bladder"), color: "#f1c40f", opacity: 0.7, factor: 2, smooth: 4 },
  { name: "aorta", tissues: organ("aorta"), color: "#e74c3c", opacity: 0.9, factor: 2, smooth: 3 },
  { name: "ivc", tissues: organ("ivc"), color: "#3b6fd8", opacity: 0.9, factor: 2, smooth: 3 },
  { name: "portalVein", tissues: organ("portalVein"), color: "#6c5ce7", opacity: 0.9, factor: 2, smooth: 3 },
  // The rest of the abdomen, so the organs sit among their neighbours as they do in the body.
  { name: "stomach", tissues: [], labels: [6, 15], color: "#e59a8c", opacity: 0.3, factor: 2, smooth: 4 },
  { name: "duodenum", tissues: [], labels: [19], color: "#eab08c", opacity: 0.32, factor: 2, smooth: 4 },
  { name: "smallBowel", tissues: [], labels: [18], color: "#f2c9b8", opacity: 0.16, factor: 3, smooth: 4 },
  { name: "colon", tissues: [], labels: [20], color: "#c9a07e", opacity: 0.2, factor: 3, smooth: 4 },
  { name: "heart", tissues: [], labels: [51], color: "#c0392b", opacity: 0.4, factor: 3, smooth: 4 },
  { name: "adrenals", tissues: [], labels: [8, 9], color: "#e0a030", opacity: 0.9, factor: 1, smooth: 3 },
  { name: "psoas", tissues: [], labels: [88, 89], color: "#b8625a", opacity: 0.22, factor: 2, smooth: 4 },
  { name: "iliacArteries", tissues: [], labels: [65, 66], color: "#e74c3c", opacity: 0.9, factor: 1, smooth: 3 },
  { name: "iliacVeins", tissues: [], labels: [67, 68], color: "#3b6fd8", opacity: 0.9, factor: 1, smooth: 3 },
  { name: "prostate", tissues: [], labels: [22], color: "#cd6155", opacity: 0.85, factor: 1, smooth: 3 },
];
const meshes = groups.flatMap((group) => {
  const mesh = group.labels ? labelMesh(volume, group) : groupMesh(volume, group);
  if (mesh.positions.length === 0) {
    log(`  mesh ${group.name.padEnd(12)} absent in this case`);
    return [];
  }
  smoothMesh(mesh, group.smooth);
  log(`  mesh ${group.name.padEnd(12)} ${(mesh.positions.length / 3).toLocaleString()} vertices`);
  return [{ group, mesh }];
});

// Write everything.
writeFileSync(join(outDir, "volume.u8.gz"), gzipSync(volume.data, { level: 9 }));
writeFileSync(join(outDir, "ct.u8.gz"), gzipSync(ctData, { level: 9 }));
writeFileSync(join(outDir, "surface.f32.gz"), gzipSync(new Uint8Array(surfaceMap.radius.buffer), { level: 9 }));
writeFileSync(join(outDir, "meshes.bin.gz"), gzipSync(packMeshes(meshes), { level: 9 }));
const caseJson = {
  id: caseId,
  title: "Adult abdomen (contrast-enhanced CT)",
  source: {
    dataset: "TotalSegmentator v2 (Wasserthal et al., Radiology: Artificial Intelligence 2023)",
    url: "https://doi.org/10.5281/zenodo.10047292",
    license: "CC BY 4.0",
    caseId,
    note: "Tissue classes derived from the CT and its 117-structure segmentation; resampled and cropped.",
  },
  volume: { dims: volume.dims, spacing: volume.spacing, origin: volume.origin },
  ct: ctGrid,
  surface: {
    center: surfaceMap.center,
    z0: surfaceMap.z0,
    dz: surfaceMap.dz,
    rows: surfaceMap.rows,
    columns: surfaceMap.columns,
  },
  organs: [...organs.values()].map((o) => ({
    key: o.key,
    name: o.name,
    volumeMl: round(o.volumeMl, 1),
    centroid: o.centroid.map((v) => round(v, 2)),
    axes: o.axes.map((axis) => axis.map((v) => round(v, 5))),
    extents: o.extents.map((v) => round(v, 1)),
  })),
  tasks,
  landmarks,
};
writeFileSync(join(outDir, "case.json"), `${JSON.stringify(caseJson, null, 2)}\n`);
log(`wrote assets to ${outDir}`);

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Fraction-of-voxels field at a coarser grid, then surface nets. */
function groupMesh(vol: ClassVolume, group: MeshGroup): Mesh {
  const [vx, vy, vz] = vol.dims;
  const f = group.factor;
  const dims = [Math.ceil(vx / f), Math.ceil(vy / f), Math.ceil(vz / f)] as const;
  const field = new Float32Array(dims[0] * dims[1] * dims[2]);
  const wanted = new Uint8Array(256);
  for (const t of group.tissues) wanted[t] = 1;
  const isSkin = group.tissues.length === 0;
  for (let k = 0; k < vz; k++) {
    for (let j = 0; j < vy; j++) {
      for (let i = 0; i < vx; i++) {
        const c = vol.data[i + vx * (j + vy * k)];
        if (isSkin ? c === TISSUE.outside : !wanted[c]) continue;
        field[Math.floor(i / f) + dims[0] * (Math.floor(j / f) + dims[1] * Math.floor(k / f))] += 1;
      }
    }
  }
  const cell = f * f * f;
  for (let p = 0; p < field.length; p++) field[p] /= cell;
  const [sx, sy, sz] = vol.spacing;
  const [ox, oy, oz] = vol.origin;
  // Coarse voxel c covers fine voxels [c·f, c·f + f − 1]; its centre is at c·f + (f − 1)/2.
  const centre = (f - 1) / 2;
  return surfaceNets(field, dims, (i, j, k) => [ox + (i * f + centre) * sx, oy + (j * f + centre) * sy, oz + (k * f + centre) * sz]);
}

/** Like groupMesh, from TotalSegmentator labels inside the case's crop. */
function labelMesh(vol: ClassVolume, group: MeshGroup): Mesh {
  const [vx, vy, vz] = vol.dims;
  const [lx, ly] = ct.dims;
  const f = group.factor;
  const dims = [Math.ceil(vx / f), Math.ceil(vy / f), Math.ceil(vz / f)] as const;
  const field = new Float32Array(dims[0] * dims[1] * dims[2]);
  const wanted = new Uint8Array(256);
  for (const l of group.labels ?? []) wanted[l] = 1;
  for (let k = 0; k < vz; k++) {
    for (let j = 0; j < vy; j++) {
      for (let i = 0; i < vx; i++) {
        if (!wanted[labels[i + offset[0] + lx * (j + offset[1] + ly * (k + offset[2]))]]) continue;
        field[Math.floor(i / f) + dims[0] * (Math.floor(j / f) + dims[1] * Math.floor(k / f))] += 1;
      }
    }
  }
  const cell = f * f * f;
  for (let p = 0; p < field.length; p++) field[p] /= cell;
  const [sx, sy, sz] = vol.spacing;
  const [ox, oy, oz] = vol.origin;
  const centre = (f - 1) / 2;
  return surfaceNets(field, dims, (i, j, k) => [ox + (i * f + centre) * sx, oy + (j * f + centre) * sy, oz + (k * f + centre) * sz]);
}

function packMeshes(items: Array<{ group: MeshGroup; mesh: Mesh }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const entries = items.map(({ group, mesh }) => {
    // Positions as int16 in units of 0.02 mm (±655 mm range), indices as uint16 when they fit.
    const quantised = new Int16Array(mesh.positions.length);
    for (let i = 0; i < quantised.length; i++) quantised[i] = Math.round(mesh.positions[i] / POSITION_UNIT);
    const positions = { offset, count: quantised.length, unit: POSITION_UNIT };
    chunks.push(new Uint8Array(quantised.buffer));
    offset += quantised.byteLength;
    if (offset % 4) {
      chunks.push(new Uint8Array(4 - (offset % 4)));
      offset += 4 - (offset % 4);
    }
    const wide = mesh.positions.length / 3 > 65535;
    const indexArray = wide ? mesh.indices : Uint16Array.from(mesh.indices);
    const indices = { offset, count: indexArray.length, bytes: wide ? 4 : 2 };
    chunks.push(new Uint8Array(indexArray.buffer));
    offset += indexArray.byteLength;
    if (offset % 4) {
      chunks.push(new Uint8Array(4 - (offset % 4)));
      offset += 4 - (offset % 4);
    }
    return { name: group.name, color: group.color, opacity: group.opacity, positions, indices };
  });
  let header = new TextEncoder().encode(JSON.stringify({ meshes: entries }));
  const padded = Math.ceil(header.length / 4) * 4;
  if (padded !== header.length) {
    const tmp = new Uint8Array(padded).fill(0x20);
    tmp.set(header);
    header = tmp;
  }
  const out = new Uint8Array(4 + header.length + offset);
  new DataView(out.buffer).setUint32(0, header.length, true);
  out.set(header, 4);
  let p = 4 + header.length;
  for (const chunk of chunks) {
    out.set(chunk, p);
    p += chunk.length;
  }
  return out;
}
