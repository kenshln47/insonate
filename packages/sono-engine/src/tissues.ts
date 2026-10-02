/**
 * Acoustic tissue classes. Each voxel of a case volume stores one of these ids.
 * Values are typical literature figures, rounded for teaching.
 */
export const TISSUE = {
  outside: 0,
  air: 1,
  lung: 2,
  fat: 3,
  soft: 4,
  muscle: 5,
  bone: 6,
  cartilage: 7,
  blood: 8,
  fluid: 9,
  liver: 10,
  liverVessel: 11,
  gallbladder: 12,
  spleen: 13,
  pancreas: 14,
  kidneyRight: 15,
  kidneyLeft: 16,
  sinusRight: 17,
  sinusLeft: 18,
  renalPelvis: 19,
  bladder: 20,
  aorta: 21,
  ivc: 22,
  portalVein: 23,
  bowelWall: 24,
  heartMuscle: 25,
  adrenal: 26,
  prostate: 27,
  /** Retroperitoneal, perirenal and mesenteric fat: echogenic, unlike subcutaneous fat. */
  deepFat: 28,
  /** Renal medulla (the pyramids): darker than the cortex around it. */
  medullaRight: 29,
  medullaLeft: 30,
  /** Walls and capsules: thin, bright lines (a one-voxel shell of their organ). */
  gallbladderWall: 31,
  bladderWall: 32,
  aortaWall: 33,
  portalWall: 34,
  ivcWall: 35,
  liverCapsule: 36,
  spleenCapsule: 37,
  /** The stomach hangs from the diaphragm and moves with breathing, unlike the rest of the bowel. */
  stomachWall: 38,
  stomachGas: 39,
  stomachFluid: 40,
  /** Common iliac arteries and veins: blood, kept apart so Doppler knows which way it flows. */
  iliacArtery: 41,
  iliacVein: 42,
  /** Pathology (case variants): gallstones, aneurysm thrombus, a simple liver cyst and free fluid. */
  stone: 43,
  thrombus: 44,
  cyst: 45,
  /** Free fluid in the upper abdomen (moves with the liver and spleen) and in the pelvis (does not). */
  freeFluid: 46,
  pelvicFluid: 47,
  /** Unlabelled soft tissue deep in the abdomen (mesentery, nodes, vessel walls): it moves with breathing, unlike the body wall. */
  deepSoft: 48,
  /** More findings: a gallbladder polyp and the oedema of an inflamed gallbladder wall... */
  polyp: 49,
  wallOedema: 50,
  /** ...a liver haemangioma, and a metastasis (its core and its dark halo)... */
  hemangioma: 51,
  metastasis: 52,
  metastasisHalo: 53,
  /** ...fluid in the pleural space... */
  pleuralFluid: 54,
  /** ...and liver spared by fat in a fatty liver (focal fatty sparing): it keeps the normal liver's look. */
  liverSpared: 55,
} as const;

export type TissueId = (typeof TISSUE)[keyof typeof TISSUE];

export interface TissueProps {
  readonly name: string;
  /** Acoustic impedance, MRayl. */
  readonly impedance: number;
  /** Attenuation, dB per cm per MHz. */
  readonly attenuation: number;
  /** Relative backscatter amplitude (echogenicity); 0 = anechoic. */
  readonly backscatter: number;
  /** How much the backscatter varies at a coarse scale (lobules, striations). */
  readonly heterogeneity: number;
  /** Moves craniocaudally with breathing. */
  readonly respiratory: boolean;
  /** Display colour for legends and the 3D view. */
  readonly color: string;
}

const T = (
  name: string,
  impedance: number,
  attenuation: number,
  backscatter: number,
  heterogeneity: number,
  respiratory: boolean,
  color: string,
): TissueProps => ({ name, impedance, attenuation, backscatter, heterogeneity, respiratory, color });

