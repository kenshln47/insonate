import type { FindingSpec } from "@insonate/sono-engine";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "../content/patients";
import { parseMm, truthFacts } from "./facts";
import { decodeExam, encodeExam, generateExam } from "./generate";
import { gradeReport } from "./grade";
import { readImpression } from "./impression";
import { blankReport, type CaseMade, type ExamCase, type ReportDraft } from "./types";
import { writeReport } from "./write";

const TRUTH = { kidneyRightMm: 112, kidneyLeftMm: 108, spleenMm: 105, aortaMm: 18, aortaUpperMm: 22, aortaFocus: null };

/** A case as if the worker made it: each spec applied with these facts. */
function caseOf(level: 1 | 2 | 3, findings: Array<{ spec: FindingSpec; facts: Record<string, number> }>, focus: ExamCase["focus"] = null) {
  const exam: ExamCase = {
    code: "test",
    patient: "s0139",
    level,
    seed: 1,
    specs: findings.map((f) => f.spec),
    reason: "vaguePain",
    department: "familyMedicine",
    focus,
    mrn: "1000001",
  };
  const built: CaseMade = {
    code: "test",
    findings: findings.map((f) => ({ spec: f.spec, applied: true, facts: f.facts, focus: [60, 0, 80] })),
    truth: TRUTH,
    liverMiddleX: 40,
  };
  return { exam, built };
}

function report(
  patch: Partial<ReportDraft>,
  kidneys?: Partial<Record<"right" | "left", Partial<ReportDraft["kidneys"]["right"]>>>,
): ReportDraft {
  // A careful student's normal template: the routine measurements taken.
  const draft = { ...blankReport(), spleenMm: "104", aortaMm: "19", ...patch };
  draft.kidneys = {
    right: { ...draft.kidneys.right, lengthMm: "110", ...kidneys?.right },
    left: { ...draft.kidneys.left, lengthMm: "106", ...kidneys?.left },
  };
  return draft;
}

const STONES: FindingSpec = { kind: "gallstones", count: 3, largestMm: 12, seed: 1 };

describe("exam cases", () => {
  it("are the same for the same patient, level and seed, and the code says which", () => {
    for (const level of [1, 2, 3] as const) {
      const a = generateExam("s0319", level, 123456);
      const b = generateExam("s0319", level, 123456);
      expect(a).toEqual(b);
      expect(decodeExam(a.code)).toEqual({ patient: "s0319", level, seed: 123456 });
      expect(encodeExam("s0139", level, 99)).not.toBe(encodeExam("s0319", level, 99));
    }
  });

  it("only give each patient what fits them, and level 1 always one organ with a finding", () => {
    const real = (specs: readonly FindingSpec[]) => specs.filter((s) => s.kind !== "aortaCalibre" && s.kind !== "aortaWindow");
    let normals = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (const patient of PATIENTS) {
        for (const level of [1, 2, 3] as const) {
          const exam = generateExam(patient.id, level, seed);
          const kinds = real(exam.specs).map((s) => s.kind);
          if (patient.age < 55) expect(kinds).not.toContain("aaa");
          if (patient.age < 55) expect(kinds).not.toContain("metastases");
          if (!patient.nativeAneurysm) expect(exam.specs.some((s) => s.kind === "aortaCalibre")).toBe(false);
          // One gallbladder finding and one kind of liver lesion at most.
          expect(kinds.filter((k) => k === "gallstones" || k === "gbPolyp" || k === "cholecystitis").length).toBeLessThanOrEqual(1);
          expect(kinds.filter((k) => k === "liverCyst" || k === "hemangioma" || k === "metastases").length).toBeLessThanOrEqual(1);
          if (level === 1) {
            expect(exam.focus).not.toBeNull();
            expect(kinds.length).toBeGreaterThanOrEqual(1);
          } else {
            expect(exam.focus).toBeNull();
            if (kinds.length === 0) normals++;
          }
        }
      }
    }
    // Normal studies come up too (they must be reported as normal).
    expect(normals).toBeGreaterThan(20);
  });
});

