import { useSono } from "../state/store";
import type { SonoController } from "./controller";
import type { Move } from "./pose";

/**
 * Probe moves by physical key (KeyboardEvent.code), so W A S D work whatever the keyboard
 * layout: with an Arabic layout W types "ص", but it is still the key in the W position.
 * A moves toward the patient's right, which is screen left in the front view, as on the body marker.
 */
export const KEY_MOVES: Readonly<Record<string, Move>> = {
  KeyW: "head",
  ArrowUp: "head",
  KeyS: "feet",
  ArrowDown: "feet",
  KeyA: "around-right",
  ArrowLeft: "around-right",
  KeyD: "around-left",
  ArrowRight: "around-left",
  KeyQ: "rotate-ccw",
  KeyE: "rotate-cw",
  KeyR: "fan-up",
  KeyF: "fan-down",
  KeyZ: "rock-marker",
  KeyC: "rock-away",
};

/** The key that presses the probe in while held (graded compression). */
export const PRESS_KEY = "KeyX";

/** The key a move is on, for hints on the pad buttons. */
export const MOVE_KEYS: Readonly<Record<Move, string>> = {
  head: "W",
  feet: "S",
  "around-right": "A",
  "around-left": "D",
  "rotate-ccw": "Q",
  "rotate-cw": "E",
  "fan-up": "R",
  "fan-down": "F",
  "rock-marker": "Z",
  "rock-away": "C",
};

function typingInto(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest("input, select, textarea, [contenteditable='true']") !== null;
}

/** Keyboard control of the probe and the scanner. Returns a function that unbinds it. */
export function bindKeyboard(controller: SonoController): () => void {
  const drive = controller.drive;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Shift") drive.setFine(true);
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (typingInto(event.target)) return;
    // Frozen, ← and → step through the recorded frames (cine review) instead of moving the probe.
    const frozen = useSono.getState();
    if (frozen.frozen && (event.code === "ArrowLeft" || event.code === "ArrowRight")) {
      event.preventDefault();
      const count = controller.cineFrames.length;
      if (count === 0) return;
      const current = frozen.cineIndex ?? count - 1;
      frozen.setCineIndex(Math.max(0, Math.min(count - 1, current + (event.code === "ArrowRight" ? 1 : -1))));
      return;
    }
    const move = KEY_MOVES[event.code];
    if (move) {
      event.preventDefault();
      drive.press(`key:${event.code}`, move, event.shiftKey);
      return;
    }
    // Hold X to press the probe in (graded compression): it pushes bowel gas aside.
    if (event.code === PRESS_KEY) {
      event.preventDefault();
      drive.pressIn(`key:${event.code}`);
      return;
    }
    if (event.repeat) return;
    const state = useSono.getState();
    const target = event.target as HTMLElement | null;
    switch (event.code) {
      case "Space":
        // A focused button takes Space for itself.
        if (target?.closest("button, a, summary")) return;
        event.preventDefault();
        state.setFrozen(!state.frozen);
        return;
      case "KeyM":
        state.setMeasuring(!state.measuring);
        return;
      case "KeyL":
        state.setLabels(!state.labels);
        return;
      case "KeyN":
        state.setAnatomy(!state.anatomy);
        return;
      case "KeyT":
        state.setCt(!state.ct);
        return;
      case "KeyV":
        state.setSettings({ doppler: state.settings.doppler === "color" ? "off" : "color" });
        return;
      case "KeyP":
        state.setSettings({ doppler: state.settings.doppler === "pw" ? "off" : "pw" });
        return;
      case "KeyB":
        state.setBreathing(state.breathing === "normal" ? "inspire" : state.breathing === "inspire" ? "expire" : "normal");
        return;
      case "BracketLeft":
        state.setSettings({ depthMm: Math.max(40, state.settings.depthMm - 10) });
        return;
      case "BracketRight":
        state.setSettings({ depthMm: Math.min(240, state.settings.depthMm + 10) });
        return;
      case "Minus":
      case "NumpadSubtract":
        state.setSettings({ gainDb: Math.max(-20, state.settings.gainDb - 2) });
        return;
      case "Equal":
      case "NumpadAdd":
        state.setSettings({ gainDb: Math.min(20, state.settings.gainDb + 2) });
        return;
      case "Escape":
        state.setDialog(null);
        state.setMeasuring(false);
        return;
    }
    // "?" is Shift + Slash on most layouts ("؟" on Arabic ones).
    if (event.key === "?" || event.key === "؟" || (event.code === "Slash" && event.shiftKey)) state.setDialog("shortcuts");
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Shift") drive.setFine(false);
    drive.release(`key:${event.code}`);
    if (event.code === PRESS_KEY) drive.pressOut(`key:${event.code}`);
  };
  // Keys released while the window is in the background never send keyup: stop on blur.
  const stop = () => drive.releaseAll();
  const onVisibility = () => {
    if (document.hidden) stop();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", stop);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", stop);
    document.removeEventListener("visibilitychange", onVisibility);
    stop();
  };
}
