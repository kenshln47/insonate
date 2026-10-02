import {
  DEFAULT_SETTINGS,
  type ImageSettings,
  PROBES,
  type ProbeKind,
  type ProbePose,
  type Variant,
  type Vec3,
} from "@insonate/sono-engine";
import { create } from "zustand";
import { DEFAULT_PATIENT, PATIENTS } from "../content/patients";
import { decodeExam } from "../exam/generate";
import { blankReport, type CaseMade, type ExamCase, type GradeResult, type KidneyDraft, type ReportDraft } from "../exam/types";
import type { Language } from "../i18n/messages";
import type { CoachResult } from "../sim/protocol";

export type Breathing = "normal" | "inspire" | "expire";
export type Mode = "free" | "tasks" | "cases" | "report";

/** What the worker reported about the current teaching case. */
export interface CaseInfo {
  readonly variant: Variant;
  readonly facts: Readonly<Record<string, number>>;
  readonly focus: Vec3 | null;
}

/** The reporting exam in progress: the case, the report being written, and the marks once handed in. */
export interface ExamState {
  readonly case: ExamCase;
  readonly startedAt: number;
  readonly draft: ReportDraft;
  /** The case as the worker made it (null until it is ready). */
  readonly made: CaseMade | null;
  readonly result: GradeResult | null;
  readonly submittedAt: number | null;
}

/** Mystery patient: a hidden case, and the student's answer once given. */
export interface Quiz {
  readonly secret: Variant;
  readonly answer: Variant | null;
}
export type Theme = "dark" | "light";
export type Dialog = "about" | "shortcuts" | "marker" | null;

/** A caliper measurement in plane coordinates (mm), so it survives resizing. */
export interface Measurement {
  a1: number;
  d1: number;
  a2: number;
  d2: number;
}

export interface Layers {
  skin: boolean;
  organs: boolean;
  /** Stomach and intestines. */
  bowel: boolean;
  bones: boolean;
  /** Lungs and heart. */
  lungs: boolean;
  /** Costal margin, xiphoid, umbilicus, pelvis and vertebral levels. */
  landmarks: boolean;
}

export interface MeasureCheck {
  taskId: string;
  measuredMm: number;
  inPlaneMm: number;
  organMm: number;
  kind: "length" | "diameter";
}

export interface SonoState {
  pose: ProbePose;
  settings: ImageSettings;
  breathing: Breathing;
  frozen: boolean;
  /** While frozen: the recorded frame shown (cine review); null = the frame the image froze on. */
  cineIndex: number | null;
  mode: Mode;
  taskId: string | null;
  labels: boolean;
  /** Colour outlines of the organs on the image (the "answer key"). */
  anatomy: boolean;
  /** The patient's real CT in the image plane, over the ultrasound (CT–ultrasound correlation). */
  ct: boolean;
  /** How much CT shows over the ultrasound: 0 (ultrasound) to 1 (CT only). */
  ctBlend: number;
  layers: Layers;
  measuring: boolean;
  measurements: Measurement[];
  coach: CoachResult | null;
  stats: { ms: number; contact: number };
  check: MeasureCheck | null;
  theme: Theme;
  language: Language;
  dialog: Dialog;
  /** Probe Cam: steering the probe with a printed marker and the webcam. */
  probeCam: boolean;
  /** PW Doppler angle correction: the angle between the beam and the flow, as the sonographer sets it (degrees). */
  dopplerAngle: number;
  /** Which patient (a TotalSegmentator case id). */
  patient: string;
  /** The patient: as scanned ("normal") or a teaching case with one finding. */
  variant: Variant;
  caseInfo: CaseInfo | null;
  quiz: Quiz | null;
  exam: ExamState | null;
  /** What the patient just did (wince under the probe: Murphy's sign), shown over the image for a moment. */
  reaction: { readonly kind: "murphy"; readonly at: number } | null;