describe("reading an impression", () => {
  const stated = (text: string) => [...readImpression(text).stated.keys()].sort();

  it("finds stated diagnoses and leaves out those ruled out", () => {
    expect(stated("1. Cholelithiasis. 2. No hydronephrosis.")).toEqual(["gallstones"]);
    expect(stated("Gallstones with no evidence of cholecystitis")).toEqual(["gallstones"]);
    expect(stated("Free fluid: none.")).toEqual([]);
    expect(stated("Fatty liver, otherwise normal")).toEqual(["fattyLiver"]);
    expect(readImpression("Fatty liver, otherwise normal").normal).toBe(false);
    expect(readImpression("Normal abdominal ultrasound.").normal).toBe(true);
  });

  it("knows the side, and both sides", () => {
    const read = readImpression("Right hydronephrosis secondary to an obstructing PUJ calculus.");
    expect([...(read.stated.get("hydronephrosis") ?? [])]).toEqual(["right"]);
    expect([...(read.stated.get("renalStone") ?? [])]).toEqual(["right"]);
    expect([...(readImpression("Bilateral simple renal cysts").stated.get("renalCyst") ?? [])].sort()).toEqual(["left", "right"]);
  });

  it("reads Arabic, with its negations", () => {
    expect(stated("حصوات في المرارة بدون التهاب")).toEqual(["gallstones"]);
    expect(stated("لا توجد سوائل حرة")).toEqual([]);
    expect(stated("استسقاء في الكلية اليسرى")).toEqual(["hydronephrosis"]);
    expect([...(readImpression("استسقاء في الكلية اليسرى").stated.get("hydronephrosis") ?? [])]).toEqual(["left"]);
    expect(stated("تمدد الشريان الأبهر البطني ٥ سم")).toEqual(["aaa"]);
    expect(stated("دهون على الكبد درجة ثانية")).toEqual(["fattyLiver"]);
    expect(readImpression("الفحص طبيعي").normal).toBe(true);
  });
});

describe("measurements as typed", () => {
  it("read millimetres, centimetres, Arabic digits and a decimal comma", () => {
    expect(parseMm("105")).toBe(105);
    expect(parseMm("10.5 cm")).toBe(105);
    expect(parseMm("١٠٥ مم")).toBe(105);
    expect(parseMm("12,5")).toBe(12.5);
    expect(parseMm("")).toBeNull();
    expect(parseMm("none")).toBeNull();
  });
});

