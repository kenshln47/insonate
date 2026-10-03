import { useEffect, useState } from "react";
import { type CaseData, loadCase } from "./case/loader";
import { CasePanel } from "./components/CasePanel";
import { Dialogs, Header, Loading } from "./components/Chrome";
import { ContextView } from "./components/ContextView";
import { MachinePanel, ScanTools } from "./components/MachinePanel";
import { ProbeCam } from "./components/ProbeCam";
import { ProbePad } from "./components/ProbePad";
import { ReportPanel } from "./components/ReportPanel";
import { Spectrum } from "./components/Spectrum";
import { TaskPanel } from "./components/TaskPanel";
import { UltrasoundView } from "./components/UltrasoundView";
import { Welcome } from "./components/Welcome";
import { MESSAGES, useT } from "./i18n";
import { ControllerContext } from "./sim/context";
import { SonoController } from "./sim/controller";
import { bindKeyboard } from "./sim/keyboard";
import { applyShare, parseShare } from "./sim/share";
import { useSono } from "./state/store";

/** The view Insonate opens on. */
const START_VIEW = "gallbladder-long";

export function App() {
  const theme = useSono((s) => s.theme);
  const language = useSono((s) => s.language);
  const patient = useSono((s) => s.patient);
  const [data, setData] = useState<CaseData | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [controller, setController] = useState<SonoController | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = MESSAGES[language].dir;
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setProgress(0);
    loadCase(patient, setProgress)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [patient]);

  useEffect(() => {
    if (!data) return;
    // Start on the case's own textbook view of the gallbladder (computed when the case was built),
    // with the patient holding the breath that view needs.
    const start = data.json.tasks.find((t) => t.id === START_VIEW);
    if (start) {
      useSono.getState().setPose(start.pose);
      useSono.getState().setBreathing(start.breath === 1 ? "inspire" : "expire");
    }
    const created = new SonoController(data);
    // A shared link puts the app where the sender was (mode, task or case, probe, breath, Doppler).
    if (window.location.hash.length > 1) {
      applyShare(parseShare(window.location.hash), useSono.getState(), (pose) => created.setPose(pose));
      // Applied once: switching patients later starts fresh.
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    setController(created);
    // For debugging and scripted screenshots, next to the store's hook in main.tsx.
    (window as unknown as { __insonateController?: SonoController }).__insonateController = created;
    return () => {
      created.dispose();
      setController(null);
    };
  }, [data]);

  useEffect(() => (controller ? bindKeyboard(controller) : undefined), [controller]);

  // A link pasted into an open tab only changes the hash: apply it then too.
  useEffect(() => {
    if (!controller) return;
    const onHash = () => {
      if (window.location.hash.length <= 1) return;
      applyShare(parseShare(window.location.hash), useSono.getState(), (pose) => controller.setPose(pose));
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [controller]);

  if (!data || !controller) return <Loading progress={progress} error={error} />;
  return (
    <ControllerContext.Provider value={controller}>
      <Workspace source={data.json.source} />
    </ControllerContext.Provider>
  );
}

function Workspace({ source }: { source: CaseData["json"]["source"] }) {
  const mode = useSono((s) => s.mode);
  const probeCam = useSono((s) => s.probeCam);
  const pw = useSono((s) => s.settings.doppler === "pw");
  const variant = useSono((s) => s.variant);
  const quiz = useSono((s) => s.quiz);
  const exam = useSono((s) => s.exam);
  const setVariant = useSono((s) => s.setVariant);
  const endQuiz = useSono((s) => s.endQuiz);
  const setMode = useSono((s) => s.setMode);
  const t = useT();
  return (
    <div className="app">
      <Header />
      <main className="workspace">
        <section className="scanner" aria-label={t.screen.image}>
          <UltrasoundView />
          {pw && <Spectrum />}
          <ProbePad />
          {probeCam && <ProbeCam />}
        </section>
        <aside className="side">
          <Welcome />
          <section className="card context-card" aria-label={t.context.region}>
            <ContextView />
          </section>
          {exam && mode !== "report" && (
            <div className="case-banner" role="status">
              <button type="button" className="link" onClick={() => setMode("report")}>
                {exam.result ? t.report.title : t.report.inProgress}
              </button>
              <button type="button" className="link" onClick={() => setMode("report")}>
                {t.report.back}
              </button>
            </div>
          )}
          {variant !== "normal" && mode !== "cases" && (
            <div className="case-banner" role="status">
              <button type="button" className="link" onClick={() => setMode("cases")}>
                {quiz ? t.cases.unknown : t.cases.items[variant].title}
              </button>
              <button type="button" className="link" onClick={() => (quiz ? endQuiz() : setVariant("normal"))}>
                {quiz ? t.cases.endQuiz : t.cases.back.replace(/[←→]\s*/, "")}
              </button>
            </div>
          )}
          <section className="card panel">
            <header className="panel-head">
              <h2>
                {mode === "tasks" ? t.tasks.title : mode === "cases" ? t.cases.title : mode === "report" ? t.report.title : t.machine.title}
              </h2>
            </header>
            {mode === "tasks" ? <TaskPanel /> : mode === "cases" ? <CasePanel /> : mode === "report" ? <ReportPanel /> : <MachinePanel />}
            <ScanTools />
          </section>
        </aside>
      </main>
      <footer className="footer">
        <span>
          {t.footer.local} ·{" "}
          <a href="https://github.com/kenshln47/insonate" target="_blank" rel="noreferrer">
            {t.footer.source}
          </a>
        </span>
        <span>
          {t.footer.anatomy}: {source.dataset}, {source.license} · {t.footer.notDevice}
        </span>
      </footer>
      <Dialogs source={source} />
    </div>
  );
}
