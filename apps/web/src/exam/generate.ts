import { type FindingSpec, type Grade, random, type Side } from "@insonate/sono-engine";
import { PATIENTS, type Patient } from "../content/patients";
import type { Department, ExamCase, ExamLevel, Reason, SectionKey } from "./types";

/**
 * Random exam cases that make clinical sense. A case starts from a scenario (why the patient was
 * sent and what they have), sized for the level: obvious findings at level 1, subtle ones (a 4 mm
 * stone, mild hydronephrosis, a little free fluid) at level 3, where an incidental finding the
 * request never mentions is also common, as in real practice. Patients get only what fits them:
 * no aneurysm or metastases in a healthy 30-year-old.
 */

type Rnd = () => number;

const pick = <T>(rnd: Rnd, items: readonly T[]): T => items[Math.floor(rnd() * items.length)];
const chance = (rnd: Rnd, p: number) => rnd() < p;
/** A value in [lo, hi] for the level: the first range at level 1, the last at level 3. */
function sized(rnd: Rnd, level: ExamLevel, ranges: readonly (readonly [number, number])[], step = 1): number {
  const [lo, hi] = ranges[Math.min(ranges.length, level) - 1];
  return Math.round((lo + (hi - lo) * rnd()) / step) * step;
}
const seedOf = (rnd: Rnd) => Math.floor(rnd() * 2 ** 31);
const grade = (rnd: Rnd, from: Grade, to: Grade): Grade => (from + Math.floor(rnd() * (to - from + 1))) as Grade;
const side = (rnd: Rnd): Side => (chance(rnd, 0.5) ? "right" : "left");
const kidneySection = (s: Side): SectionKey => (s === "right" ? "kidneyRight" : "kidneyLeft");

interface Made {
  specs: FindingSpec[];
  reason: Reason;
  department: Department;
  focus: SectionKey | null;
}

interface Scenario {
  readonly id: string;
  readonly levels: readonly ExamLevel[];
  readonly weight: number;
  /** Plausible in this patient. */
  readonly fits?: (patient: Patient) => boolean;
  make(rnd: Rnd, level: ExamLevel, patient: Patient): Made;
}

const older = (patient: Patient) => patient.age >= 55;

