export function formatSeconds(ms: number, digits = 1): string {
  if (!Number.isFinite(ms)) return "–";
  return `${(Math.max(0, ms) / 1000).toFixed(digits)} s`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "–";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return `${minutes} min ${rest.toString().padStart(2, "0")} s`;
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return "–";
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "–" : `${value.toFixed(digits)} %`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Read a CSS custom property from the document root. */
export function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
