import type { Side } from "@insonate/sono-engine";

/**
 * Reading a written impression, in English or Arabic: which diagnoses it states, on which side, and
 * which it rules out. "Gallstones, no cholecystitis" states one and rules out the other; a negation
 * ("no", "without", "لا يوجد", "بدون") covers what follows it in the same clause.
 */

export type Diagnosis =
  | "gallstones"
  | "cholecystitis"
  | "polyp"
  | "fattyLiver"
  | "liverCyst"
  | "hemangioma"
  | "metastases"
  | "hydronephrosis"
  | "renalStone"
  | "renalCyst"
  | "aaa"
  | "freeFluid"
  | "splenomegaly"
  | "pleuralEffusion";

export const LATERAL: ReadonlySet<Diagnosis> = new Set(["hydronephrosis", "renalStone", "renalCyst", "pleuralEffusion"]);

export interface Impression {
  /** Diagnoses stated (not ruled out), with the sides named in the same clause. */
  readonly stated: ReadonlyMap<Diagnosis, ReadonlySet<Side>>;
  /** Says the study is normal (and states nothing else). */
  readonly normal: boolean;
}

/** Arabic and English text in one comparable form: lower case, no diacritics, one alef, one yaa. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, " ");
}

const STONE = ["stone", "calcul", "lith", "حصي", "حصوه", "حصوات", "حصاه"];
const GALLBLADDER = ["gallbladder", "gall bladder", "gall-bladder", " gb", "مراره", "المراره", "صفراء", "صفراوي"];
const KIDNEY = ["kidney", "renal", "nephr", "كليه", "الكلي", "كلوي", "كلي "];
const CYST = ["cyst", "كيس", "اكياس", "كيسه"];
const LIVER = ["liver", "hepat", "segment", "lobe", "كبد", "فص"];

interface Terms {
  /** Any of these alone names the diagnosis. */
  readonly any: readonly string[];
  /** Or one word from each group, in the same clause. */
  readonly all?: readonly (readonly string[])[];
  /** Not when any of these is in the clause (another diagnosis that shares a word). */
  readonly unless?: readonly string[];
}

const TERMS: Readonly<Record<Diagnosis, Terms>> = {
  gallstones: { any: ["cholelithiasis", "gallstone", "gall stone", "gall-stone", "choleliths"], all: [STONE, GALLBLADDER] },
  cholecystitis: {
    any: ["cholecystitis", "التهاب المراره", "التهاب في المراره", "التهاب بالمراره", "التهاب حاد بالمراره", "التهاب حاد في المراره"],
  },
  polyp: { any: ["polyp", "سليله", "سلائل", "زوائد لحميه", "زائده لحميه", "بوليب"] },
  fattyLiver: {
    any: [
      "fatty liver",
      "fatty infiltration",
      "steatosis",
      "steatotic",
      "nafld",
      "masld",
      "دهون علي الكبد",
      "دهون بالكبد",
      "دهون في الكبد",
      "كبد دهني",
      "الكبد الدهني",
      "تشحم",
      "ارتشاح دهني",
      "تدهن",
    ],
  },
  liverCyst: { any: ["hepatic cyst", "liver cyst"], all: [CYST, LIVER] },
  hemangioma: { any: ["haemangioma", "hemangioma", "hemangiomata", "ورم وعائي", "ورم دموي", "هيمانجيوما", "وعائي دموي"] },
  metastases: {
    any: [
      "metasta",
      "secondaries",
      "secondary deposit",
      "deposits",
      " mets",
      "اورام ثانويه",
      "ثانويات",
      "نقائل",
      "انبثاث",
      "نقيلي",
      "انتشار الورم",
      "انتشار سرطاني",
      "انتقال الورم",
    ],
  },
  hydronephrosis: {
    any: [
      "hydronephros",
      "hydroneph",
      "pelvicalyceal dilat",
      "pelvicaliceal dilat",
      "pelvi-calyceal dilat",
      "collecting system dilat",
      "dilated collecting",
      "dilated pelvicalyceal",
      "pcs dilat",
      "dilated renal pelvis",
      "استسقاء الكلي",
      "استسقاء كلوي",
      "استسقاء بالكلي",
      "استسقاء في الكلي",
      "موه الكلي",
      "توسع حوض الكلي",
      "توسع في حوض الكلي",
      "توسع الحوض",
      "تضخم حوض الكلي",
      "انتفاخ الكلي",
    ],
  },
  renalStone: {
    any: ["nephrolith", "urolith", "kidney stone", "renal stone", "renal calcul", "puj calcul", "pelviureteric"],
    all: [STONE, KIDNEY],
  },
  renalCyst: { any: ["renal cyst", "kidney cyst", "cortical cyst", "bosniak"], all: [CYST, KIDNEY] },
  aaa: {
    any: [
      "aneurysm",
      "aaa",
      "تمدد الشريان الابهر",
      "تمدد الابهر",
      "تمدد في الابهر",
      "تمدد في الشريان الابهر",
      "تمدد الاورطي",
      "ام الدم",
      "انورسم",
    ],
  },
  freeFluid: {
    any: [
      "free fluid",
      "ascites",
      "haemoperitoneum",
      "hemoperitoneum",
      "positive fast",
      "fast positive",
      "fast is positive",
      "morison",
      "intraperitoneal fluid",
      "سوائل حره",
      "سائل حر",
      "سوائل في البطن",
      "سوائل بالبطن",
      "استسقاء",
      "حبن",
      "نزيف داخلي",
    ],
    unless: [...KIDNEY, "جنب", "pleura"],
  },
  splenomegaly: {
    any: [
      "splenomegaly",
      "enlarged spleen",
      "spleen is enlarged",
      "spleen enlarged",
      "تضخم الطحال",
      "تضخم في الطحال",
      "طحال متضخم",
      "تضخم طحال",
    ],
  },
  pleuralEffusion: {
    any: [
      "pleural effusion",
      "effusion",
      "pleural fluid",
      "انصباب جنبي",
      "انصباب بالجنب",
      "انصباب في الجنب",
      "انصباب بلوري",
      "سائل في الجنب",
      "سوائل في الجنب",
      "ارتشاح بلوري",
      "انصباب",
    ],
  },
};

