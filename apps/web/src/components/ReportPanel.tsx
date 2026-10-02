import { type Grade, type Side, TISSUE, type Vec3 } from "@insonate/sono-engine";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { PATIENTS } from "../content/patients";
import { draftFacts, truthFacts } from "../exam/facts";
import { decodeExam, generateExam, newExam } from "../exam/generate";
import { gradeReport } from "../exam/grade";
import { bestByLevel, readAttempts, saveAttempt } from "../exam/history";
import { EXAM_LEVELS, type ExamLevel, type GradeItem, type ReportDraft, SECTIONS, type SectionKey } from "../exam/types";
import { type WrittenReport, writeReport } from "../exam/write";
import { MESSAGES, useT } from "../i18n";
import type { Language } from "../i18n/messages";
import { useController } from "../sim/context";
import { type ExamState, type Measurement, useSono } from "../state/store";
import { here, useCopyLink } from "./Chrome";
import { TargetIcon } from "./icons";
import { Button, Segmented, Select, Toggle } from "./ui";

/**
 * The reporting exam: pick a level (or open a teacher's code), scan the patient on the request
 * form, write the report, hand it in, and see it marked next to the consultant's report.
 */
export function ReportPanel() {
  const exam = useSono((s) => s.exam);
  if (!exam) return <ExamStart />;
  if (exam.result) return <ExamResult exam={exam} />;
  return <ExamForm exam={exam} />;
}