const SCENARIOS: readonly Scenario[] = [
  {
    id: "biliaryColic",
    levels: [1, 2, 3],
    weight: 3,
    make: (rnd, level) => {
      const count = level === 1 ? 2 + Math.floor(rnd() * 4) : 1 + Math.floor(rnd() * 6);
      const specs: FindingSpec[] = [
        {
          kind: "gallstones",
          count,
          largestMm: sized(rnd, level, [
            [10, 20],
            [6, 18],
            [4, 15],
          ]),
          seed: seedOf(rnd),
        },
      ];
      if (level > 1 && chance(rnd, 0.25)) specs.push({ kind: "fattyLiver", grade: grade(rnd, 1, 2), sparing: false });
      return { specs, reason: "biliaryColic", department: pick(rnd, ["surgery", "familyMedicine"] as const), focus: "gallbladder" };
    },
  },
  {
    id: "cholecystitis",
    levels: [1, 2, 3],
    weight: 2,
    make: (rnd, level) => ({
      specs: [
        {
          kind: "cholecystitis",
          wallMm: sized(
            rnd,
            level,
            [
              [8, 10],
              [7, 9.5],
              [6.5, 8.5],
            ],
            0.5,
          ),
          stones: 1 + Math.floor(rnd() * 3),
          largestMm: sized(rnd, level, [
            [12, 18],
            [9, 16],
            [8, 14],
          ]),
          seed: seedOf(rnd),
        },
      ],
      reason: "cholecystitis",
      department: "emergency",
      focus: "gallbladder",
    }),
  },
  {
    id: "polyp",
    levels: [2, 3],
    weight: 1.5,
    make: (rnd, level) => {
      const specs: FindingSpec[] = [
        {
          kind: "gbPolyp",
          sizeMm: sized(rnd, level, [
            [7, 9],
            [6, 9],
            [4, 8],
          ]),
          seed: seedOf(rnd),
        },
      ];
      if (chance(rnd, 0.3)) specs.push({ kind: "fattyLiver", grade: 1, sparing: false });
      return { specs, reason: pick(rnd, ["dyspepsia", "rightUpperPain"] as const), department: "familyMedicine", focus: "gallbladder" };
    },
  },
  {
    id: "fattyLiver",
    levels: [1, 2, 3],
    weight: 2,
    make: (rnd, level) => {
      const g = level === 1 ? grade(rnd, 2, 3) : grade(rnd, 1, 3);
      const specs: FindingSpec[] = [{ kind: "fattyLiver", grade: g, sparing: g >= 2 && chance(rnd, 0.5) }];
      if (level > 1 && chance(rnd, 0.3))
        specs.push({
          kind: "gallstones",
          count: 1 + Math.floor(rnd() * 4),
          largestMm: sized(rnd, level, [
            [8, 14],
            [6, 12],
            [5, 10],
          ]),
          seed: seedOf(rnd),
        });
      return { specs, reason: "metabolic", department: "medicine", focus: "liver" };
    },
  },
  {
    id: "liverLesion",
    levels: [1, 2, 3],
    weight: 2,
    make: (rnd, level) => {
      const hemangioma = level > 1 && chance(rnd, 0.45);
      const specs: FindingSpec[] = hemangioma
        ? [
            {
              kind: "hemangioma",
              sizeMm: sized(rnd, level, [
                [22, 35],
                [16, 32],
                [10, 24],
              ]),
              seed: seedOf(rnd),
            },
          ]
        : [
            {
              kind: "liverCyst",
              sizeMm: sized(rnd, level, [
                [32, 55],
                [16, 45],
                [10, 32],
              ]),
              seed: seedOf(rnd),
            },
          ];
      const vague = level === 3 && chance(rnd, 0.35);
      return {
        specs,
        reason: vague ? "vaguePain" : "liverLesion",
        department: pick(rnd, ["familyMedicine", "medicine"] as const),
        focus: "liver",
      };
    },
  },
  {
    id: "staging",
    levels: [3],
    weight: 1.2,
    fits: older,
    make: (rnd) => {
      const specs: FindingSpec[] = [
        { kind: "metastases", count: 3 + Math.floor(rnd() * 5), largestMm: 16 + Math.floor(rnd() * 16), seed: seedOf(rnd) },
      ];
      if (chance(rnd, 0.35)) specs.push({ kind: "freeFluid", amount: grade(rnd, 1, 2) });
      if (chance(rnd, 0.25)) specs.push({ kind: "pleuralEffusion", side: side(rnd), depthMm: 28 + Math.floor(rnd() * 16) });
      return { specs, reason: "staging", department: "oncology", focus: "liver" };
    },
  },
  {
    id: "renalColic",
    levels: [1, 2, 3],
    weight: 3,
    make: (rnd, level) => {
      const s = side(rnd);
      const specs: FindingSpec[] = [];
      const obstructing = level === 1 ? chance(rnd, 0.75) : chance(rnd, 0.6);
      if (obstructing) {
        specs.push({
          kind: "hydronephrosis",
          side: s,
          grade: level === 1 ? grade(rnd, 2, 3) : level === 2 ? grade(rnd, 1, 3) : grade(rnd, 1, 2),
        });
        specs.push({
          kind: "renalStone",
          side: s,
          sizeMm: sized(rnd, level, [
            [8, 12],
            [6, 11],
            [5, 9],
          ]),
          site: "pelvis",
        });
      } else if (level === 1) {
        specs.push({ kind: "hydronephrosis", side: s, grade: grade(rnd, 2, 3) });
      } else {
        // A stone that is not blocking anything: a shadow in the lower pole, and nothing else.
        specs.push({
          kind: "renalStone",
          side: s,
          sizeMm: sized(rnd, level, [
            [8, 10],
            [6, 9],
            [4, 7],
          ]),
          site: "lowerPole",
        });
      }
      const misleading = level === 3 && s === "right" && chance(rnd, 0.3);
      return {
        specs,
        reason: misleading ? "rightUpperPain" : "renalColic",
        department: pick(rnd, ["emergency", "urology"] as const),
        focus: kidneySection(s),
      };
    },
  },
  {
    id: "renalCyst",
    levels: [1, 2, 3],
    weight: 1.5,
    make: (rnd, level) => {
      const s = side(rnd);
      return {
        specs: [
          {
            kind: "renalCyst",
            side: s,
            sizeMm: sized(rnd, level, [
              [35, 60],
              [20, 50],
              [12, 38],
            ]),
            pole: pick(rnd, ["upper", "mid", "lower"] as const),
            seed: seedOf(rnd),
          },
        ],
        reason: pick(rnd, ["hypertension", "haematuria"] as const),
        department: pick(rnd, ["medicine", "urology"] as const),
        focus: kidneySection(s),
      };
    },
  },
  {
    id: "aaa",
    levels: [1, 2, 3],
    weight: 2,
    fits: older,
    make: (rnd, level) => ({
      specs: [
        {
          kind: "aaa",
          diameterMm: sized(rnd, level, [
            [50, 68],
            [40, 62],
            [33, 55],
          ]),
          lumenFraction: Math.round((0.45 + 0.3 * rnd()) * 100) / 100,
        },
      ],
      reason: level === 1 || chance(rnd, 0.5) ? "pulsatileMass" : "aaaScreening",
      department: pick(rnd, ["vascular", "familyMedicine"] as const),
      focus: "aorta",
    }),
  },
  {
    id: "trauma",
    levels: [1, 2, 3],
    weight: 2,
    make: (rnd, level) => ({
      specs: [{ kind: "freeFluid", amount: level === 1 ? grade(rnd, 2, 3) : level === 2 ? grade(rnd, 1, 3) : grade(rnd, 1, 2) }],
      reason: "trauma",
      department: "emergency",
      focus: "fluid",
    }),
  },
  {
    id: "ascites",
    levels: [2, 3],
    weight: 1,
    make: (rnd) => {
      const specs: FindingSpec[] = [{ kind: "freeFluid", amount: 3 }];
      if (chance(rnd, 0.3)) specs.push({ kind: "pleuralEffusion", side: "right", depthMm: 28 + Math.floor(rnd() * 15) });
      return { specs, reason: "distension", department: "medicine", focus: "fluid" };
    },
  },
  {
    id: "splenomegaly",
    levels: [1, 2, 3],
    weight: 1.5,
    make: (rnd, level, patient) => ({
      specs: [
        {
          kind: "splenomegaly",
          lengthMm: sized(rnd, level, [
            [178, 200],
            [162, 190],
            [155, 172],
          ]),
        },
      ],
      reason: older(patient) ? "nightSweats" : "feverLuq",
      department: "medicine",
      focus: "spleen",
    }),
  },
  {
    id: "effusion",
    levels: [2, 3],
    weight: 1.2,
    make: (rnd, level) => {
      const specs: FindingSpec[] = [
        {
          kind: "pleuralEffusion",
          side: side(rnd),
          depthMm: sized(rnd, level, [
            [45, 60],
            [40, 60],
            [28, 45],
          ]),
        },
      ];
      if (chance(rnd, 0.3)) specs.push({ kind: "freeFluid", amount: 1 });
      return { specs, reason: "dyspnoea", department: "medicine", focus: "pleura" };
    },
  },
  {
    id: "normal",
    levels: [2, 3],
    // About one patient in eight: a normal study must be called normal.
    weight: 3.5,
    make: (rnd) => ({
      specs: [],
      reason: pick(rnd, ["vaguePain", "rightUpperPain"] as const),
      department: "familyMedicine",
      focus: null,
    }),
  },
];

