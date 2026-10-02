// Renders camera images of the printed marker in a known pose, for tests and for the
// fake webcam used by the end-to-end tests. Camera space: x right, y up, z away from the camera.
import { MARKER_CELLS, MARKER_MM, SHEET_CELLS, sheetCellIsWhite } from "./marker";

export type Matrix3 = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

export const IDENTITY: Matrix3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  const row = (r: number) =>
    [0, 1, 2].map((c) => a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c]) as unknown as readonly [number, number, number];
  return [row(0), row(1), row(2)];
}

/** Rotation by `deg` about the camera's x, y or z axis. */
export function rotation(axis: "x" | "y" | "z", deg: number): Matrix3 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  if (axis === "x")
    return [
      [1, 0, 0],
      [0, c, -s],
      [0, s, c],
    ];
  if (axis === "y")
    return [
      [c, 0, s],
      [0, 1, 0],
      [-s, 0, c],
    ];
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

export interface CameraModel {
  readonly width: number;
  readonly height: number;
  readonly focalPx: number;
}

/**
 * Grey-level image (0–255, one byte per pixel) of the marker sheet with rotation `r`
 * (marker → camera) and centre `t` (mm), over a softly shaded background.
 */
export function renderMarker(camera: CameraModel, r: Matrix3, t: readonly [number, number, number], markerMm = MARKER_MM): Uint8Array {
  const { width, height, focalPx } = camera;
  const out = new Uint8Array(width * height);
  const cell = markerMm / MARKER_CELLS;
  const half = SHEET_CELLS / 2;
  const n = [r[0][2], r[1][2], r[2][2]];
  const nt = n[0] * t[0] + n[1] * t[1] + n[2] * t[2];
  const ss = 3;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const dx = (x + (sx + 0.5) / ss - width / 2) / focalPx;
          const dy = (height / 2 - (y + (sy + 0.5) / ss)) / focalPx;
          const denominator = n[0] * dx + n[1] * dy + n[2];
          let value = 70 + 40 * (x / width) + 25 * Math.sin(y / 23); // background
          const s = denominator !== 0 ? nt / denominator : -1;
          if (s > 0) {
            const p = [s * dx - t[0], s * dy - t[1], s - t[2]];
            const u = p[0] * r[0][0] + p[1] * r[1][0] + p[2] * r[2][0];
            const v = p[0] * r[0][1] + p[1] * r[1][1] + p[2] * r[2][1];
            const col = Math.floor(u / cell + half);
            const row = Math.floor(half - v / cell);
            if (col >= 0 && row >= 0 && col < SHEET_CELLS && row < SHEET_CELLS) value = sheetCellIsWhite(col, row) ? 235 : 20;
          }
          sum += value;
        }
      }
      out[y * width + x] = Math.round(sum / (ss * ss));
    }
  }
  return out;
}

/** Expand a grey image to RGBA, as a canvas would give it. */
export function greyToRgba(grey: Uint8Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(grey.length * 4);
  for (let i = 0; i < grey.length; i++) {
    rgba[i * 4] = grey[i];
    rgba[i * 4 + 1] = grey[i];
    rgba[i * 4 + 2] = grey[i];
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
