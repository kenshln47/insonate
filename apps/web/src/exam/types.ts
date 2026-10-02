import type { CaseTruth, FindingSpec, Grade, Side, Vec3 } from "@insonate/sono-engine";

/**
 * The reporting exam: the student scans a patient whose findings were drawn at random, then writes
 * the report the way a department does (organ by organ, measurements, an impression), and it is
 * graded against the truth the patient was made from.
 */

/** 1 a focused question about one organ; 2 a full survey; 3 a full report with grades, tight measurements and a written impression. */
export type ExamLevel = 1 | 2 | 3;
export const EXAM_LEVELS: readonly ExamLevel[] = [1, 2, 3];

/** Why the patient was sent: sets the clinical scene (the request form's history). */
export type Reason =
  | "biliaryColic"
  | "cholecystitis"
  | "dyspepsia"
  | "metabolic"
  | "liverLesion"
  | "staging"
  | "renalColic"
  | "haematuria"
  | "hypertension"
  | "pulsatileMass"
  | "aaaScreening"
  | "trauma"
  | "distension"
  | "feverLuq"
  | "nightSweats"
  | "dyspnoea"
  | "vaguePain"
  | "rightUpperPain";

export type Department = "emergency" | "surgery" | "medicine" | "urology" | "oncology" | "familyMedicine" | "vascular";

/** The parts of the report, in the order a report is written. */
export type SectionKey =
  | "liver"
  | "gallbladder"
  | "pancreas"
  | "spleen"
  | "kidneyRight"
  | "kidneyLeft"
  | "aorta"
  | "bladder"
  | "fluid"
  | "pleura";
export const SECTIONS: readonly SectionKey[] = [
  "liver",
  "gallbladder",
  "pancreas",
  "spleen",
  "kidneyRight",
  "kidneyLeft",
  "aorta",
  "bladder",
  "fluid",
  "pleura",
];

export interface ExamCase {
  /** Shareable: the same code always makes the same case. */
  readonly code: string;
  readonly patient: string;
  readonly level: ExamLevel;
  readonly seed: number;
  readonly specs: readonly FindingSpec[];
  readonly reason: Reason;
  readonly department: Department;
  /** Level 1: the organ the request asks about; the report covers only it. */
  readonly focus: SectionKey | null;
  /** Medical record number on the request form (made up, from the seed). */
  readonly mrn: string;
}

/** What the worker made of the case: per finding, whether it fitted, its sizes and where it is. */
export interface MadeFinding {
  readonly spec: FindingSpec;
  readonly applied: boolean;
  readonly facts: Readonly<Record<string, number>>;
  readonly focus: Vec3 | null;
}

export interface CaseMade {
  readonly code: string;
  readonly findings: readonly MadeFinding[];
  readonly truth: CaseTruth;
  /** The middle of the liver (world mm): which lobe a lesion is in. */
  readonly liverMiddleX: number | null;
}

export type LiverLesion = "none" | "cyst" | "hemangioma" | "metastases";
export type GallbladderStatus = "normal" | "stones" | "polyp" | "cholecystitis";

export interface KidneyDraft {
  lengthMm: string;
  /** 0 none, 1 mild, 2 moderate, 3 severe. */
  hydro: 0 | Grade;
  stone: boolean;
  stoneMm: string;
  cyst: boolean;
  cystMm: string;
}

/** The student's report, as typed: starts as the department's normal template. */
export interface ReportDraft {
  liverFatty: 0 | Grade;
  liverLesion: LiverLesion;
  liverLesionMm: string;
  gallbladder: GallbladderStatus;
  gallbladderMm: string;
  gallbladderWallMm: string;
  murphy: boolean;
  pancreas: "normal" | "obscured";
  spleenMm: string;
  spleenEnlarged: boolean;
  kidneys: Record<Side, KidneyDraft>;
  aortaMm: string;
  aneurysm: boolean;
  /** 0 none, 1 small, 2 moderate, 3 large. */
  fluid: 0 | Grade;
  effusion: Record<Side, boolean>;
  impression: string;
}

export function blankReport(): ReportDraft {
  const kidney = (): KidneyDraft => ({ lengthMm: "", hydro: 0, stone: false, stoneMm: "", cyst: false, cystMm: "" });
  return {
    liverFatty: 0,
    liverLesion: "none",
    liverLesionMm: "",
    gallbladder: "normal",
    gallbladderMm: "",
    gallbladderWallMm: "",
    murphy: false,
    pancreas: "normal",
    spleenMm: "",
    spleenEnlarged: false,
    kidneys: { right: kidney(), left: kidney() },
    aortaMm: "",
    aneurysm: false,
    fluid: 0,
    effusion: { right: false, left: false },
    impression: "",
  };
}

export interface KidneyFacts {
  lengthMm: number | null;
  hydro: 0 | Grade;
  pelvisApMm: number | null;
  stoneMm: number | null;
  stoneSite: "lowerPole" | "pelvis" | null;
  cystMm: number | null;
  cystPole: "upper" | "mid" | "lower" | null;
}

/**
 * A report's content, whoever wrote it: the truth of a case, or a student's draft read as numbers.
 * The same writer turns either into report text.
 */
export interface ReportFacts {
  liver: {
    fatty: 0 | Grade;
    sparing: boolean;
    lesion: LiverLesion;
    lesionMm: number | null;
    lesionCount: number;
    lobe: "right" | "left" | null;
  };
  gallbladder: { status: GallbladderStatus; sizeMm: number | null; count: number; wallMm: number | null; murphy: boolean };
  pancreas: "normal" | "obscured";
  spleen: { lengthMm: number | null; status: "normal" | "borderline" | "enlarged" };
  kidneys: Record<Side, KidneyFacts>;
  aorta: { diameterMm: number | null; aneurysm: boolean; thrombus: boolean };
  fluid: 0 | Grade;
  effusion: Record<Side, boolean>;
}

/** One line of the marking: what was looked for, what the student said, and the points. */
export interface GradeItem {
  readonly section: SectionKey | "impression" | "study";
  /** What the item is about (a message key), with values for the message. */
  readonly code: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly earned: number;
  readonly max: number;
  readonly verdict: "correct" | "partial" | "wrong" | "missed" | "overcall" | "info";
}

export interface GradeResult {
  readonly items: readonly GradeItem[];
  readonly earned: number;
  readonly max: number;
  /** 0–100. */
  readonly percent: number;
  readonly passed: boolean;
}

export const PASS_MARK = 70;