/** Findings that turn up unasked (levels 2 and 3): small, benign, easy to miss. */
function incidental(rnd: Rnd, level: ExamLevel, specs: readonly FindingSpec[]): FindingSpec | null {
  const has = (kind: FindingSpec["kind"]) => specs.some((s) => s.kind === kind);
  const kidneyBusy = (s: Side) => specs.some((x) => "side" in x && x.side === s && x.kind !== "pleuralEffusion");
  const options: Array<() => FindingSpec | null> = [
    () => {
      const s = side(rnd);
      return kidneyBusy(s)
        ? null
        : {
            kind: "renalCyst",
            side: s,
            sizeMm: sized(rnd, level, [
              [20, 30],
              [16, 30],
              [12, 24],
            ]),
            pole: pick(rnd, ["upper", "mid", "lower"] as const),
            seed: seedOf(rnd),
          };
    },
    () =>
      has("liverCyst") || has("hemangioma") || has("metastases")
        ? null
        : {
            kind: "liverCyst",
            sizeMm: sized(rnd, level, [
              [16, 24],
              [12, 22],
              [10, 18],
            ]),
            seed: seedOf(rnd),
          },
    () =>
      has("gallstones") || has("cholecystitis") || has("gbPolyp")
        ? null
        : {
            kind: "gbPolyp",
            sizeMm: sized(rnd, level, [
              [5, 7],
              [5, 7],
              [4, 6],
            ]),
            seed: seedOf(rnd),
          },
    () =>
      has("liverCyst") || has("hemangioma") || has("metastases")
        ? null
        : {
            kind: "hemangioma",
            sizeMm: sized(rnd, level, [
              [14, 20],
              [12, 20],
              [10, 16],
            ]),
            seed: seedOf(rnd),
          },
    () => {
      const s = side(rnd);
      return kidneyBusy(s)
        ? null
        : {
            kind: "renalStone",
            side: s,
            sizeMm: sized(rnd, level, [
              [6, 8],
              [5, 7],
              [4, 6],
            ]),
            site: "lowerPole",
          };
    },
    () => (has("fattyLiver") ? null : { kind: "fattyLiver", grade: 1, sparing: false }),
  ];
  for (let tries = 0; tries < 6; tries++) {
    const made = pick(rnd, options)();
    if (made) return made;
  }
  return null;
}

