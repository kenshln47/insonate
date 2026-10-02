import {
  cardiacPhase,
  type GateSample,
  grayLevel,
  HEART_RATE_BPM,
  PEAK_CM_S,
  VESSELS,
  type VesselKind,
  waveform,
} from "@insonate/sono-engine";
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { useController } from "../sim/context";
import { DopplerAudio } from "../sim/dopplerAudio";
import { useSono } from "../state/store";

/** Seconds of history across the spectral display. */
const SWEEP_S = 4;
/** Where zero velocity sits, as a fraction of the height from the top. */
const BASELINE = 0.5;

/** Speeds (cm/s, toward the probe positive, angle-corrected) of the blood in the gate at a moment. */
function speedsAt(gate: GateSample, timeMs: number, cosine: number, out: Float32Array): void {
  const phase = cardiacPhase(timeMs);
  const now = VESSELS.map((kind) => PEAK_CM_S[kind] * waveform(kind, phase));
  for (let n = 0; n < gate.toward.length; n++) out[n] = (gate.toward[n] * now[gate.kind[n]]) / cosine;
}

interface Readout {
  readonly kind: VesselKind;
  readonly arterial: boolean;
  /** Peak (systolic) and end-diastolic speed of the fastest blood in the gate (cm/s, angle-corrected). */
  readonly peak: number;
  readonly endDiastolic: number;
  readonly lowest: number;
}

/** Auto-trace over one cardiac cycle: PSV, EDV and RI for arteries; peak and lowest speed for veins. */
function trace(gate: GateSample, cosine: number): Readout | null {
  if (gate.toward.length === 0) return null;
  const counts = new Array(VESSELS.length).fill(0);
  for (const k of gate.kind) counts[k]++;
  const kind = VESSELS[counts.indexOf(Math.max(...counts))];
  const speeds = new Float32Array(gate.toward.length);
  const period = 60000 / HEART_RATE_BPM;
  let peak = 0;
  let lowest = Number.POSITIVE_INFINITY;
  let endDiastolic = 0;
  // Follow the envelope of whichever direction the flow mostly takes.
  const sign = gate.toward.reduce((sum, v) => sum + v, 0) >= 0 ? 1 : -1;
  for (let step = 0; step < 100; step++) {
    speedsAt(gate, (step / 100) * period, cosine, speeds);
    // The envelope (fastest blood) in the main direction, and the deepest reversal.
    let envelope = Number.NEGATIVE_INFINITY;
    let reversed = Number.POSITIVE_INFINITY;
    for (const v of speeds) {
      envelope = Math.max(envelope, v * sign);
      reversed = Math.min(reversed, v * sign);
    }
    peak = Math.max(peak, envelope);
    lowest = Math.min(lowest, Math.min(envelope, reversed));
    if (step === 97) endDiastolic = envelope;
  }
  return { kind, arterial: kind === "aorta" || kind === "iliacArtery", peak, endDiastolic, lowest };
}

/**
 * The PW Doppler spectrum, scrolling as on a scanner: velocity up and down from the baseline,
 * time to the right, brightness for how much blood moves at each speed. Speeds beyond the scale
 * wrap around (aliasing); the angle correction divides by cos θ.
 */
