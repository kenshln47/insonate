import type { FindingSpec, Side } from "@insonate/sono-engine";
import type { CaseMade, KidneyDraft, KidneyFacts, MadeFinding, ReportDraft, ReportFacts } from "./types";

/**
 * Report content from either side: the truth of a case (what the patient was made with, and what
 * a sonographer would measure in it) or a student's draft (the typed numbers, read).
 */

/** Spleen length (mm) above which it is enlarged; between this and the upper limit, borderline. */
export const SPLEEN_NORMAL_MM = 130;
export const SPLEEN_ENLARGED_MM = 150;
/** An abdominal aorta this wide (outer to outer, mm) is aneurysmal. */
export const ANEURYSM_MM = 30;

type Kind = FindingSpec["kind"];
type SpecOf<K extends Kind> = Extract<FindingSpec, { kind: K }>;

function made<K extends Kind>(findings: readonly MadeFinding[], kind: K, side?: Side): { spec: SpecOf<K>; finding: MadeFinding } | null {
  for (const finding of findings) {
    if (!finding.applied || finding.spec.kind !== kind) continue;
    if (side && "side" in finding.spec && finding.spec.side !== side) continue;
    return { spec: finding.spec as SpecOf<K>, finding };
  }
  return null;
}

export function truthFacts(built: CaseMade): ReportFacts {
  const findings = built.findings;
  const fatty = made(findings, "fattyLiver");
  const cyst = made(findings, "liverCyst");
  const hemangioma = made(findings, "hemangioma");
  const mets = made(findings, "metastases");
  const lesion = mets ?? hemangioma ?? cyst;
  const lesionKind = mets ? "metastases" : hemangioma ? "hemangioma" : cyst ? "cyst" : "none";
  const lesionMm = lesion ? (lesion.finding.facts.largestMm ?? lesion.finding.facts.diameterMm ?? null) : null;
  const focusX = lesion?.finding.focus?.[0];
  const lobe = focusX !== undefined && built.liverMiddleX !== null ? (focusX >= built.liverMiddleX - 10 ? "right" : "left") : null;

  const chole = made(findings, "cholecystitis");
  const stones = made(findings, "gallstones");
  const polyp = made(findings, "gbPolyp");
  const gallbladder: ReportFacts["gallbladder"] = chole
    ? {
        status: "cholecystitis",
        sizeMm: chole.finding.facts.largestMm || null,
        count: chole.finding.facts.stones ?? 0,
        wallMm: chole.finding.facts.wallMm ?? null,
        murphy: true,
      }
    : stones
      ? {
          status: "stones",
          sizeMm: stones.finding.facts.largestMm ?? null,
          count: stones.finding.facts.stones ?? 0,
          wallMm: null,
          murphy: false,
        }
      : polyp
        ? { status: "polyp", sizeMm: polyp.finding.facts.sizeMm ?? null, count: 1, wallMm: null, murphy: false }
        : { status: "normal", sizeMm: null, count: 0, wallMm: null, murphy: false };

  const kidney = (side: Side): KidneyFacts => {
    const hydro = made(findings, "hydronephrosis", side);
    const stone = made(findings, "renalStone", side);
    const renalCyst = made(findings, "renalCyst", side);
    return {
      lengthMm: (side === "right" ? built.truth.kidneyRightMm : built.truth.kidneyLeftMm) || null,
      hydro: hydro ? hydro.spec.grade : 0,
      pelvisApMm: hydro?.finding.facts.pelvisApMm ?? null,
      stoneMm: stone?.finding.facts.sizeMm ?? null,
      stoneSite: stone ? stone.spec.site : null,
      cystMm: renalCyst?.finding.facts.diameterMm ?? null,
      cystPole: renalCyst ? renalCyst.spec.pole : null,
    };
  };

  const spleenMm = built.truth.spleenMm || null;
  const enlarged = made(findings, "splenomegaly") !== null || (spleenMm ?? 0) > SPLEEN_ENLARGED_MM;
  const aaa = made(findings, "aaa");
  const fluid = made(findings, "freeFluid");
  const effusion = (side: Side) => made(findings, "pleuralEffusion", side) !== null;
  return {
    liver: {
      fatty: fatty ? fatty.spec.grade : 0,
      sparing: (fatty?.finding.facts.sparing ?? 0) > 0,
      lesion: lesionKind,
      lesionMm,
      lesionCount: mets ? (mets.finding.facts.count ?? 0) : lesion ? 1 : 0,
      lobe: lesion ? lobe : null,
    },
    gallbladder,
    pancreas: "normal",
    spleen: {
      lengthMm: spleenMm,
      status: enlarged ? "enlarged" : (spleenMm ?? 0) >= SPLEEN_NORMAL_MM ? "borderline" : "normal",
    },
    kidneys: { right: kidney("right"), left: kidney("left") },
    aorta: { diameterMm: built.truth.aortaMm || null, aneurysm: built.truth.aortaMm >= ANEURYSM_MM, thrombus: aaa !== null },
    fluid: fluid ? fluid.spec.amount : 0,
    effusion: { right: effusion("right"), left: effusion("left") },
  };
}

