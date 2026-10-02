import { pixelToPlane, planeToWorld, type ScanGeometry } from "@insonate/sono-engine";
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { MESSAGES, useT } from "../i18n";
import { useController } from "../sim/context";
import type { FrameInfo } from "../sim/controller";
import { bring, type Grip, gripAt, movePose, slideInImage } from "../sim/pose";
import { bodyScale } from "../sim/where";
import { type Measurement, useSono } from "../state/store";
import { PatientReaction } from "./PatientReaction";
import { drawScreen, type ScreenText } from "./screen";

/** The scanner screen: the live image, the machine's readouts and overlays, and caliper input. */
export function UltrasoundView() {
  const controller = useController();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<FrameInfo | null>(null);
  const [draft, setDraft] = useState<Measurement | null>(null);
  const measuring = useSono((s) => s.measuring);
  const doppler = useSono((s) => s.settings.doppler);
  const dragging = useRef(false);
  /** The probe in the hand: where a drag on the image started, what it grabbed, and where the hand has it now. */
  const grab = useRef<{ x: number; y: number; mmPerPx: number; twist: boolean; a: number; grip: Grip } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const frozen = useSono((s) => s.frozen);
  const addMeasurement = useSono((s) => s.addMeasurement);
  const t = useT();
  const body = useMemo(() => bodyScale(controller.data.json.landmarks), [controller]);

  useEffect(() => {
    controller.attachCanvas(canvasRef.current);
    return () => controller.attachCanvas(null);
  }, [controller]);

  // Render as many pixels as the screen shows, so the image stays sharp.
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const fit = () => controller.setImageWidth(element.clientWidth * Math.min(2, window.devicePixelRatio || 1));
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => observer.disconnect();
  }, [controller]);

  // Redraw overlays on every frame and whenever overlay-relevant state changes.
  useEffect(() => {
    const draw = () => {
      const state = useSono.getState();
      const words = MESSAGES[state.language];
      const text: ScreenText = {
        frozen: words.screen.frozen,
        contact: words.screen.contact,
        organName: (key) => words.organs[key],
        body,
        ctLabel: words.tools.ctLabel(state.breathing !== "expire"),
      };
      if (overlayRef.current) drawScreen(overlayRef.current, infoRef.current, state, draft, text);
    };
    const stopFrames = controller.onFrame((info) => {
      infoRef.current = info;
      draw();
    });
    const stopStore = useSono.subscribe(draw);
    const observer = new ResizeObserver(draw);
    if (wrapRef.current) observer.observe(wrapRef.current);
    draw();
    return () => {
      stopFrames();
      stopStore();
      observer.disconnect();
    };
  }, [controller, draft, body]);

  // Mouse wheel fans the beam through the anatomy.
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const state = useSono.getState();
      if (state.frozen) return;
      const move = event.deltaY < 0 ? "fan-up" : "fan-down";
      controller.setPose(movePose(state.pose, move, controller.skin, !event.shiftKey));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [controller]);

  const toPlane = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const info = infoRef.current;
    if (!info) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * info.width;
    const y = ((event.clientY - rect.top) / rect.height) * info.height;
    return pixelToPlane(info.view, x, y);
  };

  // Colour mode: drag to move the colour box. PW: click or drag to place the sample volume.
  const placeDoppler = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const info = infoRef.current;
    const p = toPlane(event);
    if (!info || !p) return;
    const state = useSono.getState();
    const settings = state.settings;
    if (settings.doppler === "pw") {
      const d = Math.max(2, Math.min(info.geometry.depthMm - 2, p.d));
      state.setSettings({ gate: { ...settings.gate, a: p.a, d } });
      return;
    }
    const { u, t } = polarOf(info.geometry, p.a, p.d);
    const box = settings.colorBox;
    const half = box.width / 2;
    const height = Math.max(10, box.bottom - box.top);
    const centre = Math.max(half, Math.min(1 - half, u));
    const top = Math.max(0, Math.min(info.geometry.depthMm - height, t - height / 2));
    state.setSettings({ colorBox: { ...box, center: centre, top, bottom: top + height } });
  };

  /**
   * The probe in the hand. Drag the image sideways and the anatomy under the pointer follows it (the
   * probe slides along the image); drag up or down to slide across, sweeping through the anatomy.
   * Shift- or right-drag rotates (sideways) and rocks (up and down). Calipers and Doppler keep the
   * plain drag for themselves; the twist works in every mode.
   */
  const grabProbe = (event: ReactPointerEvent<HTMLCanvasElement>, twist: boolean) => {
    const info = infoRef.current;
    const p = toPlane(event);
    if (!info || !p || useSono.getState().frozen) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    grab.current = {
      x: event.clientX,
      y: event.clientY,
      mmPerPx: info.view.mmPerPixel * (info.width / rect.width),
      twist,
      a: p.a,
      grip: gripAt(useSono.getState().pose, planeToWorld(info.frame, p.a, p.d), controller.skin),
    };
    setGrabbing(true);
  };
  const moveProbe = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const held = grab.current;
    if (!held) return;
    const dx = (event.clientX - held.x) * held.mmPerPx;
    const dy = (event.clientY - held.y) * held.mmPerPx;
    const start = held.grip.pose;
    if (held.twist) {
      controller.setPose({ ...start, rotationDeg: start.rotationDeg + dx * 0.6, rockDeg: start.rockDeg - dy * 0.35 });
      return;
    }
    // The image's right is away from the marker: the grabbed anatomy goes where the pointer is.
    const moved = bring(held.grip, controller.skin, held.a - dx);
    held.grip = moved.grip;
    controller.setPose(Math.abs(dy) > 0.05 ? slideInImage(moved.pose, controller.skin, 0, dy * 0.5) : moved.pose);
  };
  const letGo = () => {
    grab.current = null;
    setGrabbing(false);
  };

  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const twist = event.button === 2 || event.shiftKey;
      if (event.button !== 0 && event.button !== 2) return;
      if (!twist && measuring) {
        const p = toPlane(event);
        if (!p) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDraft({ a1: p.a, d1: p.d, a2: p.a, d2: p.d });
        return;
      }
      if (!twist && doppler !== "off") {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
        placeDoppler(event);
        return;
      }
      grabProbe(event, twist);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (grab.current) {
        moveProbe(event);
        return;
      }
      if (draft) {
        const p = toPlane(event);
        if (p) setDraft({ ...draft, a2: p.a, d2: p.d });
      } else if (dragging.current) {
        placeDoppler(event);
      }
    },
    onPointerUp: () => {
      if (grab.current) {
        letGo();
        return;
      }
      if (draft && Math.hypot(draft.a2 - draft.a1, draft.d2 - draft.d1) > 2) addMeasurement(draft);
      setDraft(null);
      dragging.current = false;
    },
    onPointerCancel: letGo,
    // Double-click: bring that point to the middle of the image, as a sonographer centres an organ.
    onDoubleClick: (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const info = infoRef.current;
      const p = toPlane(event);
      const state = useSono.getState();
      if (!info || !p || state.frozen || measuring || doppler !== "off") return;
      const centred = bring(gripAt(state.pose, planeToWorld(info.frame, p.a, p.d), controller.skin), controller.skin, 0, 40).pose;
      controller.animateTo(centred, 450);
      // Deep in the image: make room below it.
      if (p.d > state.settings.depthMm * 0.85) state.setSettings({ depthMm: Math.min(240, Math.ceil(p.d / 0.7 / 10) * 10) });
    },
    // The right button rotates the probe: no context menu over the image.
    onContextMenu: (event: ReactPointerEvent<HTMLCanvasElement>) => event.preventDefault(),
  };

  return (
    <div className="us-screen" ref={wrapRef} dir="ltr">
      <canvas ref={canvasRef} className="us-canvas" role="img" aria-label={t.screen.image} />
      <canvas
        ref={overlayRef}
        className={`us-overlay${measuring ? " is-measuring" : doppler !== "off" ? " is-doppler" : " is-probe"}${grabbing ? " is-grabbing" : ""}`}
        {...handlers}
      />
      {frozen && <span className="us-badge">{t.screen.frozen}</span>}
      <PatientReaction />
      {frozen && <CineBar />}
    </div>
  );
}