/** Make the case for a patient, level and seed: always the same case for the same three. */
export function generateExam(patientId: string, level: ExamLevel, seed: number): ExamCase {
  const patient = PATIENTS.find((p) => p.id === patientId) ?? PATIENTS[0];
  const rnd = random(seed);
  const pool = SCENARIOS.filter((s) => s.levels.includes(level) && (!s.fits || s.fits(patient)));
  const total = pool.reduce((sum, s) => sum + s.weight, 0);
  let draw = rnd() * total;
  let scenario = pool[pool.length - 1];
  for (const s of pool) {
    draw -= s.weight;
    if (draw <= 0) {
      scenario = s;
      break;
    }
  }
  const made = scenario.make(rnd, level, patient);
  const specs = [...made.specs];
  // Incidental findings: common at level 3, rarer in a patient sent with a normal story.
  const unasked = scenario.id === "normal" ? (level === 3 ? 0.2 : 0) : level === 2 ? 0.2 : 0.4;
  if (level > 1 && chance(rnd, unasked)) {
    const extra = incidental(rnd, level, specs);
    if (extra) specs.push(extra);
  }
  // s0319's CT has a real 3.7 cm aneurysm. Keep it now and then (levels 2–3: an incidental finding
  // the request never mentions); otherwise give him a normal aorta, or grow it into the case's AAA.
  if (patient.nativeAneurysm) {
    const keep = level > 1 && !specs.some((s) => s.kind === "aaa") && chance(rnd, 0.35);
    if (!keep) specs.unshift({ kind: "aortaCalibre", diameterMm: 19 + Math.floor(rnd() * 4) });
    // Kept, it must be findable: graded compression clears the bowel gas in front of his aorta.
    else specs.push({ kind: "aortaWindow" });
  }
  return {
    code: encodeExam(patient.id, level, seed),
    patient: patient.id,
    level,
    seed,
    specs,
    reason: made.reason,
    department: made.department,
    focus: level === 1 ? made.focus : null,
    mrn: String(1_000_000 + (seed % 8_999_999)),
  };
}

/** A new random case at a level, in a random patient. */
export function newExam(level: ExamLevel, rnd: Rnd = Math.random): ExamCase {
  const patient = PATIENTS[Math.floor(rnd() * PATIENTS.length)];
  return generateExam(patient.id, level, Math.floor(rnd() * 2 ** 31));
}

/**
 * An exam code: patient, level and seed in a few letters, so a teacher can give a whole class the
 * same case. Not a secret, but the findings are not readable from it.
 */
export function encodeExam(patientId: string, level: ExamLevel, seed: number): string {
  const p = Math.max(
    0,
    PATIENTS.findIndex((x) => x.id === patientId),
  );
  return (seed * 24 + p * 3 + (level - 1)).toString(36);
}

export function decodeExam(code: string): { patient: string; level: ExamLevel; seed: number } | null {
  if (!/^[0-9a-z]{1,12}$/.test(code)) return null;
  const n = Number.parseInt(code, 36);
  if (!Number.isSafeInteger(n)) return null;
  const level = ((n % 3) + 1) as ExamLevel;
  const p = Math.floor(n / 3) % 8;
  const seed = Math.floor(n / 24);
  const patient = PATIENTS[p];
  if (!patient) return null;
  return { patient: patient.id, level, seed };
}

export const SCENARIO_IDS = SCENARIOS.map((s) => s.id);