export function Spectrum() {
  const controller = useController();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gateRef = useRef<GateSample | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [status, setStatus] = useState<"flow" | "none" | "shadow" | "waiting">("waiting");
  const [flowAngle, setFlowAngle] = useState<number | null>(null);
  const angle = useSono((s) => s.dopplerAngle);
  const setAngle = useSono((s) => s.setDopplerAngle);
  const scale = useSono((s) => s.settings.scaleCmS);
  const [sound, setSound] = useState(false);
  const audioRef = useRef<DopplerAudio | null>(null);
  const t = useT();

  // Stop the sound when the spectrum closes.
  useEffect(
    () => () => {
      audioRef.current?.stop();
      audioRef.current = null;
    },
    [],
  );

  const toggleSound = () => {
    if (sound) {
      audioRef.current?.stop();
      audioRef.current = null;
    } else {
      audioRef.current = new DopplerAudio();
      audioRef.current.start();
    }
    setSound(!sound);
  };

  useEffect(
    () =>
      controller.onFrame((info) => {
        gateRef.current = info.gate;
      }),
    [controller],
  );

  // Readouts a few times a second.
  useEffect(() => {
    const timer = setInterval(() => {
      const gate = gateRef.current;
      const state = useSono.getState();
      const cosine = Math.max(0.17, Math.cos((Math.abs(state.dopplerAngle) * Math.PI) / 180));
      if (!gate) {
        setStatus("waiting");
        setReadout(null);
        return;
      }
      setStatus(gate.power < 0.1 ? "shadow" : gate.toward.length === 0 ? "none" : "flow");
      setReadout(gate.power < 0.1 ? null : trace(gate, cosine));
      setFlowAngle(gate.flowInPlaneDeg === null ? null : Math.round(gate.flowInPlaneDeg));
    }, 250);
    return () => clearInterval(timer);
  }, []);

  // The scrolling spectrum.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    let raf = 0;
    let last = performance.now();
    let pending = 0;
    let random = 12345;
    const uniform = () => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return (random + 1) / 4294967297;
    };
    let speeds = new Float32Array(256);
    let column = new Float32Array(1);
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        off.width = width;
        off.height = height;
        offCtx.fillStyle = "#000";
        offCtx.fillRect(0, 0, width, height);
      }
      if (column.length !== height) column = new Float32Array(height);
      const state = useSono.getState();
      // Frozen, the spectrum stops too.
      if (state.frozen) {
        last = now;
      } else {
        pending += ((now - last) / 1000) * (width / SWEEP_S);
        last = now;
      }
      const columns = Math.min(width, Math.floor(pending));
      if (columns > 0) {
        pending -= columns;
        offCtx.drawImage(off, -columns, 0);
        const image = offCtx.createImageData(columns, height);
        const gate = gateRef.current;
        const nyquist = Math.max(1, state.settings.scaleCmS);
        const cosine = Math.max(0.17, Math.cos((Math.abs(state.dopplerAngle) * Math.PI) / 180));
        const flip = state.settings.colorInvert ? -1 : 1;
        const baseline = Math.round(height * BASELINE);
        const perCm = (height * BASELINE) / nyquist;
        if (gate && gate.toward.length > speeds.length) speeds = new Float32Array(gate.toward.length);
        for (let c = 0; c < columns; c++) {
          const time = now - ((columns - 1 - c) / (width / SWEEP_S)) * 1000;
          column.fill(0);
          if (gate && gate.toward.length > 0 && gate.power > 0.1) {
            speedsAt(gate, time, cosine, speeds);
            const weight = gate.power / gate.toward.length;
            for (let n = 0; n < gate.toward.length; n++) {
              let v = speeds[n] * flip;
              // Aliasing: beyond the scale, the spectrum wraps to the other side.
              v = ((((v + nyquist) % (2 * nyquist)) + 2 * nyquist) % (2 * nyquist)) - nyquist;
              const row = baseline - v * perCm;
              // Spectral broadening: a little for every speed, more for fast flow.
              const sigma = 1.3 + 0.05 * Math.abs(v) * perCm;
              const lo = Math.max(0, Math.floor(row - 3 * sigma));
              const hi = Math.min(height - 1, Math.ceil(row + 3 * sigma));
              for (let r = lo; r <= hi; r++) column[r] += weight * Math.exp(-(((r - row) / sigma) ** 2) / 2);
            }
          }
          for (let r = 0; r < height; r++) {
            // Each spectral line is a random (exponential) power around its mean: the spectrum's grain.
            const power = (column[r] * 3 + 0.0006) * -Math.log(uniform());
            const db = 10 * Math.log10(power + 1e-9);
            const level = Math.max(0, Math.min(1, (db + 29) / 33));
            const g = grayLevel(level);
            const o = (r * columns + c) * 4;
            image.data[o] = g;
            image.data[o + 1] = g;
            image.data[o + 2] = g;
            image.data[o + 3] = 255;
          }
        }
        offCtx.putImageData(image, width - columns, 0);
      }
      // The sound is the raw Doppler shift (no angle correction), silent while frozen.
      const audio = audioRef.current;
      if (audio?.playing) {
        const gate = gateRef.current;
        if (!gate || state.frozen || gate.power < 0.1) {
          audio.update([], state.settings.frequencyMHz, 0);
        } else {
          if (gate.toward.length > speeds.length) speeds = new Float32Array(gate.toward.length);
          speedsAt(gate, now, 1, speeds);
          audio.update(speeds.subarray(0, gate.toward.length), state.settings.frequencyMHz, gate.power);
        }
      }
      ctx.drawImage(off, 0, 0);
      // Baseline and velocity scale.
      const baseline = Math.round(height * BASELINE) + 0.5;
      ctx.strokeStyle = "rgba(242, 164, 58, 0.75)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, baseline);
      ctx.lineTo(width, baseline);
      ctx.stroke();
      const nyquist = Math.max(1, state.settings.scaleCmS);
      const step = nyquist > 60 ? 50 : nyquist > 30 ? 20 : nyquist > 15 ? 10 : 5;
      ctx.fillStyle = "rgba(236, 235, 230, 0.85)";
      ctx.font = "500 10px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let v = -Math.floor(nyquist / step) * step; v <= nyquist; v += step) {
        const y = baseline - (v / nyquist) * height * BASELINE;
        if (y < 6 || y > height - 6) continue;
        ctx.fillRect(width - 6, y, 6, 1);
        ctx.fillText(`${v}`, width - 9, y);
      }
      ctx.textAlign = "left";
      ctx.fillText("cm/s", 6, 10);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const mismatch = flowAngle !== null && Math.abs(flowAngle - angle) > 8;
  // Above 60°, cos θ changes fast: a few degrees of error change the speed a lot.
  const steep = Math.abs(angle) > 60;
  return (
    <section className="card spectrum" aria-label={t.doppler.spectrum} dir="ltr">
      <canvas ref={canvasRef} className="spectrum-canvas" />
      <div className="spectrum-info" dir={t.dir}>
        {status === "flow" && readout && (
          <span className="spectrum-values">
            <strong>{t.doppler.vessel(readout.kind)}</strong>
            {readout.arterial ? (
              <>
                <span>PSV {Math.round(readout.peak)} cm/s</span>
                <span>EDV {Math.round(Math.max(0, readout.endDiastolic))} cm/s</span>
                <span>RI {(readout.peak > 0 ? (readout.peak - Math.max(0, readout.endDiastolic)) / readout.peak : 0).toFixed(2)}</span>
              </>
            ) : (
              <>
                <span>Vmax {Math.round(readout.peak)} cm/s</span>
                <span>Vmin {Math.round(readout.lowest)} cm/s</span>
              </>
            )}
            <span>±{scale} cm/s</span>
          </span>
        )}
        {status === "none" && <span className="hint">{t.doppler.noFlow}</span>}
        {status === "shadow" && <span className="hint">{t.doppler.shadowed}</span>}
        {status === "waiting" && <span className="hint">{t.doppler.preparing}</span>}
        <button
          type="button"
          className={`chip spectrum-sound${sound ? " is-on" : ""}`}
          aria-pressed={sound}
          title={t.doppler.soundTitle}
          onClick={toggleSound}
        >
          {t.doppler.sound}
        </button>
        {steep && <span className="spectrum-angle">{t.doppler.steep}</span>}
        {mismatch && flowAngle !== null && (
          <span className="spectrum-angle">
            {t.doppler.angleOff(Math.abs(flowAngle))}
            <button type="button" className="link" onClick={() => setAngle(flowAngle)}>
              {t.doppler.matchAngle}
            </button>
          </span>
        )}
      </div>
    </section>
  );
}
