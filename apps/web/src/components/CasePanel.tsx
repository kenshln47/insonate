import { VARIANTS, type Variant } from "@insonate/sono-engine";
import { useState } from "react";
import { CASE_ORDER, FINDING_VIEWS, pickMystery } from "../content/cases";
import { PATIENTS } from "../content/patients";
import { useT } from "../i18n";
import { useController } from "../sim/context";
import { mysteryLink } from "../sim/share";
import { useSono } from "../state/store";
import { here, useCopyLink } from "./Chrome";
import { TargetIcon } from "./icons";
import { Button } from "./ui";

/** Teaching cases: pick an abnormality to study, or a mystery patient to diagnose. */
export function CasePanel() {
  const variant = useSono((s) => s.variant);
  const quiz = useSono((s) => s.quiz);
  const setVariant = useSono((s) => s.setVariant);
  const startQuiz = useSono((s) => s.startQuiz);
  const t = useT();
  if (quiz) return <MysteryCase />;
  if (variant !== "normal") return <CaseCard variant={variant} />;
  return (
    <div className="cases">
      <p className="hint">{t.cases.intro}</p>
      <ol className="task-list">
        {CASE_ORDER.map((id, i) => (
          <li key={id}>
            <button type="button" className="task-item" onClick={() => setVariant(id)}>
              <span className="task-number">{i + 1}</span>
              <span className="task-text">
                <span className="task-title">{t.cases.items[id].title}</span>
                <span className="task-goal">{t.cases.items[id].history}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="task-item mystery-item" onClick={() => startQuiz(pickMystery(null))}>
        <span className="task-number">?</span>
        <span className="task-text">
          <span className="task-title">{t.cases.mystery}</span>
          <span className="task-goal">{t.cases.mysteryText}</span>
        </span>
      </button>
    </div>
  );
}

/** Move the probe to a view of the case's finding, in the right breath and depth. */
function useShowFinding(variant: Variant): () => void {
  const controller = useController();
  return () => {
    const view = FINDING_VIEWS[variant];
    const reference = controller.data.json.tasks.find((task) => task.id === view.task);
    if (!reference) return;
    const state = useSono.getState();
    state.setBreathing(reference.breath === 1 ? "inspire" : "expire");
    state.setSettings({ depthMm: view.depthMm, focusMm: Math.round(view.depthMm * 0.5) });
    controller.animateTo({ ...reference.pose, ...view.patch });
  };
}

function CaseCard({ variant }: { variant: Variant }) {
  const info = useSono((s) => s.caseInfo);
  const setVariant = useSono((s) => s.setVariant);
  const t = useT();
  const copy = t.cases.items[variant];
  const showFinding = useShowFinding(variant);
  const ready = info?.variant === variant;
  const facts = ready ? t.cases.facts(variant, info.facts) : null;
  const share = useCopyLink();
  return (
    <div className="task case">
      <div className="task-head">
        <button type="button" className="link" onClick={() => setVariant("normal")}>
          {t.cases.back}
        </button>
        <h3>{copy.title}</h3>
      </div>
      <div className="callout">
        <strong>{t.cases.history}</strong>
        <p>{copy.history}</p>
      </div>
      <div className="tool-row">
        <Button icon={<TargetIcon />} disabled={!ready} onClick={showFinding}>
          {ready ? t.cases.showFinding : t.cases.preparing}
        </Button>
      </div>
      <details className="callout" open>
        <summary>{t.cases.look}</summary>
        <p>{copy.signs}</p>
        {facts && <p className="hint case-facts">{facts}</p>}
      </details>
      <details className="callout">
        <summary>{t.cases.teaching}</summary>
        <p>{copy.teaching}</p>
      </details>
      <div className="tool-row">
        <button type="button" className="link" onClick={() => share.copy(mysteryLink(variant, here()))}>
          {t.cases.shareMystery}
        </button>
        {share.status && <span className="hint">{share.status}</span>}
      </div>
    </div>
  );
}

/** A hidden case: scan, choose a diagnosis, then see the answer and its explanation. */
function MysteryCase() {
  const quiz = useSono((s) => s.quiz);
  const info = useSono((s) => s.caseInfo);
  const answerQuiz = useSono((s) => s.answerQuiz);
  const startQuiz = useSono((s) => s.startQuiz);
  const endQuiz = useSono((s) => s.endQuiz);
  const [choice, setChoice] = useState<Variant | null>(null);
  const patientId = useSono((s) => s.patient);
  const t = useT();
  const showFinding = useShowFinding(quiz?.secret ?? "normal");
  const patient = PATIENTS.find((p) => p.id === patientId);
  if (!quiz) return null;
  const answered = quiz.answer !== null;
  // s0319's own aorta is aneurysmal (3.7 cm): "AAA" is a fair answer for him as scanned.
  const native = Boolean(patient?.nativeAneurysm) && (quiz.secret === "normal" || quiz.secret === "aaa");
  const right = quiz.answer === quiz.secret || (native && quiz.secret === "normal" && quiz.answer === "aaa");
  const secret = t.cases.items[quiz.secret];
  const facts = answered && info?.variant === quiz.secret ? t.cases.facts(quiz.secret, info.facts) : null;
  return (
    <div className="task case">
      <div className="task-head">
        <button type="button" className="link" onClick={endQuiz}>
          {t.cases.endQuiz}
        </button>
        <h3>{answered ? secret.title : t.cases.unknown}</h3>
      </div>
      <div className="callout">
        <strong>{t.cases.history}</strong>
        <p>{secret.history}</p>
      </div>
      <fieldset className="quiz" disabled={answered}>
        <legend>{t.cases.question}</legend>
        {VARIANTS.map((v) => (
          <label key={v} className={`quiz-option${answered && v === quiz.secret ? " is-answer" : ""}`}>
            <input type="radio" name="diagnosis" checked={choice === v} onChange={() => setChoice(v)} />
            <span>{t.cases.items[v].title}</span>
          </label>
        ))}
      </fieldset>
      {!answered ? (
        <div className="tool-row">
          <Button variant="primary" disabled={choice === null} onClick={() => choice && answerQuiz(choice)}>
            {t.cases.check}
          </Button>
        </div>
      ) : (
        <>
          <div className={`feedback ${right ? "is-good" : "is-warn"}`}>
            <p>
              <strong>{right ? t.cases.correct : t.cases.wrong(secret.title)}</strong> {secret.signs}
            </p>
            {facts && <p className="hint">{facts}</p>}
            <p className="hint">{secret.teaching}</p>
            {native && <p className="hint">{t.cases.nativeNote}</p>}
          </div>
          <div className="tool-row">
            {quiz.secret !== "normal" && (
              <Button icon={<TargetIcon />} onClick={showFinding}>
                {t.cases.showFinding}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => {
                setChoice(null);
                startQuiz(pickMystery(quiz.secret));
              }}
            >
              {t.cases.next}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