function ExamStart() {
  const startExam = useSono((s) => s.startExam);
  const t = useT().report;
  const [code, setCode] = useState("");
  const [bad, setBad] = useState(false);
  const attempts = useMemo(() => readAttempts(), []);
  const best = bestByLevel(attempts);
  const codeId = useId();
  return (
    <div className="exam">
      <p className="hint">{t.intro}</p>
      <ol className="task-list">
        {EXAM_LEVELS.map((level) => (
          <li key={level}>
            <button type="button" className="task-item" onClick={() => startExam(newExam(level))}>
              <span className="task-number">{level}</span>
              <span className="task-text">
                <span className="task-title">{t.levels[level].name}</span>
                <span className="task-goal">{t.levels[level].text}</span>
              </span>
              {best[level] !== undefined && (
                <span className="exam-best" title={t.best}>
                  {best[level]}%
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
      <form
        className="exam-code"
        onSubmit={(event) => {
          event.preventDefault();
          const decoded = decodeExam(code.trim().toLowerCase());
          setBad(!decoded);
          if (decoded) startExam(generateExam(decoded.patient, decoded.level, decoded.seed));
        }}
      >
        <label className="field-label" htmlFor={codeId}>
          {t.codeLabel}
        </label>
        <div className="tool-row">
          <input
            id={codeId}
            className="input"
            value={code}
            placeholder={t.codePlaceholder}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setCode(event.target.value);
              setBad(false);
            }}
          />
          <Button type="submit">{t.open}</Button>
        </div>
        {bad && <p className="hint is-error">{t.badCode}</p>}
      </form>
      <section className="exam-history">
        <h4>{t.recent}</h4>
        {attempts.length === 0 ? (
          <p className="hint">{t.none}</p>
        ) : (
          <ul>
            {attempts.slice(0, 6).map((a) => (
              <li key={`${a.code}-${a.at}`}>
                <span className={`exam-score${a.passed ? " is-pass" : ""}`}>{a.percent}%</span>
                <span>{t.levels[a.level].name}</span>
                <span className="hint">{new Date(a.at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The request form: who the patient is, who sent them, and why. */
function RequestCard({ exam }: { exam: ExamState }) {
  const t = useT();
  const c = exam.case;
  const patient = PATIENTS.find((p) => p.id === c.patient) ?? PATIENTS[0];
  return (
    <div className="callout request-form">
      <strong>{t.report.request}</strong>
      <dl>
        <dt>{t.header.patient}</dt>
        <dd>
          {t.report.patient(patient.sex, patient.age)} · {t.report.mrn} {c.mrn}
        </dd>
        <dt>{t.report.from}</dt>
        <dd>{t.report.departments[c.department]}</dd>
        <dt>{t.report.examination}</dt>
        <dd>{t.report.examinationName}</dd>
        <dt>{t.report.clinical}</dt>
        <dd>{t.report.reasons[c.reason](patient.sex, patient.age)}</dd>
        {c.focus && (
          <>
            <dt>{t.report.question}</dt>
            <dd>{t.report.focusQuestion(t.report.sections[c.focus])}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function Elapsed({ since }: { since: number }) {
  const t = useT().report;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <span className="exam-timer">
      {t.elapsed} {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

/** The last caliper measurement (mm), for "use caliper". */
function lastCaliper(measurements: readonly Measurement[]): number | null {
  const m = measurements[measurements.length - 1];
  return m ? Math.round(Math.hypot(m.a2 - m.a1, m.d2 - m.d1) * 10) / 10 : null;
}

function MmInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const t = useT().report;
  const caliper = useSono((s) => lastCaliper(s.measurements));
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="mm-input">
        <input
          id={id}
          className="input"
          inputMode="decimal"
          value={value}
          placeholder="—"
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="unit">{t.mm}</span>
        {caliper !== null && caliper > 0 && (
          <button type="button" className="link" onClick={() => onChange(String(caliper))}>
            {t.fromCaliper(caliper)}
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="report-section">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function ExamForm({ exam }: { exam: ExamState }) {
  const words = useT();
  const t = words.report;
  const update = useSono((s) => s.updateReport);
  const updateKidney = useSono((s) => s.updateKidney);
  const submitExam = useSono((s) => s.submitExam);
  const endExam = useSono((s) => s.endExam);
  const language = useSono((s) => s.language);
  const [confirm, setConfirm] = useState<"submit" | "leave" | null>(null);
  const d = exam.draft;
  const level = exam.case.level;
  const shown = (section: SectionKey) => exam.case.focus === null || exam.case.focus === section;
  const o = t.options;
  const grades = <K extends 0 | Grade>(labels: Readonly<Record<K, string>>) =>
    (Object.keys(labels) as unknown as K[]).map((k) => ({ value: Number(k) as K, label: labels[k] }));

  const kidney = (side: Side) => {
    const k = d.kidneys[side];
    const section: SectionKey = side === "right" ? "kidneyRight" : "kidneyLeft";
    if (!shown(section)) return null;
    return (
      <Section key={side} title={t.sections[section]}>
        <MmInput label={t.fields.length} value={k.lengthMm} onChange={(lengthMm) => updateKidney(side, { lengthMm })} />
        <Segmented label={t.fields.hydro} value={k.hydro} options={grades(o.hydro)} onChange={(hydro) => updateKidney(side, { hydro })} />
        <Toggle label={t.fields.stone} checked={k.stone} onChange={(stone) => updateKidney(side, { stone })} />
        {k.stone && <MmInput label={t.fields.stoneSize} value={k.stoneMm} onChange={(stoneMm) => updateKidney(side, { stoneMm })} />}
        <Toggle label={t.fields.cyst} checked={k.cyst} onChange={(cyst) => updateKidney(side, { cyst })} />
        {k.cyst && <MmInput label={t.fields.cystSize} value={k.cystMm} onChange={(cystMm) => updateKidney(side, { cystMm })} />}
      </Section>
    );
  };

  const hand = () => {
    if (!exam.made) return;
    const result = gradeReport(exam.case, exam.made, exam.draft);
    saveAttempt({
      code: exam.case.code,
      level,
      percent: result.percent,
      passed: result.passed,
      at: Date.now(),
      ms: Date.now() - exam.startedAt,
    });
    submitExam(result);
  };

  return (
    <div className="exam">
      <div className="task-head exam-head">
        <span className="exam-level">{t.levels[level].name}</span>
        <Elapsed since={exam.startedAt} />
      </div>
      <RequestCard exam={exam} />
      {!exam.made && <p className="hint">{t.preparing}</p>}
      <p className="hint exam-rules">{t.rules[level]}</p>

      {shown("liver") && (
        <Section title={t.sections.liver}>
          <Select
            label={t.fields.echotexture}
            value={d.liverFatty}
            options={grades(o.fatty)}
            onChange={(liverFatty) => update({ liverFatty })}
          />
          <Select
            label={t.fields.lesion}
            value={d.liverLesion}
            options={(Object.keys(o.lesions) as ReportDraft["liverLesion"][]).map((value) => ({ value, label: o.lesions[value] }))}
            onChange={(liverLesion) => update({ liverLesion })}
          />
          {d.liverLesion !== "none" && (
            <MmInput label={t.fields.lesionSize} value={d.liverLesionMm} onChange={(liverLesionMm) => update({ liverLesionMm })} />
          )}
        </Section>
      )}
      {shown("gallbladder") && (
        <Section title={t.sections.gallbladder}>
          <Select
            label={t.fields.status}
            value={d.gallbladder}
            options={(Object.keys(o.gallbladder) as ReportDraft["gallbladder"][]).map((value) => ({ value, label: o.gallbladder[value] }))}
            onChange={(gallbladder) => update({ gallbladder })}
          />
          {d.gallbladder !== "normal" && (
            <MmInput label={t.fields.largest} value={d.gallbladderMm} onChange={(gallbladderMm) => update({ gallbladderMm })} />
          )}
          {d.gallbladder === "cholecystitis" && (
            <MmInput label={t.fields.wall} value={d.gallbladderWallMm} onChange={(gallbladderWallMm) => update({ gallbladderWallMm })} />
          )}
          <Segmented
            label={t.fields.murphy}
            value={d.murphy ? 1 : 0}
            options={[
              { value: 0, label: o.negative },
              { value: 1, label: o.positive },
            ]}
            onChange={(value) => update({ murphy: value === 1 })}
          />
        </Section>
      )}
      {level > 1 && (
        <Section title={t.sections.pancreas}>
          <Segmented
            label={t.fields.pancreas}
            value={d.pancreas}
            options={(Object.keys(o.pancreas) as ReportDraft["pancreas"][]).map((value) => ({ value, label: o.pancreas[value] }))}
            onChange={(pancreas) => update({ pancreas })}
          />
        </Section>
      )}
      {shown("spleen") && (
        <Section title={t.sections.spleen}>
          <MmInput label={t.fields.length} value={d.spleenMm} onChange={(spleenMm) => update({ spleenMm })} />
          <Toggle label={t.fields.enlarged} checked={d.spleenEnlarged} onChange={(spleenEnlarged) => update({ spleenEnlarged })} />
        </Section>
      )}
      {kidney("right")}
      {kidney("left")}
      {shown("aorta") && (
        <Section title={t.sections.aorta}>
          <MmInput label={t.fields.diameter} value={d.aortaMm} onChange={(aortaMm) => update({ aortaMm })} />
          <Toggle label={t.fields.aneurysm} checked={d.aneurysm} onChange={(aneurysm) => update({ aneurysm })} />
        </Section>
      )}
      {shown("fluid") && (
        <Section title={t.sections.fluid}>
          <Segmented label={t.fields.amount} value={d.fluid} options={grades(o.fluid)} onChange={(fluid) => update({ fluid })} />
        </Section>
      )}
      {shown("pleura") && (
        <Section title={t.sections.pleura}>
          <Toggle
            label={`${t.fields.effusion} · ${o.right}`}
            checked={d.effusion.right}
            onChange={(right) => update({ effusion: { ...d.effusion, right } })}
          />
          <Toggle
            label={`${t.fields.effusion} · ${o.left}`}
            checked={d.effusion.left}
            onChange={(left) => update({ effusion: { ...d.effusion, left } })}
          />
        </Section>
      )}
      <ImpressionField level={level} value={d.impression} onChange={(impression) => update({ impression })} />

      <details className="callout report-preview">
        <summary>{t.preview}</summary>
        <ReportText report={studentReport(exam, language)} words={MESSAGES[language].report} />
      </details>

      {confirm === null ? (
        <div className="tool-row">
          <Button variant="primary" disabled={!exam.made} onClick={() => setConfirm("submit")}>
            {t.submit}
          </Button>
          <Button variant="ghost" onClick={() => setConfirm("leave")}>
            {t.abandon}
          </Button>
        </div>
      ) : (
        <div className="feedback is-warn" role="alertdialog" aria-label={confirm === "submit" ? t.confirmSubmit : t.confirmAbandon}>
          <p>{confirm === "submit" ? t.confirmSubmit : t.confirmAbandon}</p>
          <div className="tool-row">
            <Button
              variant={confirm === "submit" ? "primary" : "danger"}
              onClick={() => {
                if (confirm === "submit") hand();
                else endExam();
                setConfirm(null);
              }}
            >
              {o.yes}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {o.no}
            </Button>
          </div>
        </div>
      )}
      <MurphyWatch exam={exam} />
    </div>
  );
}

function ImpressionField({ level, value, onChange }: { level: ExamLevel; value: string; onChange: (value: string) => void }) {
  const t = useT().report;
  const id = useId();
  return (
    <div className="field report-impression">
      <label className="field-label" htmlFor={id}>
        {t.impression}
      </label>
      <textarea
        id={id}
        className="input"
        rows={4}
        value={value}
        placeholder={t.impressionPlaceholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="hint">{t.impressionHint[level]}</p>
    </div>
  );
}

/**
 * Murphy's sign: in acute cholecystitis the patient winces when the probe presses right over the
 * gallbladder. Shown over the image, at most every few seconds.
 */
function MurphyWatch({ exam }: { exam: ExamState }) {
  const controller = useController();
  const inflamed = exam.made?.findings.some((f) => f.applied && f.spec.kind === "cholecystitis") ?? false;
  useEffect(() => {
    if (!inflamed) return;
    let last = Number.NEGATIVE_INFINITY;
    return controller.onFrame((info) => {
      const gb = info.organs.gallbladder;
      // Only when the probe presses right over the gallbladder, as in the real sign.
      const state = useSono.getState();
      if (!gb || gb.areaMm2 < 150 || gb.d > 100 || Math.abs(gb.a) > 30 || state.frozen || state.settings.pressure < 0.3) return;
      const now = performance.now();
      if (now - last < 9000) return;
      last = now;
      useSono.getState().setReaction({ kind: "murphy", at: Date.now() });
    });
  }, [controller, inflamed]);
  return null;
}

/** The student's report as text: their findings, and their impression (or one written from the findings). */
function studentReport(exam: ExamState, language: Language): WrittenReport {
  const facts = draftFacts(exam.draft);
  const written = writeReport(facts, language, { trauma: exam.case.reason === "trauma" });
  const own = exam.draft.impression
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const focus = exam.case.focus;
  const findings = focus ? written.findings.filter((f) => f.section === focus) : written.findings;
  return { findings, impression: own.length > 0 ? own : written.impression };
}

function ReportText({ report, words }: { report: WrittenReport; words: (typeof MESSAGES)["en"]["report"] }) {
  return (
    <div className="report-text">
      <p className="report-heading">{words.findings}</p>
      <dl>
        {report.findings.map((f) => (
          <div key={f.organ}>
            <dt>{f.organ}</dt>
            <dd>{f.text}</dd>
          </div>
        ))}
      </dl>
      <p className="report-heading">{words.impressionHeading}</p>
      <ol>
        {report.impression.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
    </div>
  );
}

const VERDICT_MARK: Readonly<Record<GradeItem["verdict"], string>> = {
  correct: "✓",
  partial: "◐",
  wrong: "✗",
  missed: "✗",
  overcall: "✗",
  info: "ℹ",
};

function ExamResult({ exam }: { exam: ExamState }) {
  const words = useT();
  const t = words.report;
  const language = useSono((s) => s.language);
  const startExam = useSono((s) => s.startExam);
  const endExam = useSono((s) => s.endExam);
  const [reportLanguage, setReportLanguage] = useState<Language>(language);
  // The report follows the interface language when that changes (and can be switched on its own).
  useEffect(() => setReportLanguage(language), [language]);
  const copy = useCopyLink();
  const result = exam.result;
  const made = exam.made;
  if (!result || !made) return null;
  const truth = truthFacts(made);
  const model = writeReport(truth, reportLanguage, { trauma: exam.case.reason === "trauma" });
  const mine = studentReport(exam, reportLanguage);
  const seconds = Math.round(((exam.submittedAt ?? Date.now()) - exam.startedAt) / 1000);
  const order: Array<GradeItem["section"]> = [...SECTIONS, "study", "impression"];
  const items = [...result.items].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
  const nativeKept =
    PATIENTS.find((p) => p.id === exam.case.patient)?.nativeAneurysm &&
    !exam.case.specs.some((s) => s.kind === "aortaCalibre" || s.kind === "aaa");
  return (
    <div className="exam">
      <div className={`exam-result ${result.passed ? "is-pass" : "is-fail"}`}>
        <span className="exam-percent">{result.percent}%</span>
        <span className="exam-result-text">
          <strong>{result.passed ? t.passed : t.failed}</strong>
          <span className="hint">
            {t.levels[exam.case.level].name} · {t.took(Math.floor(seconds / 60), seconds % 60)} ·{" "}
            {t.points(Math.max(0, result.earned), result.max)}
          </span>
        </span>
      </div>
      <RequestCard exam={exam} />
      <section>
        <h4>{t.marking}</h4>
        <ul className="marking">
          {items.map((item) => (
            <li key={`${item.section}-${item.code}-${JSON.stringify(item.params)}`} className={`is-${item.verdict}`}>
              <span className="mark" aria-hidden="true">
                {VERDICT_MARK[item.verdict]}
              </span>
              <span className="mark-text">
                {item.section !== "study" && item.section !== "impression" && <strong>{t.sections[item.section]}: </strong>}
                {item.section === "impression" && <strong>{t.impression}: </strong>}
                {t.feedback(item)}
              </span>
              {(item.max > 0 || item.earned !== 0) && (
                <span className="mark-points">{item.earned > 0 ? `+${item.earned}` : item.earned}</span>
              )}
            </li>
          ))}
        </ul>
        {nativeKept && <p className="hint">{t.nativeAneurysm}</p>}
      </section>
      <ShowMe exam={exam} />
      <Segmented
        label={t.reportLanguage}
        value={reportLanguage}
        options={[
          { value: "en", label: "English" },
          { value: "ar", label: "العربية" },
        ]}
        onChange={setReportLanguage}
      />
      <details className="callout" open>
        <summary>{t.modelReport}</summary>
        <div lang={reportLanguage} dir={reportLanguage === "ar" ? "rtl" : "ltr"}>
          <ReportText report={model} words={MESSAGES[reportLanguage].report} />
        </div>
      </details>
      <details className="callout">
        <summary>{t.yourReport}</summary>
        <div lang={reportLanguage} dir={reportLanguage === "ar" ? "rtl" : "ltr"}>
          <ReportText report={mine} words={MESSAGES[reportLanguage].report} />
        </div>
      </details>
      <div className="tool-row">
        <Button variant="primary" onClick={() => startExam(newExam(exam.case.level))}>
          {t.next}
        </Button>
        <Button variant="ghost" onClick={endExam}>
          {t.levels3}
        </Button>
      </div>
      <div className="tool-row">
        <button type="button" className="link" onClick={() => copy.copy(`${here()}#exam=${exam.case.code}`)}>
          {t.copyCode} ({exam.case.code})
        </button>
        <button type="button" className="link" onClick={() => copy.copy(plainText(model, MESSAGES[reportLanguage].report))}>
          {t.copyReport}
        </button>
        {copy.status && <span className="hint">{copy.status}</span>}
      </div>
    </div>
  );
}

/** The report as plain text, to paste into notes or a logbook. */
function plainText(report: WrittenReport, words: (typeof MESSAGES)["en"]["report"]): string {
  return [
    words.examinationName.toUpperCase(),
    "",
    `${words.findings}:`,
    ...report.findings.map((f) => `${f.organ}: ${f.text}`),
    "",
    `${words.impressionHeading}:`,
    ...report.impression.map((line, i) => `${i + 1}. ${line}`),
  ].join("\n");
}

/** "Show me" for each finding the patient has: the probe goes to a view of it. */
function ShowMe({ exam }: { exam: ExamState }) {
  const controller = useController();
  const t = useT().report;
  const words = useT();
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const made = exam.made;
  if (!made) return null;
  const targets: Array<{ label: string; point: Vec3 | null; task?: string; depthMm: number; through?: readonly number[] }> = [];
  for (const f of made.findings) {
    if (!f.applied || f.spec.kind === "aortaCalibre") continue;
    const kind = f.spec.kind;
    const name = words.cases.findings[findingName(kind)] ?? kind;
    const side = "side" in f.spec ? ` (${f.spec.side === "right" ? t.options.right : t.options.left})` : "";
    targets.push({
      label: `${name}${side}`,
      point: f.focus,
      // A fatty liver is judged against the right kidney.
      task: kind === "fattyLiver" ? "kidney-right-long" : undefined,
      depthMm: kind === "aaa" || kind === "freeFluid" || kind === "splenomegaly" || kind === "pleuralEffusion" ? 180 : 160,
      // A pleural effusion is seen from the flank through the liver (right) or spleen (left).
      through:
        f.spec.kind === "pleuralEffusion"
          ? f.spec.side === "right"
            ? [TISSUE.liver, TISSUE.liverVessel, TISSUE.liverSpared]
            : [TISSUE.spleen]
          : undefined,
    });
  }
  if (made.truth.aortaMm >= 30 && !made.findings.some((f) => f.applied && f.spec.kind === "aaa")) {
    targets.push({ label: words.cases.findings.aneurysm, point: made.truth.aortaFocus, depthMm: 180 });
  }
  if (targets.length === 0) return null;
  const go = async (index: number) => {
    const target = targets[index];
    const state = useSono.getState();
    setFailed(null);
    state.setFrozen(false);
    if (target.task) {
      const reference = controller.data.json.tasks.find((task) => task.id === target.task);
      if (!reference) return;
      state.setBreathing(reference.breath === 1 ? "inspire" : "expire");
      state.setSettings({ depthMm: target.depthMm, focusMm: Math.round(target.depthMm * 0.5) });
      controller.animateTo(reference.pose);
      return;
    }
    if (!target.point) return;
    setBusy(index);
    const aim = await controller.aimAt(target.point, target.depthMm, target.through);
    setBusy(null);
    if (!aim) {
      setFailed(index);
      return;
    }
    state.setBreathing(aim.breath === 1 ? "inspire" : "expire");
    state.setSettings({ depthMm: target.depthMm, focusMm: Math.round(target.depthMm * 0.5) });
    controller.animateTo(aim.pose);
  };
  return (
    <div className="tool-row show-me">
      {targets.map((target, i) => (
        <Button
          key={`${target.label}-${target.point?.join(",") ?? target.task}`}
          icon={<TargetIcon />}
          disabled={busy !== null}
          onClick={() => void go(i)}
        >
          {busy === i ? t.aiming : failed === i ? t.noView : `${t.showMe}: ${target.label}`}
        </Button>
      ))}
    </div>
  );
}

/** The 3D view's name for a finding of this kind. */
function findingName(kind: string): string {
  switch (kind) {
    case "gallstones":
      return "stones";
    case "gbPolyp":
      return "polyp";
    case "cholecystitis":
      return "wall";
    case "liverCyst":
      return "cyst";
    case "hydronephrosis":
      return "pelvis";
    case "aaa":
      return "aneurysm";
    case "freeFluid":
      return "fluid";
    case "splenomegaly":
      return "spleen";
    case "pleuralEffusion":
      return "effusion";
    case "fattyLiver":
      return "fattyLiver";
    default:
      return kind;
  }
}
