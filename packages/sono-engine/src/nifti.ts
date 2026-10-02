/** Minimal NIfTI-1 reader (uncompressed bytes; gunzip first). */

export type NiftiData = Uint8Array | Int8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

export interface NiftiVolume {
  readonly dims: readonly [number, number, number];
  /** Voxel size in mm. */
  readonly spacing: readonly [number, number, number];
  /** 4×4 voxel-index → RAS+ millimetre transform (row-major). */
  readonly affine: readonly (readonly number[])[];
  readonly datatype: number;
  /** Raw voxel values in i-fastest (Fortran) order; apply slope/intercept for real units. */
  readonly data: NiftiData;
  readonly slope: number;
  readonly intercept: number;
}

const TYPES: Record<
  number,
  { bytes: number; read: (view: DataView, offset: number, le: boolean) => number; make: (n: number) => NiftiData }
> = {
  2: { bytes: 1, read: (v, o) => v.getUint8(o), make: (n) => new Uint8Array(n) },
  4: { bytes: 2, read: (v, o, le) => v.getInt16(o, le), make: (n) => new Int16Array(n) },
  8: { bytes: 4, read: (v, o, le) => v.getInt32(o, le), make: (n) => new Int32Array(n) },
  16: { bytes: 4, read: (v, o, le) => v.getFloat32(o, le), make: (n) => new Float32Array(n) },
  64: { bytes: 8, read: (v, o, le) => v.getFloat64(o, le), make: (n) => new Float64Array(n) },
  256: { bytes: 1, read: (v, o) => v.getInt8(o), make: (n) => new Int8Array(n) },
  512: { bytes: 2, read: (v, o, le) => v.getUint16(o, le), make: (n) => new Uint16Array(n) },
  768: { bytes: 4, read: (v, o, le) => v.getUint32(o, le), make: (n) => new Uint32Array(n) },
};

export function parseNifti(bytes: Uint8Array): NiftiVolume {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let le = true;
  if (view.getInt32(0, true) !== 348) {
    if (view.getInt32(0, false) !== 348) throw new Error("Not a NIfTI-1 file");
    le = false;
  }
  const i16 = (o: number) => view.getInt16(o, le);
  const f32 = (o: number) => view.getFloat32(o, le);
  const rank = i16(40);
  if (rank < 3) throw new Error(`Expected a 3D volume, got ${rank} dimensions`);
  const dims = [i16(42), i16(44), i16(46)] as const;
  const datatype = i16(70);
  const qfac = f32(76) < 0 ? -1 : 1;
  const spacing = [Math.abs(f32(80)), Math.abs(f32(84)), Math.abs(f32(88))] as const;
  const voxOffset = Math.max(352, Math.round(f32(108)));
  const slopeRaw = f32(112);
  const slope = Number.isFinite(slopeRaw) && slopeRaw !== 0 ? slopeRaw : 1;
  const interceptRaw = f32(116);
  const intercept = Number.isFinite(interceptRaw) ? interceptRaw : 0;
  const qformCode = i16(252);
  const sformCode = i16(254);

  let affine: number[][];
  if (sformCode > 0) {
    affine = [0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => f32(280 + r * 16 + c * 4)));
  } else if (qformCode > 0) {
    const b = f32(256);
    const c = f32(260);
    const d = f32(264);
    const a = Math.sqrt(Math.max(0, 1 - b * b - c * c - d * d));
    const r = [
      [a * a + b * b - c * c - d * d, 2 * (b * c - a * d), 2 * (b * d + a * c)],
      [2 * (b * c + a * d), a * a + c * c - b * b - d * d, 2 * (c * d - a * b)],
      [2 * (b * d - a * c), 2 * (c * d + a * b), a * a + d * d - b * b - c * c],
    ];
    const offset = [f32(268), f32(272), f32(276)];
    affine = r.map((row, i) => [row[0] * spacing[0], row[1] * spacing[1], row[2] * spacing[2] * qfac, offset[i]]);
  } else {
    affine = [
      [spacing[0], 0, 0, 0],
      [0, spacing[1], 0, 0],
      [0, 0, spacing[2], 0],
    ];
  }
  affine.push([0, 0, 0, 1]);

  const type = TYPES[datatype];
  if (!type) throw new Error(`Unsupported NIfTI datatype ${datatype}`);
  const count = dims[0] * dims[1] * dims[2];
  if (voxOffset + count * type.bytes > bytes.byteLength) throw new Error("NIfTI file is truncated");
  const data = type.make(count);
  if (le && (bytes.byteOffset + voxOffset) % type.bytes === 0) {
    const Ctor = data.constructor as new (buffer: ArrayBufferLike, offset: number, length: number) => NiftiData;
    data.set(new Ctor(bytes.buffer, bytes.byteOffset + voxOffset, count) as never);
  } else {
    for (let i = 0; i < count; i++) (data as Float64Array)[i] = type.read(view, voxOffset + i * type.bytes, le);
  }
  return { dims, spacing, affine, datatype, data, slope, intercept };
}