/**
 * A typed measurement in mm, or null. Takes Arabic digits, a decimal comma and a unit ("10.5 cm",
 * "١٠٥ مم"); a bare number is millimetres, the field's unit.
 */
export function parseMm(text: string): number | null {
  const t = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, ".")
    .toLowerCase();
  const match = t.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const cm = /cm|سم/.test(t);
  return Math.round((cm ? value * 10 : value) * 10) / 10;
}

function kidneyDraft(k: KidneyDraft): KidneyFacts {
  return {
    lengthMm: parseMm(k.lengthMm),
    hydro: k.hydro,
    pelvisApMm: null,
    // Reported without a size: present (0), size unknown.
    stoneMm: k.stone ? (parseMm(k.stoneMm) ?? 0) : null,
    stoneSite: null,
    cystMm: k.cyst ? (parseMm(k.cystMm) ?? 0) : null,
    cystPole: null,
  };
}

/** The draft as report content (a stone with no size typed is still a stone). */
export function draftFacts(d: ReportDraft): ReportFacts & { stones: Record<Side, boolean>; cysts: Record<Side, boolean> } {
  const right = kidneyDraft(d.kidneys.right);
  const left = kidneyDraft(d.kidneys.left);
  return {
    liver: {
      fatty: d.liverFatty,
      sparing: false,
      lesion: d.liverLesion,
      lesionMm: d.liverLesion === "none" ? null : parseMm(d.liverLesionMm),
      lesionCount: d.liverLesion === "none" ? 0 : 1,
      lobe: null,
    },
    gallbladder: {
      status: d.gallbladder,
      sizeMm: d.gallbladder === "normal" ? null : parseMm(d.gallbladderMm),
      count: 0,
      wallMm: parseMm(d.gallbladderWallMm),
      murphy: d.murphy,
    },
    pancreas: d.pancreas,
    spleen: { lengthMm: parseMm(d.spleenMm), status: d.spleenEnlarged ? "enlarged" : "normal" },
    kidneys: { right, left },
    aorta: { diameterMm: parseMm(d.aortaMm), aneurysm: d.aneurysm, thrombus: false },
    fluid: d.fluid,
    effusion: d.effusion,
    stones: { right: d.kidneys.right.stone, left: d.kidneys.left.stone },
    cysts: { right: d.kidneys.right.cyst, left: d.kidneys.left.cyst },
  };
}

/** Everything the case has that a report should mention, in order of clinical weight. */
export function truthList(facts: ReportFacts): string[] {
  const list: string[] = [];
  if (facts.aorta.aneurysm) list.push("aaa");
  if (facts.fluid > 0) list.push("freeFluid");
  if (facts.gallbladder.status === "cholecystitis") list.push("cholecystitis");
  for (const side of ["right", "left"] as const) {
    if (facts.kidneys[side].hydro > 0) list.push(`hydronephrosis:${side}`);
    if (facts.kidneys[side].stoneMm !== null) list.push(`renalStone:${side}`);
  }
  if (facts.liver.lesion === "metastases") list.push("metastases");
  if (facts.effusion.right) list.push("pleuralEffusion:right");
  if (facts.effusion.left) list.push("pleuralEffusion:left");
  if (facts.spleen.status === "enlarged") list.push("splenomegaly");
  if (facts.gallbladder.status === "stones") list.push("gallstones");
  if (facts.gallbladder.status === "polyp") list.push("polyp");
  if (facts.liver.fatty > 0) list.push("fattyLiver");
  if (facts.liver.lesion === "hemangioma") list.push("hemangioma");
  if (facts.liver.lesion === "cyst") list.push("liverCyst");
  for (const side of ["right", "left"] as const) if (facts.kidneys[side].cystMm !== null) list.push(`renalCyst:${side}`);
  return list;
}
