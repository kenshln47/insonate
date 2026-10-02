import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useSono } from "../state/store";

/** How long the patient's reaction stays on the screen (ms). */
const SHOWN_MS = 4000;

/**
 * What the patient just did, over the image for a moment: in acute cholecystitis they wince when
 * the probe presses over the gallbladder (sonographic Murphy's sign), as a real patient would.
 */
export function PatientReaction() {
  const reaction = useSono((s) => s.reaction);
  const t = useT();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!reaction) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), Math.max(0, reaction.at + SHOWN_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [reaction]);
  if (!reaction || !visible) return null;
  return (
    <output className="patient-reaction" aria-live="polite" dir="auto">
      {t.report.reaction}
    </output>
  );
}
