// The printed marker that turns any small object into a probe. Kept free of
// dependencies so it can be used by the app, the tests and the fake camera.

/** ArUco dictionary (8×8 cells: a black border around 6×6 data bits). */
export const DICTIONARY = "ARUCO_MIP_36h12";
export const MARKER_ID = 0;
/** Data bits of marker 0, row by row from the top (1 = white). Checked against js-aruco2 in tests. */
export const MARKER_BITS = "110100101011011000111010000010011101";
/** Printed size of the black square, mm. */
export const MARKER_MM = 50;
/** Cells across the black square, and across the printed sheet with its white margin. */
export const MARKER_CELLS = 8;
export const SHEET_CELLS = 10;

/** Colour of a cell of the printed sheet (col, row from the top-left, 0–9): true = white. */
export function sheetCellIsWhite(col: number, row: number, bits = MARKER_BITS): boolean {
  if (col < 1 || row < 1 || col > 8 || row > 8) return true; // white margin
  if (col < 2 || row < 2 || col > 7 || row > 7) return false; // black border
  return bits[(row - 2) * 6 + (col - 2)] === "1";
}

/** Typical webcams see about 65° across: focal length in pixels for a frame width. */
export function focalLength(width: number): number {
  return width * 0.85;
}
