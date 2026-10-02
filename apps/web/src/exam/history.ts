import type { ExamLevel } from "./types";

/** One handed-in report, kept in this browser so a student can see their progress. */
export interface Attempt {
  readonly code: string;
  readonly level: ExamLevel;
  readonly percent: number;
  readonly passed: boolean;
  /** When handed in (ms since 1970) and how long it took (ms). */
  readonly at: number;
  readonly ms: number;
}

const KEY = "insonate:exams";
const KEEP = 40;

export function readAttempts(): Attempt[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is Attempt =>
        typeof a === "object" && a !== null && typeof a.code === "string" && [1, 2, 3].includes(a.level) && typeof a.percent === "number",
    );
  } catch {
    return [];
  }
}

export function saveAttempt(attempt: Attempt): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([attempt, ...readAttempts()].slice(0, KEEP)));
  } catch {
    // Storage unavailable: progress is not kept.
  }
}

/** The best score at each level so far. */
export function bestByLevel(attempts: readonly Attempt[]): Partial<Record<ExamLevel, number>> {
  const best: Partial<Record<ExamLevel, number>> = {};
  for (const a of attempts) best[a.level] = Math.max(best[a.level] ?? 0, a.percent);
  return best;
}
