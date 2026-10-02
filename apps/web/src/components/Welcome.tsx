import { useState } from "react";
import { useT } from "../i18n";
import { useSono } from "../state/store";
import { CloseIcon } from "./icons";
import { Button, IconButton } from "./ui";

const KEY = "insonate:welcomed";

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Three steps for a first visit. Not a modal: the scanner works around it, and it is shown once. */
export function Welcome() {
  const [open, setOpen] = useState(() => !seen());
  const setMode = useSono((s) => s.setMode);
  const t = useT();
  if (!open) return null;
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Shown again next time.
    }
  };
  return (
    <section className="card welcome" aria-labelledby="welcome-title">
      <header className="welcome-head">
        <h2 id="welcome-title">{t.welcome.title}</h2>
        <IconButton label={t.welcome.dismiss} onClick={close}>
          <CloseIcon />
        </IconButton>
      </header>
      <ol className="welcome-steps">
        {t.welcome.steps.map((step, i) => (
          <li key={step.title}>
            <span className="welcome-number" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>
              <strong>{step.title}</strong>
              <span className="hint">{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="tool-row">
        <Button variant="primary" onClick={close}>
          {t.welcome.start}
        </Button>
        <Button
          onClick={() => {
            setMode("tasks");
            close();
          }}
        >
          {t.welcome.tasks}
        </Button>
      </div>
    </section>
  );
}
