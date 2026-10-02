import { ABDOMEN_TASKS } from "@insonate/sono-engine";
import { type CSSProperties, useEffect, useState } from "react";
import { useT } from "../i18n";
import { useController } from "../sim/context";
import { useSono } from "../state/store";
import { RulerIcon, TargetIcon } from "./icons";
import { Button } from "./ui";

const PASS = 80;
/** How long the view must be held above the pass mark. */
const HOLD_MS = 700;

export function TaskPanel() {
  const taskId = useSono((s) => s.taskId);
  const setTask = useSono((s) => s.setTask);
  const t = useT();
  if (!taskId) {
    return (
      <div className="tasks">
        <p className="hint">{t.tasks.intro}</p>
        <ol className="task-list">
          {ABDOMEN_TASKS.map((task, i) => (
            <li key={task.id}>
              <button type="button" className="task-item" onClick={() => setTask(task.id)}>
                <span className="task-number">{i + 1}</span>
                <span className="task-text">
                  <span className="task-title">{t.taskCopy[task.id]?.title ?? task.id}</span>
                  <span className="task-goal">{t.taskCopy[task.id]?.goal}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return <ActiveTask taskId={taskId} />;
}

function ActiveTask({ taskId }: { taskId: string }) {
  const controller = useController();
  const coach = useSono((s) => s.coach);
  const setTask = useSono((s) => s.setTask);
  const setProbe = useSono((s) => s.setProbe);
  const setSettings = useSono((s) => s.setSettings);
  const check = useSono((s) => s.check);
  const setCheck = useSono((s) => s.setCheck);
  const measurements = useSono((s) => s.measurements);
  const setFrozen = useSono((s) => s.setFrozen);
  const setMeasuring = useSono((s) => s.setMeasuring);
  const t = useT();
  const target = ABDOMEN_TASKS.find((task) => task.id === taskId);
  const text = t.taskCopy[taskId];
  const [achieved, setAchieved] = useState(false);
  const score = coach?.taskId === taskId ? coach.live : 0;

  // Match the machine to the task when it starts.
  useEffect(() => {
    if (!target) return;
    setProbe(target.probe);
    setSettings({ depthMm: target.depthMm, focusMm: Math.round(target.depthMm * 0.5) });
    setAchieved(false);
  }, [target, setProbe, setSettings]);

  // "Achieved" once the score has stayed above the pass mark for a moment.
  const passing = score >= PASS;
  useEffect(() => {
    if (!passing) return;
    const timer = setTimeout(() => setAchieved(true), HOLD_MS);
    return () => clearTimeout(timer);
  }, [passing]);

  if (!target || !text) return null;
  const organName = t.organs[target.organ];
  const reference = controller.data.json.tasks.find((task) => task.id === taskId);
  const parts = coach?.taskId === taskId ? coach.parts : null;
  const level = score >= PASS ? "is-good" : score >= 50 ? "is-warn" : "is-bad";
  const checks = parts
    ? [
        { ok: parts.centred > 0.7, label: t.tasks.centred(organName), detail: t.tasks.mmOff(Math.round(parts.offsetMm)) },
        {
          ok: parts.aligned > 0.7,
          label: target.view === "long" ? t.tasks.longAxis : t.tasks.across,
          detail: t.tasks.degreesOff(Math.round(parts.angleErrorDeg)),
        },
        { ok: parts.inView > 0.7, label: t.tasks.inView, detail: "" },
        { ok: parts.access > 0.9, label: t.tasks.access, detail: "" },
        { ok: parts.contact > 0.95, label: t.tasks.contact, detail: "" },
      ]
    : [];
  const hint = coach?.taskId === taskId && coach.hint ? t.advice(coach.hint.advice, organName) : null;
  const status = achieved ? t.tasks.achieved : score >= PASS ? t.tasks.almost : score >= 50 ? t.tasks.close : t.tasks.searching;

  const runCheck = async () => {
    const last = measurements.at(-1);
    if (!last || !target.measurement) return;
    const section = await controller.measure(target.organ);
    const organ = controller.data.organs.get(target.organ);
    const measuredMm = Math.hypot(last.a2 - last.a1, last.d2 - last.d1);
    const kind = target.measurement.kind;
    const inPlaneMm = kind === "length" ? section.lengthMm : section.apMm;
    const organMm = kind === "length" ? (organ?.extents[0] ?? inPlaneMm) : inPlaneMm;
    setCheck({ taskId, measuredMm, inPlaneMm, organMm, kind });
  };

  return (
    <div className="task">
      <div className="task-head">
        <button type="button" className="link" onClick={() => setTask(null)}>
          {t.tasks.back}
        </button>
        <h3>{text.title}</h3>
        <p className="task-goal-lg">{text.goal}</p>
      </div>
      <div className={`score ${level}`} aria-live="polite">
        <div className="score-ring" style={{ "--score": `${Math.round(score)}` } as CSSProperties}>
          <span>{Math.round(score)}</span>
        </div>
        <div className="score-text">
          <strong>{status}</strong>
          <span className="hint">{achieved ? t.tasks.wellDone : (hint ?? t.tasks.begin)}</span>
        </div>
      </div>
      <ul className="checklist">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? "ok" : "no"}>
            <span className="tick" aria-hidden="true">
              {c.ok ? "✓" : "•"}
            </span>
            {c.label}
            {!c.ok && c.detail && <span className="muted"> ({c.detail})</span>}
          </li>
        ))}
      </ul>
      <div className="tool-row">
        {reference && (
          <Button
            icon={<TargetIcon />}
            onClick={() => {
              // The view was found with the patient holding this breath: ask for it too.
              useSono.getState().setBreathing(reference.breath === 1 ? "inspire" : "expire");
              controller.animateTo(reference.pose);
            }}
          >
            {t.tasks.showMe}
          </Button>
        )}
      </div>
      <details className="callout" open>
        <summary>{t.tasks.how}</summary>
        <p>{text.how}</p>
        <p className="hint">{text.tip}</p>
      </details>
      {target.measurement && text.measurement && (
        <div className="callout is-measure">
          <strong>{text.measurement.label}</strong>
          <p className="hint">{text.measurement.normal}</p>
          <ol className="steps">
            <li>{t.tasks.freezeStep}</li>
            <li>{t.tasks.dragStep(target.measurement.kind)}</li>
          </ol>
          <div className="tool-row">
            <Button
              icon={<RulerIcon />}
              onClick={() => {
                setFrozen(true);
                setMeasuring(true);
              }}
            >
              {t.tasks.freezeMeasure}
            </Button>
            <Button variant="primary" disabled={measurements.length === 0} onClick={() => void runCheck()}>
              {t.tasks.check}
            </Button>
          </div>
          {check && check.taskId === taskId && <MeasureFeedback />}
        </div>
      )}
    </div>
  );
}

function MeasureFeedback() {
  const check = useSono((s) => s.check);
  const t = useT();
  if (!check) return null;
  const cm = (mm: number) => `${(mm / 10).toFixed(1)} ${t.tasks.cm}`;
  const error = check.inPlaneMm > 0 ? (check.measuredMm - check.inPlaneMm) / check.inPlaneMm : 1;
  const accurate = Math.abs(error) <= 0.08;
  const foreshortened = check.kind === "length" && check.inPlaneMm < check.organMm * 0.9;
  return (
    <div className={`feedback ${accurate ? "is-good" : "is-warn"}`}>
      <p>
        {t.tasks.youMeasured} <strong>{cm(check.measuredMm)}</strong>. {t.tasks.inThisPlane} <strong>{cm(check.inPlaneMm)}</strong> (
        <span dir="ltr">
          {error >= 0 ? "+" : ""}
          {Math.round(error * 100)} %
        </span>
        ).
      </p>
      {check.kind === "length" && (
        <p className="hint">
          {t.tasks.trueLength(cm(check.organMm))} {foreshortened ? t.tasks.foreshortened : t.tasks.fullLength}
        </p>
      )}
    </div>
  );
}