describe("marking a report", () => {
  it("gives full marks for a right report, and few for a missed finding", () => {
    const { exam, built } = caseOf(2, [{ spec: STONES, facts: { stones: 3, largestMm: 12 } }]);
    const right = gradeReport(exam, built, report({ gallbladder: "stones", gallbladderMm: "11" }));
    expect(right.percent).toBe(100);
    expect(right.passed).toBe(true);
    const missed = gradeReport(exam, built, report({}));
    expect(missed.passed).toBe(false);
    expect(missed.items.find((i) => i.section === "gallbladder")?.verdict).toBe("missed");
  });

  it("takes marks off for a finding that is not there, and asks for a normal study to be called normal", () => {
    const { exam, built } = caseOf(2, []);
    expect(gradeReport(exam, built, report({})).percent).toBe(100);
    const overcalled = gradeReport(exam, built, report({ fluid: 2 }));
    expect(overcalled.items.some((i) => i.verdict === "overcall")).toBe(true);
    expect(overcalled.passed).toBe(false);
  });

  it("marks the wrong side as a miss and a false finding", () => {
    const { exam, built } = caseOf(2, [{ spec: { kind: "hydronephrosis", side: "right", grade: 2 }, facts: { grade: 2, pelvisApMm: 18 } }]);
    const result = gradeReport(exam, built, report({}, { left: { hydro: 2 } }));
    const codes = result.items.map((i) => i.code);
    expect(codes).toContain("kidney.hydro.wrongSide");
    expect(codes).toContain("kidney.hydro.overcall");
  });

  it("at level 1 marks only the organ asked about", () => {
    const { exam, built } = caseOf(1, [{ spec: STONES, facts: { stones: 3, largestMm: 12 } }], "gallbladder");
    const result = gradeReport(exam, built, report({ gallbladder: "stones", fluid: 3, aneurysm: true }));
    expect(result.percent).toBe(100);
    expect(result.items.every((i) => i.section === "gallbladder")).toBe(true);
  });

  it("measures with a tolerance, and notices centimetres typed as millimetres", () => {
    const { exam, built } = caseOf(3, []);
    const kidney = (value: string) =>
      gradeReport(exam, built, report({}, { right: { lengthMm: value } })).items.find((i) => i.section === "kidneyRight");
    expect(kidney("108")?.verdict).toBe("correct");
    expect(kidney("96")?.verdict).toBe("partial");
    expect(kidney("70")?.verdict).toBe("wrong");
    expect(kidney("11.2")?.code).toBe("kidney.length.units");
  });

  it("at level 3 reads the impression: credit for each finding stated, a penalty for each invented", () => {
    const { exam, built } = caseOf(3, [{ spec: STONES, facts: { stones: 3, largestMm: 12 } }]);
    const base = { gallbladder: "stones" as const, gallbladderMm: "12" };
    const good = gradeReport(exam, built, report({ ...base, impression: "Cholelithiasis without cholecystitis." }));
    expect(good.items.find((i) => i.code === "impression.stated")).toBeDefined();
    expect(good.percent).toBe(100);
    const invented = gradeReport(exam, built, report({ ...base, impression: "Gallstones. Right hydronephrosis." }));
    expect(invented.items.find((i) => i.code === "impression.overcall")?.params.diagnosis).toBe("hydronephrosis");
  });

  it("calls the real aneurysm in s0319 an aneurysm", () => {
    const { exam, built } = caseOf(2, []);
    const withAneurysm: CaseMade = { ...built, truth: { ...TRUTH, aortaMm: 37 } };
    expect(truthFacts(withAneurysm).aorta.aneurysm).toBe(true);
    const result = gradeReport(exam, withAneurysm, report({}));
    expect(result.items.find((i) => i.section === "aorta")?.code).toBe("aorta.aneurysm.missed");
  });
});

describe("writing the report", () => {
  it("writes a normal study as normal, in English and Arabic", () => {
    const { built } = caseOf(2, []);
    const en = writeReport(truthFacts(built), "en", { trauma: false });
    expect(en.impression).toEqual(["Normal abdominal ultrasound."]);
    expect(en.findings.map((f) => f.organ)).toContain("Right kidney");
    const ar = writeReport(truthFacts(built), "ar", { trauma: false });
    expect(ar.impression[0]).toContain("طبيعي");
  });

  it("puts what matters most first, with the advice that goes with it", () => {
    const { built } = caseOf(2, [
      { spec: STONES, facts: { stones: 3, largestMm: 12 } },
      { spec: { kind: "aaa", diameterMm: 58, lumenFraction: 0.5 }, facts: { diameterMm: 58 } },
    ]);
    const facts = truthFacts({ ...built, truth: { ...TRUTH, aortaMm: 58 } });
    const en = writeReport(facts, "en", { trauma: false });
    expect(en.impression[0]).toMatch(/aneurysm, 5\.8 cm/);
    expect(en.impression[0]).toMatch(/Urgent/);
    expect(en.impression[1]).toMatch(/Cholelithiasis/);
  });

  it("calls free fluid after trauma a positive FAST, ahead of anything found by the way", () => {
    const { built } = caseOf(2, [{ spec: { kind: "freeFluid", amount: 2 }, facts: { amount: 2 } }]);
    expect(writeReport(truthFacts(built), "en", { trauma: true }).impression[0]).toMatch(/positive FAST/);
    const withAneurysm = truthFacts({ ...built, truth: { ...TRUTH, aortaMm: 37 } });
    const lines = writeReport(withAneurysm, "en", { trauma: true }).impression;
    expect(lines[0]).toMatch(/positive FAST/);
    expect(lines[1]).toMatch(/aneurysm, 3\.7 cm/);
  });
});
