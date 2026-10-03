import type { ProbePose, SkinSurface } from "@insonate/sono-engine";
import { useSono } from "../state/store";
import { type Move, type MoveAxis, moveAxis, shiftPose } from "./pose";

/**
 * How held controls move the probe. A tap nudges by one small step, for precise positioning;
 * holding glides smoothly, easing in, so a long sweep is one continuous movement.
 * Slides are in mm (per second), the rest in degrees.
 */
const RATES: Readonly<Record<MoveAxis, { readonly nudge: number; readonly speed: number }>> = {
  slide: { nudge: 1.5, speed: 40 },
  rotate: { nudge: 1.5, speed: 45 },
  fan: { nudge: 1, speed: 24 },
  rock: { nudge: 1, speed: 24 },
};
/** Fine control (Shift): a quarter of the speed and a third of the nudge. */
const FINE_SPEED = 0.25;
const FINE_NUDGE = 1 / 3;
/** A press shorter than this is a tap: one nudge and no glide. */
const HOLD_DELAY_S = 0.16;
/** The glide reaches full speed this long after it starts. */
const RAMP_S = 0.45;
/** Held longer than this, a glide speeds up, to about double after a few seconds (crossing the abdomen). */
const BOOST_AFTER_S = 1.2;
const BOOST_S = 1.6;
/** Pressing reaches full pressure in this time; letting go releases it faster (seconds). */
const PRESS_S = 0.55;
const RELEASE_S = 0.25;
/** The longest frame a glide counts in full (seconds); a longer stall moves the probe no further than this. */
const MAX_STEP_S = 0.1;
/** Pressure follows the hand in real time however slow the frames, up to a stall of this long (seconds). */
const MAX_PRESS_STEP_S = 0.5;

interface Held {
  readonly move: Move;
  readonly since: number;
  fine: boolean;
}

/**
 * Moves the probe while keys or pad buttons are held. Several can be held at once
 * (slide toward the head while rotating, say); each source is released on its own.
 */
export class ProbeDriver {
  private readonly held = new Map<string, Held>();
  /** Sources pressing the probe in (graded compression): a key, a pad button. */
  private readonly pressing = new Set<string>();
  private raf = 0;
  private last = 0;
  private readonly skin: SkinSurface;
  private readonly apply: (pose: ProbePose) => void;

  constructor(skin: SkinSurface, apply: (pose: ProbePose) => void) {
    this.skin = skin;
    this.apply = apply;
  }

  /** Start a move from `source` (a key code, a pad button). Repeats from the same source are ignored. */
  press(source: string, move: Move, fine: boolean): void {
    const existing = this.held.get(source);
    if (existing) {
      existing.fine = fine;
      return;
    }
    this.held.set(source, { move, since: performance.now(), fine });
    const state = useSono.getState();
    if (!state.frozen) {
      const rate = RATES[moveAxis(move)];
      this.apply(shiftPose(state.pose, move, rate.nudge * (fine ? FINE_NUDGE : 1), this.skin));
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  release(source: string): void {
    this.held.delete(source);
  }

  /** Start pressing the probe in (graded compression) from `source`; the pressure builds up while held. */
  pressIn(source: string): void {
    this.pressing.add(source);
    this.start();
  }

  /** Stop pressing from `source`: the pressure eases off. */
  pressOut(source: string): void {
    this.pressing.delete(source);
    this.start();
  }

  /** Stop everything (window lost focus, tab hidden). */
  releaseAll(): void {
    this.held.clear();
    this.pressing.clear();
    this.start();
  }

  private start(): void {
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  /** Shift pressed or released while moving. */
  setFine(fine: boolean): void {
    for (const held of this.held.values()) held.fine = fine;
  }

  get moving(): boolean {
    return this.held.size > 0;
  }

  dispose(): void {
    this.held.clear();
    this.pressing.clear();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private readonly tick = (now: number): void => {
    const state = useSono.getState();
    const target = this.pressing.size > 0 ? 1 : 0;
    const pressure = state.settings.pressure;
    if (this.held.size === 0 && pressure === target) {
      this.raf = 0;
      return;
    }
    // Time since the last frame, in real seconds: on a slow machine, fewer and longer frames cover the
    // same movement. A stall (a hidden tab, a long frame) is capped, so the probe does not jump.
    const elapsed = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(MAX_STEP_S, elapsed);
    this.last = now;
    if (!state.frozen) {
      let pose = state.pose;
      for (const held of this.held.values()) {
        const heldFor = (now - held.since) / 1000 - HOLD_DELAY_S;
        if (heldFor <= 0) continue;
        const ramp = Math.min(1, 0.2 + heldFor / RAMP_S);
        const boost = heldFor > BOOST_AFTER_S ? Math.min(2, 1 + (heldFor - BOOST_AFTER_S) / BOOST_S) : 1;
        const rate = RATES[moveAxis(held.move)];
        pose = shiftPose(pose, held.move, rate.speed * (held.fine ? FINE_SPEED : 1) * ramp * boost * dt, this.skin);
      }
      if (pose !== state.pose) this.apply(pose);
    }
    // The hand keeps pressing (or easing off) even on a frozen image, so the loop always ends.
    if (pressure !== target) {
      const step = Math.min(MAX_PRESS_STEP_S, elapsed) / (target > pressure ? PRESS_S : RELEASE_S);
      const next = target > pressure ? Math.min(target, pressure + step) : Math.max(target, pressure - step);
      state.setSettings({ pressure: Math.round(next * 1000) / 1000 });
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}