export const TISSUE_PROPS: readonly TissueProps[] = (() => {
  const table: TissueProps[] = new Array(256).fill(T("soft tissue", 1.63, 0.8, 0.3, 0.2, false, "#9a8478"));
  table[TISSUE.outside] = T("outside (gel)", 1.5, 0, 0, 0, false, "#000000");
  table[TISSUE.air] = T("gas", 0.0004, 12, 0, 0, true, "#202020");
  table[TISSUE.lung] = T("aerated lung", 0.0004, 12, 0, 0, true, "#d9c3c3");
  table[TISSUE.fat] = T("subcutaneous fat", 1.38, 0.6, 0.3, 0.5, false, "#e8d36a");
  table[TISSUE.deepFat] = T("deep fat", 1.38, 0.6, 0.9, 0.5, true, "#f0dc82");
  table[TISSUE.soft] = T("soft tissue", 1.63, 0.8, 0.3, 0.25, false, "#b3897c");
  table[TISSUE.deepSoft] = T("soft tissue (deep)", 1.63, 0.8, 0.3, 0.25, true, "#b3897c");
  table[TISSUE.muscle] = T("muscle", 1.7, 1.0, 0.26, 0.5, false, "#b5524b");
  table[TISSUE.bone] = T("bone", 7.8, 20, 0, 0, false, "#f2efe6");
  table[TISSUE.cartilage] = T("costal cartilage", 1.8, 1.2, 0.06, 0.1, false, "#c9e4e8");
  table[TISSUE.blood] = T("blood", 1.61, 0.18, 0.015, 0, true, "#c0392b");
  table[TISSUE.fluid] = T("fluid", 1.52, 0.002, 0, 0, true, "#5aa9e6");
  table[TISSUE.liver] = T("liver", 1.65, 0.5, 0.55, 0.12, true, "#8b5a3c");
  table[TISSUE.liverVessel] = T("hepatic vessel", 1.61, 0.18, 0.015, 0, true, "#7e3f9e");
  table[TISSUE.gallbladder] = T("gallbladder (bile)", 1.52, 0.002, 0, 0, true, "#3fae5a");
  table[TISSUE.spleen] = T("spleen", 1.65, 0.5, 0.6, 0.1, true, "#8e44ad");
  table[TISSUE.pancreas] = T("pancreas", 1.64, 0.6, 0.66, 0.35, true, "#e1b12c");
  table[TISSUE.kidneyRight] = T("kidney (right)", 1.62, 0.9, 0.38, 0.15, true, "#c0504d");
  table[TISSUE.kidneyLeft] = T("kidney (left)", 1.62, 0.9, 0.38, 0.15, true, "#d35f8d");
  table[TISSUE.medullaRight] = T("renal medulla (right)", 1.62, 0.9, 0.12, 0.1, true, "#a8403d");
  table[TISSUE.medullaLeft] = T("renal medulla (left)", 1.62, 0.9, 0.12, 0.1, true, "#b94f7a");
  table[TISSUE.sinusRight] = T("renal sinus fat (right)", 1.4, 0.6, 1.6, 0.45, true, "#f5e6a6");
  table[TISSUE.sinusLeft] = T("renal sinus fat (left)", 1.4, 0.6, 1.6, 0.45, true, "#f5e6a6");
  table[TISSUE.renalPelvis] = T("renal pelvis (urine)", 1.52, 0.002, 0, 0, true, "#5aa9e6");
  table[TISSUE.bladder] = T("bladder (urine)", 1.52, 0.002, 0, 0, false, "#f1c40f");
  table[TISSUE.aorta] = T("aorta", 1.61, 0.18, 0.015, 0, false, "#e74c3c");
  table[TISSUE.ivc] = T("inferior vena cava", 1.61, 0.18, 0.015, 0, true, "#3b6fd8");
  table[TISSUE.portalVein] = T("portal / splenic vein", 1.61, 0.18, 0.015, 0, true, "#6c5ce7");
  table[TISSUE.bowelWall] = T("bowel and stomach", 1.64, 0.9, 0.6, 0.6, true, "#c97b63");
  table[TISSUE.heartMuscle] = T("myocardium", 1.7, 1.0, 0.35, 0.3, false, "#a93226");
  table[TISSUE.adrenal] = T("adrenal gland", 1.63, 0.8, 0.45, 0.2, true, "#d68910");
  table[TISSUE.gallbladderWall] = T("gallbladder wall", 1.66, 0.9, 0.95, 0.15, true, "#2e8b4a");
  table[TISSUE.bladderWall] = T("bladder wall", 1.66, 0.9, 0.9, 0.15, false, "#d4a50a");
  table[TISSUE.aortaWall] = T("aortic wall", 1.7, 1.0, 1.1, 0.2, false, "#b03a2e");
  table[TISSUE.portalWall] = T("portal vein wall", 1.68, 0.8, 1.2, 0.1, true, "#5a4bd1");
  table[TISSUE.ivcWall] = T("caval wall", 1.66, 0.8, 0.5, 0.1, true, "#2f58b0");
  table[TISSUE.liverCapsule] = T("liver capsule", 1.68, 0.6, 1.0, 0.1, true, "#6e432c");
  table[TISSUE.spleenCapsule] = T("splenic capsule", 1.68, 0.6, 1.0, 0.1, true, "#6f3489");
  table[TISSUE.prostate] = T("prostate", 1.64, 0.8, 0.45, 0.3, false, "#cd6155");
  table[TISSUE.stomachWall] = T("stomach wall", 1.64, 0.9, 0.6, 0.6, true, "#d99a86");
  table[TISSUE.stomachGas] = T("gas in the stomach", 0.0004, 12, 0, 0, true, "#202020");
  table[TISSUE.stomachFluid] = T("fluid in the stomach", 1.52, 0.002, 0, 0, true, "#5aa9e6");
  table[TISSUE.iliacArtery] = T("iliac artery", 1.61, 0.18, 0.015, 0, false, "#e74c3c");
  table[TISSUE.iliacVein] = T("iliac vein", 1.61, 0.18, 0.015, 0, false, "#3b6fd8");
  // A gallstone reflects most of the beam at its surface and absorbs the rest: a bright arc over a clean shadow.
  table[TISSUE.stone] = T("gallstone", 6.0, 30, 0.6, 0.2, true, "#fff3c4");
  table[TISSUE.thrombus] = T("mural thrombus", 1.66, 0.8, 0.3, 0.35, false, "#9c3d36");
  table[TISSUE.cyst] = T("simple cyst (fluid)", 1.52, 0.002, 0, 0, true, "#5aa9e6");
  table[TISSUE.freeFluid] = T("free fluid", 1.52, 0.002, 0, 0, true, "#4fc3f7");
  table[TISSUE.pelvicFluid] = T("free fluid (pelvis)", 1.52, 0.002, 0, 0, false, "#4fc3f7");
  // A polyp is soft tissue: echogenic, but too small and too soft to stop the beam, so no shadow.
  table[TISSUE.polyp] = T("gallbladder polyp", 1.64, 0.7, 0.9, 0.15, true, "#9bd88f");
  table[TISSUE.wallOedema] = T("oedema in the gallbladder wall", 1.56, 0.3, 0.06, 0.3, true, "#7fc8a0");
  // A haemangioma is a sponge of small vascular spaces: many interfaces, so bright, and it hardly attenuates.
  table[TISSUE.hemangioma] = T("haemangioma", 1.63, 0.35, 2.0, 0.1, true, "#f5b7b1");
  table[TISSUE.metastasis] = T("metastasis", 1.65, 0.6, 0.75, 0.45, true, "#c39bd3");
  table[TISSUE.metastasisHalo] = T("metastasis (hypoechoic rim)", 1.6, 0.45, 0.09, 0.1, true, "#7d3c98");
  table[TISSUE.pleuralFluid] = T("pleural effusion", 1.52, 0.002, 0, 0, true, "#4fc3f7");
  table[TISSUE.liverSpared] = T("liver (spared from fat)", 1.65, 0.5, 0.55, 0.12, true, "#8b5a3c");
  return table;
})();

