import { useState } from "react";
import { PATIENTS } from "../content/patients";
import { useT } from "../i18n";
import { shareLink } from "../sim/share";
import { useSono } from "../state/store";
import { CloseIcon, InfoIcon, KeyboardIcon, LinkIcon, LogoMark, MoonIcon, SunIcon } from "./icons";
import { MarkerSheet } from "./ProbeCam";
import { IconButton, Kbd } from "./ui";

export function Header() {
  const mode = useSono((s) => s.mode);
  const setMode = useSono((s) => s.setMode);
  const theme = useSono((s) => s.theme);
  const setTheme = useSono((s) => s.setTheme);
  const language = useSono((s) => s.language);
  const setLanguage = useSono((s) => s.setLanguage);
  const setDialog = useSono((s) => s.setDialog);
  const t = useT();
  const copy = useCopyLink();
  return (
    <header className="topbar">
      <div className="brand">
        <LogoMark size={30} />
        <div className="brand-text">
          <span className="brand-name">Insonate</span>
          <span className="brand-tag">{t.header.tagline}</span>
        </div>
      </div>
      <div className="mode-tabs" role="tablist" aria-label={t.header.mode}>
        <button type="button" role="tab" aria-selected={mode === "free"} onClick={() => setMode("free")}>
          {t.header.freeScan}
        </button>
        <button type="button" role="tab" aria-selected={mode === "tasks"} onClick={() => setMode("tasks")}>
          {t.header.guidedTasks}
        </button>
        <button type="button" role="tab" aria-selected={mode === "cases"} onClick={() => setMode("cases")}>
          {t.header.cases}
        </button>
        <button type="button" role="tab" aria-selected={mode === "report"} onClick={() => setMode("report")}>
          {t.header.report}
        </button>
      </div>
      <div className="topbar-actions">
        <PatientPicker />
        {copy.status && (
          <span className="copied" role="status">
            {copy.status}
          </span>
        )}
        <IconButton label={t.header.share} onClick={() => copy.copy(shareLink(useSono.getState(), here()))}>
          <LinkIcon />
        </IconButton>
        <button
          type="button"
          className="language-toggle"
          lang={language === "ar" ? "en" : "ar"}
          onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
        >
          {t.header.switchLanguage}
        </button>
        <IconButton label={t.header.about} onClick={() => setDialog("about")}>
          <InfoIcon />
        </IconButton>
        <IconButton label={t.header.shortcuts} className="only-keyboard" onClick={() => setDialog("shortcuts")}>
          <KeyboardIcon />
        </IconButton>
        <IconButton
          label={theme === "dark" ? t.header.lightTheme : t.header.darkTheme}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </IconButton>
      </div>
    </header>
  );
}

export function Loading({ progress, error }: { progress: number; error: string | null }) {
  const t = useT();
  return (
    <div className="loading">
      <LogoMark size={64} />
      <h1>Insonate</h1>
      <p>{error ? t.loading.failed : t.loading.preparing}</p>
      {error ? (
        <p className="error-text">{error}</p>
      ) : (
        <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

export function Dialogs({ source }: { source: { dataset: string; url: string; license: string; caseId: string } }) {
  const dialog = useSono((s) => s.dialog);
  const setDialog = useSono((s) => s.setDialog);
  const t = useT();
  if (!dialog) return null;
  const close = () => setDialog(null);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clicking the backdrop is a mouse shortcut; keyboard users have Escape and Close.
    <div className="modal-backdrop" onClick={close} onKeyDown={(e) => e.key === "Escape" && close()} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Keep scanning shortcuts out of the dialog, but let Escape close it.
          e.stopPropagation();
          if (e.key === "Escape") close();
        }}
      >
        <header className="modal-head">
          <h2 id="dialog-title">{t.dialogs[dialog]}</h2>
          <IconButton label={t.dialogs.close} onClick={close} autoFocus>
            <CloseIcon />
          </IconButton>
        </header>
        <div className="modal-body">
          {dialog === "about" ? <About source={source} /> : dialog === "marker" ? <MarkerSheet /> : <Shortcuts />}
        </div>
      </div>
    </div>
  );
}

function About({ source }: { source: { dataset: string; url: string; license: string; caseId: string } }) {
  const t = useT();
  return (
    <>
      <p>{t.about.intro}</p>
      <h3>{t.about.howTitle}</h3>
      <ul>
        {t.about.how.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <h3>{t.about.limitsTitle}</h3>
      <p>{t.about.limits}</p>
      <h3>{t.about.dataTitle}</h3>
      <p>
        {t.about.dataBefore(source.caseId)}{" "}
        <a href={source.url} target="_blank" rel="noreferrer">
          {source.dataset}
        </a>{" "}
        {t.about.dataAfter(source.license)}
      </p>
      <p className="hint">{t.about.notDevice}</p>
    </>
  );
}

function Shortcuts() {
  const t = useT();
  return (
    <table className="shortcuts">
      <tbody>
        {t.shortcuts.map(([keys, action]) => (
          <tr key={keys}>
            <td>
              <Kbd>{keys}</Kbd>
            </td>
            <td>{action}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** This page's address without its hash: the base of a shared link. */
export function here(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/** Copy a link to the clipboard, with a short confirmation (or the link itself, if copying is blocked). */
export function useCopyLink(): { status: string | null; copy: (link: string) => void } {
  const t = useT();
  const [status, setStatus] = useState<string | null>(null);
  const copy = (link: string) => {
    const done = (text: string, ms: number) => {
      setStatus(text);
      setTimeout(() => setStatus(null), ms);
    };
    navigator.clipboard?.writeText(link).then(
      () => done(t.header.copied, 1800),
      () => done(`${t.header.copyFailed} ${link}`, 12000),
    ) ?? done(`${t.header.copyFailed} ${link}`, 12000);
  };
  return { status, copy };
}

/** Choose the patient: a different body, organ sizes and positions, built from another CT. */
function PatientPicker() {
  const patient = useSono((s) => s.patient);
  const setPatient = useSono((s) => s.setPatient);
  const t = useT();
  return (
    <label className="patient-picker" title={t.header.patientTitle}>
      <span className="field-label">{t.header.patient}</span>
      <select className="select" value={patient} onChange={(event) => setPatient(event.target.value)}>
        {PATIENTS.map((p) => (
          <option key={p.id} value={p.id}>
            {t.header.patientName(p.sex, p.age)}
          </option>
        ))}
      </select>
    </label>
  );
}
