import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { type ClassVolume, type OrganInfo, type OrganKey, type ProbePose, SkinSurface, type Vec3 } from "../packages/sono-engine/src";

export interface CaseJson {
  id: string;
  title: string;
  volume: { dims: [number, number, number]; spacing: [number, number, number]; origin: Vec3 };
  surface: { center: [number, number]; z0: number; dz: number; rows: number; columns: number };
  organs: OrganInfo[];
  tasks: Array<{ id: string; pose: ProbePose; breath?: 0 | 1; score: number }>;
}

/** Load a built case from apps/web/public/cases/<id> (for scripts and tests). */
export function loadCase(
  root: string,
  id: string,
): {
  json: CaseJson;
  volume: ClassVolume;
  skin: SkinSurface;
  organs: Map<OrganKey, OrganInfo>;
} {
  const dir = join(root, "apps", "web", "public", "cases", id);
  const json = JSON.parse(readFileSync(join(dir, "case.json"), "utf8")) as CaseJson;
  const data = new Uint8Array(gunzipSync(readFileSync(join(dir, "volume.u8.gz"))));
  const volume: ClassVolume = { dims: json.volume.dims, spacing: json.volume.spacing, origin: json.volume.origin, data };
  const radiusBytes = gunzipSync(readFileSync(join(dir, "surface.f32.gz")));
  const radius = new Float32Array(radiusBytes.buffer.slice(radiusBytes.byteOffset, radiusBytes.byteOffset + radiusBytes.byteLength));
  const skin = new SkinSurface({ ...json.surface, radius });
  const organs = new Map(json.organs.map((o) => [o.key, o] as const));
  return { json, volume, skin, organs };
}