const NEGATIONS = [
  "no ",
  "not ",
  "without",
  "negative for",
  "absence of",
  "absent",
  "free of",
  "nor ",
  "neither",
  "rule out",
  "ruled out",
  "excluded",
  " لا ",
  " ولا ",
  " بلا ",
  " ليس",
  " ليست",
  " بدون",
  " دون ",
  " عدم",
  " لم ",
  " مافي",
  " ما في",
  " خالي",
  " سلبي",
  " ينفي",
];

/** Negations that follow what they deny: "free fluid: none", "حصوات: لا يوجد". */
const AFTER = [
  "absent",
  "none",
  " nil",
  "not seen",
  "not identified",
  "not visuali",
  "not present",
  "غير موجود",
  " لا يوجد",
  " لا توجد",
  " مافي",
];

const NORMAL = [
  "normal study",
  "normal abdominal",
  "normal abdomen",
  "normal ultrasound",
  "normal scan",
  "all normal",
  "everything normal",
  "unremarkable",
  "no abnormality",
  "no significant abnormality",
  "no sonographic abnormality",
  "within normal limits",
  "nad",
  "طبيعي",
  "سليم",
  "لا توجد اي",
  "لا يوجد اي",
  "لا شيء غير طبيعي",
];

/** A clause that is just "normal". */
const JUST_NORMAL = new Set(["normal", "normal.", "طبيعي", "طبيعيه", "سليم", "nad"]);

const RIGHT = ["right", "rt ", "r ", "يمين", "يمني", "اليمني", "الايمن", "ايمن"];
const LEFT = ["left", "lt ", "l ", "يسار", "يسري", "اليسري", "الايسر", "ايسر"];
const BOTH = ["bilateral", "both ", "الجهتين", "الجانبين", "كلتا", "كلا ", "ثنائي"];

/** Where a word starts in a clause (word-ish boundaries for Latin text), or -1. */
function find(clause: string, word: string): number {
  if (/^[a-z]/.test(word)) {
    let from = 0;
    while (from <= clause.length) {
      const at = clause.indexOf(word, from);
      if (at < 0) return -1;
      const before = at === 0 ? " " : clause[at - 1];
      if (!/[a-z]/.test(before)) return at;
      from = at + 1;
    }
    return -1;
  }
  return clause.indexOf(word);
}

function firstOf(clause: string, words: readonly string[]): number {
  let first = -1;
  for (const w of words) {
    const at = find(clause, w);
    if (at >= 0 && (first < 0 || at < first)) first = at;
  }
  return first;
}

function lastOf(clause: string, words: readonly string[]): number {
  let last = -1;
  for (const w of words) last = Math.max(last, clause.lastIndexOf(w));
  return last;
}

/** Split into clauses: sentences, lines, list items, and "but"/"however"/"لكن" (a new statement). */
function clauses(text: string): string[] {
  return ` ${normalizeText(text)} `
    .split(
      /[.;\n،؛!?]|,|\s(?:but|however|although|whereas|apart from|except)\s|\s(?:لكن|ولكن|بينما|ماعدا|عدا)\s|\(\s*\d+\s*\)|\s\d+[.)-]\s/,
    )
    .map((c) => ` ${c.trim()} `)
    .filter((c) => c.trim().length > 0);
}

export function readImpression(text: string): Impression {
  const stated = new Map<Diagnosis, Set<Side>>();
  let normal = false;
  for (const clause of clauses(text)) {
    const negation = firstOf(clause, NEGATIONS);
    const sides = new Set<Side>();
    if (firstOf(clause, RIGHT) >= 0 || firstOf(clause, BOTH) >= 0) sides.add("right");
    if (firstOf(clause, LEFT) >= 0 || firstOf(clause, BOTH) >= 0) sides.add("left");
    for (const [diagnosis, terms] of Object.entries(TERMS) as [Diagnosis, Terms][]) {
      if (terms.unless && firstOf(clause, terms.unless) >= 0 && firstOf(clause, terms.any) < 0) continue;
      let at = firstOf(clause, terms.any);
      if (terms.unless && at >= 0 && firstOf(clause, terms.unless) >= 0) {
        // A word shared with another diagnosis ("استسقاء" with "كلية" is hydronephrosis, not ascites).
        const specific = terms.any.filter((w) => w.length > 8);
        at = firstOf(clause, specific);
      }
      if (at < 0 && terms.all) {
        const positions = terms.all.map((group) => firstOf(clause, group));
        if (positions.every((p) => p >= 0)) at = Math.min(...positions);
      }
      if (at < 0) continue;
      // Ruled out: a negation before it in the same clause, or a denial after it ("stones: none").
      if (negation >= 0 && negation < at) continue;
      if (lastOf(clause, AFTER) > at) continue;
      const seen = stated.get(diagnosis) ?? new Set<Side>();
      for (const s of sides) seen.add(s);
      stated.set(diagnosis, seen);
    }
    if (firstOf(clause, NORMAL) >= 0 || JUST_NORMAL.has(clause.trim())) normal = true;
  }
  // "Otherwise normal" after a diagnosis is not a normal study.
  return { stated, normal: normal && stated.size === 0 };
}