  setPose(pose: ProbePose): void;
  setSettings(patch: Partial<ImageSettings>): void;
  setTgc(index: number, value: number): void;
  setProbe(kind: ProbeKind): void;
  setBreathing(breathing: Breathing): void;
  setFrozen(frozen: boolean): void;
  setCineIndex(index: number | null): void;
  setMode(mode: Mode): void;
  setTask(taskId: string | null): void;
  setLabels(on: boolean): void;
  setAnatomy(on: boolean): void;
  setCt(on: boolean): void;
  setCtBlend(blend: number): void;
  setLayer(layer: keyof Layers, on: boolean): void;
  setMeasuring(on: boolean): void;
  addMeasurement(m: Measurement): void;
  clearMeasurements(): void;
  setCoach(coach: CoachResult | null): void;
  setStats(stats: { ms: number; contact: number }): void;
  setCheck(check: MeasureCheck | null): void;
  setTheme(theme: Theme): void;
  setLanguage(language: Language): void;
  setDialog(dialog: Dialog): void;
  setProbeCam(on: boolean): void;
  setDopplerAngle(degrees: number): void;
  setPatient(patient: string): void;
  setVariant(variant: Variant): void;
  setCaseInfo(info: CaseInfo | null): void;
  /** Start a mystery patient (the case is chosen by the caller), answer it, or leave it. */
  startQuiz(secret: Variant): void;
  answerQuiz(answer: Variant): void;
  endQuiz(): void;
  /** Start a reporting exam: its patient, a blank report, no help that the exam does not allow. */
  startExam(exam: ExamCase): void;
  setExamMade(made: CaseMade): void;
  updateReport(patch: Partial<ReportDraft>): void;
  updateKidney(side: "right" | "left", patch: Partial<KidneyDraft>): void;
  submitExam(result: GradeResult): void;
  endExam(): void;
  setReaction(reaction: SonoState["reaction"]): void;
}

/** True while an exam is being sat (not yet handed in): outlines, CT and (from level 2) labels are off. */
export function examLocked(state: Pick<SonoState, "exam">): boolean {
  return state.exam !== null && state.exam.result === null;
}

function readLanguage(): Language {
  try {
    const saved = localStorage.getItem("insonate:language");
    if (saved === "ar" || saved === "en") return saved;
  } catch {
    // Storage unavailable: fall back to the browser's language.
  }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ar") ? "ar" : "en";
}

function readPatient(): string {
  // A shared link names its patient (or an exam whose patient it is): it wins over the one remembered.
  if (typeof location !== "undefined") {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const exam = decodeExam(hash.get("exam") ?? "");
    if (exam) return exam.patient;
    const linked = hash.get("patient");
    if (linked && PATIENTS.some((p) => p.id === linked)) return linked;
  }
  try {
    const saved = localStorage.getItem("insonate:patient");
    if (saved && PATIENTS.some((p) => p.id === saved)) return saved;
  } catch {
    // Storage unavailable.
  }
  return DEFAULT_PATIENT;
}

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem("insonate:theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage unavailable: fall through to the default.
  }
  return "dark";
}

/** Before the case loads; the app then moves to the case's gallbladder view. */
export const INITIAL_POSE: ProbePose = { phiDeg: 41, zMm: 60, rotationDeg: -35, tiltDeg: -10, rockDeg: 0 };

