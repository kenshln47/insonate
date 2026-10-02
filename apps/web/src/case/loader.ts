import type { ClassVolume, OrganInfo, OrganKey, ProbePose, SurfaceMap, Vec3 } from "@insonate/sono-engine";

export interface CaseTask {
  id: string;
  pose: ProbePose;
  /** The breath the reference view is taken in: 1 = deep breath in and hold, 0 = breathe out. */
  breath: 0 | 1;
  score: number;
}

/** Landmarks measured from the CT (see scripts/landmarks.ts). World millimetres. */
export interface CaseLandmarks {
  vertebrae: Array<{ name: string; centre: Vec3; front: Vec3 }>;
  /** Lowest edge of the rib cage under the skin: [φ°, z]. */
  costalMargin: Array<[number, number]>;
  /** Ribs under the skin along lines down the body: [rib number (0 = costal cartilage), lowest z, highest z]. */
  ribLines: Array<{ phiDeg: number; ribs: Array<[number, number, number]> }>;
  xiphoid: Vec3;
  umbilicus: Vec3;
  iliacCrests: [Vec3, Vec3];
  asis: [Vec3, Vec3];
  symphysis: Vec3;
}

export interface CaseJson {
  id: string;
  title: string;
  source: { dataset: string; url: string; license: string; caseId: string; note: string };
  volume: { dims: [number, number, number]; spacing: [number, number, number]; origin: Vec3 };
  surface: { center: [number, number]; z0: number; dz: number; rows: number; columns: number };
  organs: OrganInfo[];
  tasks: CaseTask[];
  landmarks?: CaseLandmarks;
  /** The CT at 3 mm (ct.u8.gz), windowed to 8 bits, for the CT–ultrasound view. */
  ct?: { dims: [number, number, number]; spacing: [number, number, number]; origin: Vec3; window: [number, number] };
}

export interface MeshData {
  name: string;
  color: string;
  opacity: number;
  positions: Float32Array;
  indices: Uint16Array | Uint32Array;
}

export interface CaseData {
  json: CaseJson;
  volume: ClassVolume;
  surface: SurfaceMap;
  organs: Map<OrganKey, OrganInfo>;
  meshes: MeshData[];
}

/** Download a .gz asset and decompress it, unless the server already did (Content-Encoding). */
async function fetchGzip(url: string, onProgress?: (bytes: number) => void): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes.buffer;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/** Load a built case (see scripts/build-case.ts) from /cases/<id>/. */
export async function loadCase(id: string, onProgress?: (fraction: number) => void): Promise<CaseData> {
  const base = `${import.meta.env.BASE_URL}cases/${id}/`;
  const json = (await (await fetch(`${base}case.json`)).json()) as CaseJson;
  // Approximate compressed sizes, for the progress bar.
  const expected = { volume: 1_200_000, surface: 130_000, meshes: 1_700_000 };
  const total = expected.volume + expected.surface + expected.meshes;
  const progress = { volume: 0, surface: 0, meshes: 0 };
  const report = () => onProgress?.(Math.min(0.99, (progress.volume + progress.surface + progress.meshes) / total));
  const [volumeBytes, surfaceBytes, meshBytes] = await Promise.all([
    fetchGzip(`${base}volume.u8.gz`, (b) => {
      progress.volume = b;
      report();
    }),
    fetchGzip(`${base}surface.f32.gz`, (b) => {
      progress.surface = b;
      report();
    }),
    fetchGzip(`${base}meshes.bin.gz`, (b) => {
      progress.meshes = b;
      report();
    }),
  ]);
  const volume: ClassVolume = {
    dims: json.volume.dims,
    spacing: json.volume.spacing,
    origin: json.volume.origin,
    data: new Uint8Array(volumeBytes),
  };
  const surface: SurfaceMap = { ...json.surface, radius: new Float32Array(surfaceBytes) };
  onProgress?.(1);
  return {
    json,
    volume,
    surface,
    organs: new Map(json.organs.map((o) => [o.key, o])),
    meshes: unpackMeshes(meshBytes),
  };
}

interface MeshHeader {
  meshes: Array<{
    name: string;
    color: string;
    opacity: number;
    positions: { offset: number; count: number; unit: number };
    indices: { offset: number; count: number; bytes: 2 | 4 };
  }>;
}

export function unpackMeshes(buffer: ArrayBuffer): MeshData[] {
  const view = new DataView(buffer);
  const headerLength = view.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength))) as MeshHeader;
  const body = 4 + headerLength;
  return header.meshes.map((m) => {
    const quantised = new Int16Array(buffer, body + m.positions.offset, m.positions.count);
    const positions = new Float32Array(m.positions.count);
    for (let i = 0; i < positions.length; i++) positions[i] = quantised[i] * m.positions.unit;
    const indices =
      m.indices.bytes === 2
        ? new Uint16Array(buffer, body + m.indices.offset, m.indices.count)
        : new Uint32Array(buffer, body + m.indices.offset, m.indices.count);
    return { name: m.name, color: m.color, opacity: m.opacity, positions, indices };
  });
}

/** The case's CT (ct.u8.gz), for the CT–ultrasound view: about 1 MB, fetched only when asked for. */
export async function loadCt(id: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await fetchGzip(`${import.meta.env.BASE_URL}cases/${id}/ct.u8.gz`));
}
