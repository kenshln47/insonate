import { ORGAN_KEYS, type OrganKey, TISSUE, TISSUE_TO_ORGAN } from "@insonate/sono-engine";

/** One colour per organ, shared by the anatomy overlay, the labels and the 3D view. */
export const ORGAN_COLORS: Readonly<Record<OrganKey, string>> = {
  liver: "#d08a5c",
  gallbladder: "#4fd18b",
  kidneyRight: "#ef6f8e",
  kidneyLeft: "#ef6f8e",
  spleen: "#b07cf0",
  pancreas: "#f4c656",
  bladder: "#ffe27a",
  aorta: "#ff5a5a",
  ivc: "#5b95ff",
  portalVein: "#9d8cff",
};

/** Non-organ structures that explain artefacts: bone (shadows), gas (dirty shadows) and lung (mirror image). */
export const STRUCTURE_COLORS = {
  bone: "#f1ead8",
  gas: "#5fd4ff",
  lung: "#9fb4cc",
  fluid: "#3ddc97",
  stone: "#fff1a8",
  lesion: "#ff8fd1",
} as const;

/** Anatomy categories: 0 = nothing, 1..n = organs (in ORGAN_KEYS order), then bone, gas and lung. */
export const CATEGORY_COLORS: readonly string[] = [
  "#000000",
  ...ORGAN_KEYS.map((key) => ORGAN_COLORS[key]),
  STRUCTURE_COLORS.bone,
  STRUCTURE_COLORS.gas,
  STRUCTURE_COLORS.lung,
  STRUCTURE_COLORS.fluid,
  STRUCTURE_COLORS.stone,
  STRUCTURE_COLORS.lesion,
];

/** Tissue class → anatomy category. */
export const TISSUE_CATEGORY: Uint8Array = (() => {
  const table = new Uint8Array(256);
  for (let t = 0; t < 256; t++) {
    const organ = TISSUE_TO_ORGAN[t];
    if (organ) table[t] = ORGAN_KEYS.indexOf(organ) + 1;
  }
  const base = ORGAN_KEYS.length + 1;
  table[TISSUE.bone] = base;
  table[TISSUE.cartilage] = base;
  table[TISSUE.air] = base + 1;
  table[TISSUE.stomachGas] = base + 1;
  table[TISSUE.lung] = base + 2;
  for (const t of [TISSUE.freeFluid, TISSUE.pelvicFluid, TISSUE.cyst, TISSUE.renalPelvis, TISSUE.pleuralFluid]) table[t] = base + 3;
  table[TISSUE.stone] = base + 4;
  for (const t of [TISSUE.hemangioma, TISSUE.metastasis, TISSUE.metastasisHalo]) table[t] = base + 5;
  return table;
})();

/** Red, green and blue of a #rrggbb colour. */
export function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