export const useSono = create<SonoState>()((set) => ({
  pose: INITIAL_POSE,
  settings: { ...DEFAULT_SETTINGS, depthMm: 150, focusMm: 70 },
  breathing: "expire",
  frozen: false,
  cineIndex: null,
  mode: "free",
  taskId: null,
  labels: false,
  anatomy: false,
  ct: false,
  ctBlend: 1,
  layers: { skin: true, organs: true, bowel: true, bones: true, lungs: false, landmarks: true },
  measuring: false,
  measurements: [],
  coach: null,
  stats: { ms: 0, contact: 1 },
  check: null,
  theme: readTheme(),
  language: readLanguage(),
  dialog: null,
  probeCam: false,
  dopplerAngle: 0,
  patient: readPatient(),
  variant: "normal",
  caseInfo: null,
  quiz: null,
  exam: null,
  reaction: null,

  setPose: (pose) => set({ pose }),
  setSettings: (patch) =>
    set((state) => {
      const settings = { ...state.settings, ...patch };
      settings.focusMm = Math.min(settings.focusMm, settings.depthMm - 5);
      return { settings };
    }),
  setTgc: (index, value) =>
    set((state) => {
      const tgcDb = [...state.settings.tgcDb];
      tgcDb[index] = value;
      return { settings: { ...state.settings, tgcDb } };
    }),
  setProbe: (kind) =>
    set((state) => {
      const spec = PROBES[kind];
      return {
        settings: {
          ...state.settings,
          probe: kind,
          frequencyMHz: spec.frequencyMHz,
          depthMm: spec.depthMm,
          focusMm: Math.round(spec.depthMm * 0.45),
        },
        measurements: [],
      };
    }),
  setBreathing: (breathing) => set({ breathing }),
  setFrozen: (frozen) => set({ frozen, cineIndex: null }),
  setCineIndex: (cineIndex) => set({ cineIndex }),
  setMode: (mode) => set({ mode, taskId: null, coach: null, check: null }),
  setTask: (taskId) => set({ taskId, coach: null, check: null, measurements: [] }),
  setLabels: (labels) => set((state) => (labels && examLocked(state) && (state.exam?.case.level ?? 1) > 1 ? {} : { labels })),
  setAnatomy: (anatomy) => set((state) => (anatomy && examLocked(state) ? {} : { anatomy })),
  setCt: (ct) => set((state) => (ct && examLocked(state) ? {} : { ct })),
  setCtBlend: (ctBlend) => set({ ctBlend: Math.max(0, Math.min(1, ctBlend)) }),
  setLayer: (layer, on) => set((state) => ({ layers: { ...state.layers, [layer]: on } })),
  setMeasuring: (measuring) => set({ measuring }),
  addMeasurement: (m) => set((state) => ({ measurements: [...state.measurements.slice(-3), m], check: null })),
  clearMeasurements: () => set({ measurements: [], check: null }),
  setCoach: (coach) => set({ coach }),
  setStats: (stats) => set({ stats }),
  setCheck: (check) => set({ check }),
  setLanguage: (language) => {
    try {
      localStorage.setItem("insonate:language", language);
    } catch {
      // Not persisted.
    }
    set({ language });
  },
  setTheme: (theme) => {
    try {
      localStorage.setItem("insonate:theme", theme);
    } catch {
      // Not persisted.
    }
    set({ theme });
  },
  setDialog: (dialog) => set({ dialog }),
  setProbeCam: (probeCam) => set({ probeCam }),
  setDopplerAngle: (dopplerAngle) => set({ dopplerAngle: Math.max(-80, Math.min(80, dopplerAngle)) }),
  setPatient: (patient) => {
    try {
      localStorage.setItem("insonate:patient", patient);
    } catch {
      // Not persisted.
    }
    // A different body: start again from its own opening view, with no case or task carried over.
    set({
      patient,
      variant: "normal",
      caseInfo: null,
      quiz: null,
      exam: null,
      taskId: null,
      coach: null,
      check: null,
      measurements: [],
      frozen: false,
    });
  },
  setVariant: (variant) => set({ variant, caseInfo: null, exam: null }),
  setCaseInfo: (caseInfo) => set({ caseInfo }),
  startQuiz: (secret) => set({ quiz: { secret, answer: null }, variant: secret, caseInfo: null, exam: null }),
  answerQuiz: (answer) => set((state) => (state.quiz ? { quiz: { ...state.quiz, answer } } : {})),
  endQuiz: () => set({ quiz: null, variant: "normal", caseInfo: null }),
  startExam: (exam) =>
    set((state) => ({
      exam: { case: exam, startedAt: Date.now(), draft: blankReport(), made: null, result: null, submittedAt: null },
      // The exam's patient (loading them if they are not the one on the table).
      patient: exam.patient,
      mode: "report",
      variant: "normal",
      caseInfo: null,
      quiz: null,
      taskId: null,
      coach: null,
      check: null,
      measurements: [],
      frozen: false,
      cineIndex: null,
      anatomy: false,
      ct: false,
      labels: exam.level === 1 ? state.labels : false,
    })),
  setExamMade: (made) => set((state) => (state.exam && state.exam.case.code === made.code ? { exam: { ...state.exam, made } } : {})),
  updateReport: (patch) =>
    set((state) => (state.exam && !state.exam.result ? { exam: { ...state.exam, draft: { ...state.exam.draft, ...patch } } } : {})),
  updateKidney: (side, patch) =>
    set((state) => {
      if (!state.exam || state.exam.result) return {};
      const draft = state.exam.draft;
      return { exam: { ...state.exam, draft: { ...draft, kidneys: { ...draft.kidneys, [side]: { ...draft.kidneys[side], ...patch } } } } };
    }),
  submitExam: (result) => set((state) => (state.exam ? { exam: { ...state.exam, result, submittedAt: Date.now() } } : {})),
  endExam: () => set({ exam: null, reaction: null }),
  setReaction: (reaction) => set({ reaction }),
}));