/** Cine review: scrub or play back the last seconds of scanning while frozen, as on a scanner. */
function CineBar() {
  const controller = useController();
  const index = useSono((s) => s.cineIndex);
  const setIndex = useSono((s) => s.setCineIndex);
  const [playing, setPlaying] = useState(false);
  const t = useT();
  const frames = controller.cineFrames;
  const count = frames.length;
  const current = Math.min(count - 1, index ?? count - 1);

  // Play back in real time, looping, from the frame on screen.
  useEffect(() => {
    if (!playing || count < 2) return;
    // The whole recording loops, starting from the frame on screen (from the first, if on the last).
    const startFrame = useSono.getState().cineIndex ?? count - 1;
    const first = frames[0].at;
    const span = Math.max(1, frames[count - 1].at - first);
    const offset = startFrame === count - 1 ? 0 : frames[startFrame].at - first;
    const begin = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const target = first + ((offset + now - begin) % span);
      let i = 0;
      while (i < count - 1 && frames[i + 1].at <= target) i++;
      if (i !== useSono.getState().cineIndex) setIndex(i);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, count, frames, setIndex]);

  if (count < 2) return null;
  const seconds = (frames[current].at - frames[count - 1].at) / 1000;
  return (
    <fieldset className="cine" dir="ltr" aria-label={t.cine.label}>
      <button
        type="button"
        className="cine-play"
        aria-label={playing ? t.cine.pause : t.cine.play}
        // Keep the keyboard focus where it was, so Space still unfreezes.
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => setPlaying(!playing)}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <input
        type="range"
        className="cine-scrub"
        min={0}
        max={count - 1}
        step={1}
        value={current}
        aria-label={t.cine.scrub}
        onChange={(event) => {
          setPlaying(false);
          setIndex(Number(event.target.value));
        }}
      />
      <span className="cine-pos">{t.cine.position(current + 1, count, seconds)}</span>
    </fieldset>
  );
}

/** Scanline fraction (0–1) and depth along the line (mm) of a point in the image plane, clamped to the image. */
function polarOf(g: ScanGeometry, a: number, d: number): { u: number; t: number } {
  if (g.kind === "curvilinear") {
    const r = g.faceRadiusMm;
    const u = 0.5 - Math.atan2(a, d + r) / g.fovRad;
    const t = Math.hypot(a, d + r) - r;
    return { u: Math.max(0, Math.min(1, u)), t: Math.max(0, Math.min(g.depthMm, t)) };
  }
  return { u: Math.max(0, Math.min(1, 0.5 - a / g.widthMm)), t: Math.max(0, Math.min(g.depthMm, d)) };
}
