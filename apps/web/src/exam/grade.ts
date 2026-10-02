import type { Side } from "@insonate/sono-engine";
import { draftFacts, truthFacts, truthList } from "./facts";
import { type Diagnosis, readImpression } from "./impression";
import { type CaseMade, type ExamCase, type GradeItem, type GradeResult, PASS_MARK, type ReportDraft, type SectionKey } from "./types";

/**
 * Marking a report the way an examiner would: every finding the patient has must be found, in the
 * right organ and on the right side, then characterised (what it is, how severe, how big); every
 * finding reported that is not there costs marks; a normal study must be called normal. Level 1
 * marks only the organ the request asks about; level 2 adds the measurements; level 3 asks for
 * grades, tighter measurements and a written impression.
 */

/** Points: finding a finding, each detail of it, a routine measurement, a false finding, a line of the impression. */
const DETECT = 6;
const DETAIL = 2;
const OVERCALL = -4;
const MENTION = 2;

const round = (v: number) => Math.round(v * 10) / 10;

export function gradeReport(exam: ExamCase, built: CaseMade, draft: ReportDraft): GradeResult {
  const truth = truthFacts(built);
  const said = draftFacts(draft);
  const level = exam.level;
  const items: GradeItem[] = [];
  const scope = (section: SectionKey) => exam.focus === null || exam.focus === section;
  const push = (
    section: GradeItem["section"],
    code: string,
    earned: number,
    max: number,
    verdict: GradeItem["verdict"],
    params: Record<string, string | number> = {},
  ) => {
    items.push({ section, code, params, earned, max, verdict });
  };

  /**
   * A measurement against the truth (from level 2): full marks within the tolerance, half within
   * twice it. With a range, anything in the range is right (a normal aorta is not one width).
   */
  const measure = (
    section: SectionKey,
    code: string,
    value: number | null,
    target: number | null,
    options: { range?: readonly [number, number]; tolerance?: (target: number) => number } = {},
  ) => {
    if (level === 1 || target === null || target <= 0) return;
    const tol = options.tolerance ? options.tolerance(target) : level === 3 ? Math.max(2.5, target * 0.12) : Math.max(4, target * 0.2);
    const lo = (options.range?.[0] ?? target) - tol;
    const hi = (options.range?.[1] ?? target) + tol;
    const params = { truth: round(target), said: value ?? "", lo: round(Math.max(0, lo)), hi: round(hi) };
    if (value === null) push(section, `${code}.missing`, 0, DETAIL, "missed", params);
    else if (value >= lo && value <= hi) push(section, code, DETAIL, DETAIL, "correct", params);
    else if (value >= lo - tol && value <= hi + tol) push(section, code, DETAIL / 2, DETAIL, "partial", params);
    else if (value * 10 >= lo && value * 10 <= hi) push(section, `${code}.units`, 0, DETAIL, "wrong", params);
    else push(section, code, 0, DETAIL, "wrong", params);
  };

  /** A grade (1–3) against the truth, at level 3: exact, or one off for half. */
  const graded = (section: SectionKey, code: string, said: number, truthGrade: number) => {
    if (level < 3) return;
    const off = Math.abs(said - truthGrade);
    push(section, code, off === 0 ? DETAIL : off === 1 ? DETAIL / 2 : 0, DETAIL, off === 0 ? "correct" : off === 1 ? "partial" : "wrong", {
      truth: truthGrade,
      said,
    });
  };

  // Liver: echotexture, then any focal lesion.
  if (scope("liver")) {
    const t = truth.liver;
    const s = said.liver;
    if (t.fatty > 0) {
      if (s.fatty > 0) {
        push("liver", "fatty.found", DETECT, DETECT, "correct", { grade: t.fatty });
        graded("liver", "fatty.grade", s.fatty, t.fatty);
      } else {
        push("liver", "fatty.missed", 0, DETECT, "missed", { grade: t.fatty });
        if (level === 3) push("liver", "fatty.grade", 0, DETAIL, "missed", { truth: t.fatty, said: 0 });
      }
      if (t.sparing) push("liver", "fatty.sparing", 0, 0, "info");
    } else if (s.fatty > 0) {
      push("liver", "fatty.overcall", OVERCALL, 0, "overcall", { said: s.fatty });
    }
    if (t.lesion !== "none") {
      if (s.lesion === t.lesion) push("liver", "lesion.found", DETECT, DETECT, "correct", { lesion: t.lesion, count: t.lesionCount });
      else if (s.lesion !== "none") push("liver", "lesion.misread", DETECT / 2, DETECT, "partial", { lesion: t.lesion, said: s.lesion });
      else push("liver", "lesion.missed", 0, DETECT, "missed", { lesion: t.lesion });
      measure("liver", "lesion.size", s.lesion === "none" ? null : s.lesionMm, t.lesionMm);
    } else if (s.lesion !== "none") {
      push("liver", "lesion.overcall", OVERCALL, 0, "overcall", { said: s.lesion });
    }
  }

  // Gallbladder.
  if (scope("gallbladder")) {
    const t = truth.gallbladder;
    const s = said.gallbladder;
    if (t.status !== "normal") {
      if (s.status === t.status) push("gallbladder", `gb.${t.status}.found`, DETECT, DETECT, "correct", { count: t.count });
      else if (t.status === "cholecystitis" && s.status === "stones")
        push("gallbladder", "gb.cholecystitis.onlyStones", DETECT / 2, DETECT, "partial");
      else if (t.status === "stones" && s.status === "cholecystitis")
        push("gallbladder", "gb.stones.notInflamed", DETECT / 2, DETECT, "partial");
      else if (t.status === "polyp" && s.status === "stones") push("gallbladder", "gb.polyp.calledStone", 0, DETECT, "wrong");
      else if (t.status !== "polyp" && s.status === "polyp") push("gallbladder", "gb.stones.calledPolyp", 0, DETECT, "wrong");
      else push("gallbladder", `gb.${t.status}.missed`, 0, DETECT, "missed");
      measure("gallbladder", t.status === "polyp" ? "gb.polypSize" : "gb.stoneSize", s.status === "normal" ? null : s.sizeMm, t.sizeMm);
      if (t.status === "cholecystitis") {
        if (level >= 2)
          push(
            "gallbladder",
            s.murphy ? "gb.murphy.found" : "gb.murphy.missed",
            s.murphy ? DETAIL : 0,
            DETAIL,
            s.murphy ? "correct" : "missed",
          );
        if (level === 3) measure("gallbladder", "gb.wall", s.wallMm, t.wallMm, { tolerance: (w) => Math.max(1.5, w * 0.3) });
      }
    } else if (s.status !== "normal") {
      push("gallbladder", "gb.overcall", OVERCALL, 0, "overcall", { said: s.status });
    }
    if (t.status !== "cholecystitis" && s.murphy && level >= 2) push("gallbladder", "gb.murphy.overcall", -DETAIL, 0, "overcall");
  }

  // Spleen.
  if (scope("spleen")) {
    const t = truth.spleen;
    if (t.status === "enlarged") {
      push(
        "spleen",
        said.spleen.status === "enlarged" ? "spleen.found" : "spleen.missed",
        said.spleen.status === "enlarged" ? DETECT : 0,
        DETECT,
        said.spleen.status === "enlarged" ? "correct" : "missed",
        {
          truth: t.lengthMm ?? 0,
        },
      );
    } else if (t.status === "normal" && said.spleen.status === "enlarged") {
      push("spleen", "spleen.overcall", OVERCALL, 0, "overcall", { truth: t.lengthMm ?? 0 });
    } else if (t.status === "borderline") {
      push("spleen", "spleen.borderline", 0, 0, "info", { truth: t.lengthMm ?? 0 });
    }
    measure("spleen", "spleen.length", said.spleen.lengthMm, t.lengthMm);
  }

  // Kidneys.
  for (const side of ["right", "left"] as const) {
    const section: SectionKey = side === "right" ? "kidneyRight" : "kidneyLeft";
    if (!scope(section)) continue;
    const other: Side = side === "right" ? "left" : "right";
    const t = truth.kidneys[side];
    const s = said.kidneys[side];
    measure(section, "kidney.length", s.lengthMm, t.lengthMm);
    if (t.hydro > 0) {
      if (s.hydro > 0) {
        push(section, "kidney.hydro.found", DETECT, DETECT, "correct", { grade: t.hydro, ap: t.pelvisApMm ?? 0 });
        graded(section, "kidney.hydro.grade", s.hydro, t.hydro);
      } else {
        const wrongSide = said.kidneys[other].hydro > 0 && truth.kidneys[other].hydro === 0;
        push(section, wrongSide ? "kidney.hydro.wrongSide" : "kidney.hydro.missed", 0, DETECT, "missed", { grade: t.hydro });
        if (level === 3) push(section, "kidney.hydro.grade", 0, DETAIL, "missed", { truth: t.hydro, said: 0 });
      }
    } else if (s.hydro > 0) {
      push(section, "kidney.hydro.overcall", OVERCALL, 0, "overcall");
    }
    if (t.stoneMm) {
      push(
        section,
        said.stones[side] ? "kidney.stone.found" : "kidney.stone.missed",
        said.stones[side] ? DETECT : 0,
        DETECT,
        said.stones[side] ? "correct" : "missed",
        {
          site: t.stoneSite ?? "",
          obstructing: t.stoneSite === "pelvis" && t.hydro > 0 ? 1 : 0,
        },
      );
      measure(section, "kidney.stone.size", said.stones[side] ? s.stoneMm || null : null, t.stoneMm);
    } else if (said.stones[side]) {
      push(section, "kidney.stone.overcall", OVERCALL, 0, "overcall");
    }
    if (t.cystMm) {
      push(
        section,
        said.cysts[side] ? "kidney.cyst.found" : "kidney.cyst.missed",
        said.cysts[side] ? DETECT : 0,
        DETECT,
        said.cysts[side] ? "correct" : "missed",
        {
          pole: t.cystPole ?? "",
        },
      );
      measure(section, "kidney.cyst.size", said.cysts[side] ? s.cystMm || null : null, t.cystMm);
    } else if (said.cysts[side]) {
      push(section, "kidney.cyst.overcall", OVERCALL, 0, "overcall");
    }
  }

  // Aorta.
  if (scope("aorta")) {
    const lower = built.truth.aortaMm;
    const upper = built.truth.aortaUpperMm;
    if (truth.aorta.aneurysm) {
      push(
        "aorta",
        said.aorta.aneurysm ? "aorta.aneurysm.found" : "aorta.aneurysm.missed",
        said.aorta.aneurysm ? DETECT : 0,
        DETECT,
        said.aorta.aneurysm ? "correct" : "missed",
        {
          truth: lower,
        },
      );
      measure("aorta", "aorta.diameter", said.aorta.diameterMm, lower);
    } else {
      if (said.aorta.aneurysm) push("aorta", "aorta.aneurysm.overcall", OVERCALL, 0, "overcall", { truth: lower });
      // A normal aorta is wider near the diaphragm than near the bifurcation: anywhere along it counts.
      const low = Math.min(lower, upper || lower);
      measure("aorta", "aorta.diameter", said.aorta.diameterMm, lower, { range: [low * 0.85, Math.max(lower, upper)] });
    }
  }

  // Free fluid.
  if (scope("fluid")) {
    if (truth.fluid > 0) {
      if (said.fluid > 0) {
        push("fluid", "fluid.found", DETECT, DETECT, "correct", { amount: truth.fluid });
        graded("fluid", "fluid.amount", said.fluid, truth.fluid);
      } else {
        push("fluid", "fluid.missed", 0, DETECT, "missed", { amount: truth.fluid });
        if (level === 3) push("fluid", "fluid.amount", 0, DETAIL, "missed", { truth: truth.fluid, said: 0 });
      }
    } else if (said.fluid > 0) {
      push("fluid", "fluid.overcall", OVERCALL, 0, "overcall");
    }
  }

  // Pleural spaces.
  if (scope("pleura")) {
    for (const side of ["right", "left"] as const) {
      if (truth.effusion[side]) {
        push(
          "pleura",
          said.effusion[side] ? "pleura.found" : "pleura.missed",
          said.effusion[side] ? DETECT : 0,
          DETECT,
          said.effusion[side] ? "correct" : "missed",
          { side },
        );
      } else if (said.effusion[side]) {
        push("pleura", "pleura.overcall", OVERCALL, 0, "overcall", { side });
      }
    }
  }

  // A normal study must be called normal.
  const expected = truthList(truth).filter((entry) => {
    const [diagnosis, side] = entry.split(":");
    return exam.focus === null || sectionOf(diagnosis as Diagnosis, side as Side | undefined) === exam.focus;
  });
  if (expected.length === 0) {
    const overcalled = items.some((i) => i.verdict === "overcall");
    push(
      "study",
      overcalled ? "study.normal.overcalled" : "study.normal",
      overcalled ? 0 : DETECT,
      DETECT,
      overcalled ? "wrong" : "correct",
    );
  }

  // The impression, written (level 3).
  if (level === 3) {
    const read = readImpression(draft.impression);
    if (draft.impression.trim().length === 0) {
      push("impression", "impression.empty", 0, MENTION * Math.max(1, expected.length), "missed");
    } else {
      for (const entry of expected) {
        const [diagnosis, side] = entry.split(":") as [Diagnosis, Side | undefined];
        const sides = read.stated.get(diagnosis);
        const params = { diagnosis, side: side ?? "" };
        if (!sides) {
          if (diagnosis === "cholecystitis" && read.stated.has("gallstones"))
            push("impression", "impression.onlyStones", MENTION / 2, MENTION, "partial", params);
          else push("impression", "impression.missing", 0, MENTION, "missed", params);
        } else if (side && sides.size > 0 && !sides.has(side)) {
          push("impression", "impression.wrongSide", 0, MENTION, "wrong", params);
        } else if (side && sides.size === 0) {
          push("impression", "impression.noSide", MENTION / 2, MENTION, "partial", params);
        } else {
          push("impression", "impression.stated", MENTION, MENTION, "correct", params);
        }
      }
      const present = new Set(expected.map((e) => e.split(":")[0]));
      for (const diagnosis of read.stated.keys()) {
        if (present.has(diagnosis)) continue;
        if (diagnosis === "gallstones" && truth.gallbladder.status === "cholecystitis") continue;
        if (diagnosis === "splenomegaly" && truth.spleen.status === "borderline") continue;
        // At level 1 (not reached) the impression is not marked; out of scope findings are not marks lost.
        push("impression", "impression.overcall", -MENTION, 0, "overcall", { diagnosis });
      }
      if (expected.length === 0) {
        push(
          "impression",
          read.normal ? "impression.normal" : "impression.notNormal",
          read.normal ? MENTION : 0,
          MENTION,
          read.normal ? "correct" : "missed",
        );
      }
    }
  }

  const earned = items.reduce((sum, i) => sum + i.earned, 0);
  const max = items.reduce((sum, i) => sum + i.max, 0);
  const percent = max > 0 ? Math.min(100, Math.round((100 * Math.max(0, earned)) / max)) : 0;
  return { items, earned, max, percent, passed: percent >= PASS_MARK };
}

/** The report section a diagnosis belongs to. */
export function sectionOf(diagnosis: Diagnosis, side?: Side): SectionKey {
  switch (diagnosis) {
    case "gallstones":
    case "cholecystitis":
    case "polyp":
      return "gallbladder";
    case "fattyLiver":
    case "liverCyst":
    case "hemangioma":
    case "metastases":
      return "liver";
    case "hydronephrosis":
    case "renalStone":
    case "renalCyst":
      return side === "left" ? "kidneyLeft" : "kidneyRight";
    case "aaa":
      return "aorta";
    case "freeFluid":
      return "fluid";
    case "splenomegaly":
      return "spleen";
    case "pleuralEffusion":
      return "pleura";
  }
}
