import { ABDOMEN_TASKS, type DopplerMode, type ProbePose, VARIANTS, type Variant } from "@insonate/sono-engine";
import { PATIENTS } from "../content/patients";
import { decodeExam, generateExam } from "../exam/generate";
import type { Breathing, Mode, SonoState } from "../state/store";

/**
 * Shareable links: everything needed to put another student (or a whole class) in the same
 * place, in the URL hash, so a link works offline and from any static host.
 *
 *   #mode=tasks&task=kidney-right-long&view=70,42,-10,10,6&breath=in&doppler=color
 *   #case=gallstones
 *   #mystery=…   a teaching case for a quiz, lightly encoded so the answer is not in plain sight
 *   #exam=…      a reporting exam case: everyone who opens it gets the same patient and findings
 */
export interface Shared {
  readonly patient?: string;
  readonly mode?: Mode;
  readonly task?: string;
  readonly variant?: Variant;
  readonly mystery?: Variant;
  readonly pose?: ProbePose;
  readonly breathing?: Breathing;
  readonly doppler?: DopplerMode;
  /** A reporting exam's code. */
  readonly exam?: string;
}

const BREATH_CODES: Record<Breathing, string> = { inspire: "in", expire: "out", normal: "normal" };

/** A quiz case, encoded so the diagnosis is not readable in the link (not a secret: a courtesy). */
export function encodeMystery(variant: Variant): string {
  const index = VARIANTS.indexOf(variant);
  // A salt from the time, so two links to the same case look different.
  const salt = Math.floor(Date.now() / 1000) % 9973;
  return (salt * VARIANTS.length * 7 + index * 7 + 3).toString(36);
}

export function decodeMystery(code: string): Variant | null {
  const n = Number.parseInt(code, 36);
  if (!Number.isFinite(n) || n % 7 !== 3) return null;
  const index = Math.floor(n / 7) % VARIANTS.length;
  return VARIANTS[index] ?? null;
}

/** The link to the current state of the app. */
export function shareLink(state: SonoState, base: string): string {
  const params = new URLSearchParams();
  params.set("patient", state.patient);
  params.set("mode", state.mode);
  if (state.mode === "tasks" && state.taskId) params.set("task", state.taskId);
  if (state.exam) params.set("exam", state.exam.case.code);
  else if (state.quiz) params.set("mystery", encodeMystery(state.quiz.secret));
  else if (state.variant !== "normal") params.set("case", state.variant);
  const p = state.pose;
  params.set("view", [p.phiDeg, p.zMm, p.rotationDeg, p.tiltDeg, p.rockDeg].map((v) => Math.round(v * 10) / 10).join(","));
  params.set("breath", BREATH_CODES[state.breathing]);
  if (state.settings.doppler !== "off") params.set("doppler", state.settings.doppler);
  return `${base}#${params.toString()}`;
}

/** A link that opens a mystery patient with a given case (for an instructor to send). */
export function mysteryLink(variant: Variant, base: string): string {
  return `${base}#mode=cases&mystery=${encodeMystery(variant)}`;
}

/** Read a link's hash (without "#"); unknown or malformed parts are ignored. */
export function parseShare(hash: string): Shared {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const out: { -readonly [K in keyof Shared]: Shared[K] } = {};
  const patient = params.get("patient");
  if (patient && PATIENTS.some((p) => p.id === patient)) out.patient = patient;
  const mode = params.get("mode");
  if (mode === "free" || mode === "tasks" || mode === "cases" || mode === "report") out.mode = mode;
  const task = params.get("task");
  if (task && ABDOMEN_TASKS.some((t) => t.id === task)) out.task = task;
  const variant = params.get("case");
  if (variant && (VARIANTS as readonly string[]).includes(variant)) out.variant = variant as Variant;
  const mystery = params.get("mystery");
  if (mystery) out.mystery = decodeMystery(mystery) ?? undefined;
  const view = params.get("view")?.split(",").map(Number);
  if (view && view.length === 5 && view.every(Number.isFinite)) {
    out.pose = { phiDeg: view[0], zMm: view[1], rotationDeg: view[2], tiltDeg: view[3], rockDeg: view[4] };
  }
  const breath = params.get("breath");
  const breathing = (Object.keys(BREATH_CODES) as Breathing[]).find((b) => BREATH_CODES[b] === breath);
  if (breathing) out.breathing = breathing;
  const doppler = params.get("doppler");
  if (doppler === "color" || doppler === "pw") out.doppler = doppler;
  const exam = params.get("exam");
  if (exam && decodeExam(exam)) out.exam = exam;
  return out;
}

/** Put the app in the shared state (after the case has loaded). */
export function applyShare(shared: Shared, state: SonoState, setPose: (pose: ProbePose) => void): void {
  const exam = shared.exam ? decodeExam(shared.exam) : null;
  if (exam) {
    // An exam starts from its own request form: no pose, breath or Doppler carried over.
    state.startExam(generateExam(exam.patient, exam.level, exam.seed));
    return;
  }
  if (shared.mode) state.setMode(shared.mode);
  if (shared.task) state.setTask(shared.task);
  if (shared.mystery) state.startQuiz(shared.mystery);
  else if (shared.variant) state.setVariant(shared.variant);
  if (shared.breathing) state.setBreathing(shared.breathing);
  if (shared.doppler) state.setSettings({ doppler: shared.doppler });
  if (shared.pose) setPose(shared.pose);
}