/**
 * How far the diaphragm, and the organs just under it, travel toward the feet in a deep breath
 * in and hold (mm). The CT was taken near end-expiration (the right hemidiaphragm is at T8),
 * which is the "breathe out" state; deep inspiration moves the liver 2-4 cm down.
 */
export const BREATH_EXCURSION_MM = 30;

/**
 * 1 for tissues that move craniocaudally with breathing (the contents of the abdominal cavity), by
 * tissue id. Everything else (body wall, muscles, bone, aorta, bladder) stays, and moving tissue
 * never takes its place: organs slide beside fixed structures, not into them.
 */
export const RESPIRATORY: Uint8Array = Uint8Array.from(TISSUE_PROPS, (p) => (p.respiratory ? 1 : 0));

/** Tissues an ultrasound beam cannot usefully pass. */
export function isBarrier(id: number): boolean {
  return isGas(id) || id === TISSUE.lung || id === TISSUE.bone;
}

/** Gas in the bowel or the stomach. */
export function isGas(id: number): boolean {
  return id === TISSUE.air || id === TISSUE.stomachGas;
}

/** Organs the trainer knows about, with the tissue ids that make them up. */
export const ORGANS = {
  liver: { name: "Liver", tissues: [TISSUE.liver, TISSUE.liverVessel, TISSUE.liverCapsule, TISSUE.liverSpared] },
  gallbladder: { name: "Gallbladder", tissues: [TISSUE.gallbladder, TISSUE.gallbladderWall, TISSUE.wallOedema, TISSUE.polyp] },
  kidneyRight: { name: "Right kidney", tissues: [TISSUE.kidneyRight, TISSUE.medullaRight, TISSUE.sinusRight] },
  kidneyLeft: { name: "Left kidney", tissues: [TISSUE.kidneyLeft, TISSUE.medullaLeft, TISSUE.sinusLeft] },
  spleen: { name: "Spleen", tissues: [TISSUE.spleen, TISSUE.spleenCapsule] },
  pancreas: { name: "Pancreas", tissues: [TISSUE.pancreas] },
  bladder: { name: "Urinary bladder", tissues: [TISSUE.bladder, TISSUE.bladderWall] },
  aorta: { name: "Abdominal aorta", tissues: [TISSUE.aorta, TISSUE.aortaWall, TISSUE.thrombus] },
  ivc: { name: "Inferior vena cava", tissues: [TISSUE.ivc, TISSUE.ivcWall] },
  portalVein: { name: "Portal vein", tissues: [TISSUE.portalVein, TISSUE.portalWall] },
} as const;

export type OrganKey = keyof typeof ORGANS;
export const ORGAN_KEYS = Object.keys(ORGANS) as OrganKey[];

/** Organs that move with breathing (liver, gallbladder, kidneys, spleen, pancreas, portal vein). */
export const MOVES_WITH_BREATH: Readonly<Record<OrganKey, boolean>> = Object.fromEntries(
  ORGAN_KEYS.map((key) => [key, TISSUE_PROPS[ORGANS[key].tissues[0]].respiratory]),
) as Record<OrganKey, boolean>;

/** Tissue id → organ, for fast lookups. */
export const TISSUE_TO_ORGAN: ReadonlyArray<OrganKey | null> = (() => {
  const map: Array<OrganKey | null> = new Array(256).fill(null);
  for (const key of ORGAN_KEYS) for (const tissue of ORGANS[key].tissues) map[tissue] = key;
  return map;
})();
