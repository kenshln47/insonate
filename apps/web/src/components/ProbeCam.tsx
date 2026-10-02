import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { DEFAULT_MAPPER, FRONT_AXES, ProbeCamMapper, readMarker } from "../probecam/mapping";
import { MARKER_CELLS, MARKER_MM, SHEET_CELLS, sheetCellIsWhite } from "../probecam/marker";
import type { MarkerObservation } from "../probecam/tracker";
import { useController } from "../sim/context";
import { useSono } from "../state/store";
import type { TrackerResult } from "../workers/tracker.worker";
import { CloseIcon } from "./icons";
import { Button, IconButton } from "./ui";

type Status = "starting" | "searching" | "tracking" | "denied" | "unavailable";

/** The marker is lost if it has not been seen for this long, ms. */
const LOST_MS = 400;

/** Steer the probe with a printed marker held in front of the webcam. Video never leaves the device. */
export function ProbeCam() {
  const controller = useController();
  const setProbeCam = useSono((s) => s.setProbeCam);
  const setDialog = useSono((s) => s.setDialog);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [mapper] = useState(() => new ProbeCamMapper(DEFAULT_MAPPER));
  const [status, setStatus] = useState<Status>("starting");
  const t = useT();

  useEffect(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let busy = false;
    let disposed = false;
    let lastSeen = Number.NEGATIVE_INFINITY;
    let shown: Status = "starting";
    const show = (next: Status) => {
      if (next === shown) return;
      shown = next;
      setStatus(next);
    };

    const worker = new Worker(new URL("../workers/tracker.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<TrackerResult>) => {
      busy = false;
      const { observation, width, height } = event.data;
      const now = performance.now();
      drawOverlay(overlay, observation, width, height);
      if (observation) {
        lastSeen = now;
        show("tracking");
        const state = useSono.getState();
        const axes = controller.viewAxes?.() ?? FRONT_AXES;
        const next = mapper.update(readMarker(observation), now, state.pose, controller.skin, axes);
        if (next && !state.frozen) controller.setPose(next);
      } else if (now - lastSeen > LOST_MS) {
        mapper.reset();
        show("searching");
      }
    };

    const pump = () => {
      raf = requestAnimationFrame(pump);
      if (busy || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      busy = true;
      createImageBitmap(video)
        .then((bitmap) => worker.postMessage({ type: "frame", bitmap }, [bitmap]))
        .catch(() => {
          busy = false;
        });
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      show("unavailable");
    } else {
      navigator.mediaDevices
        .getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false })
        .then((media) => {
          if (disposed) {
            for (const track of media.getTracks()) track.stop();
            return;
          }
          stream = media;
          video.srcObject = media;
          void video.play();
          show("searching");
          pump();
        })
        .catch((err: unknown) => show(err instanceof DOMException && err.name === "NotAllowedError" ? "denied" : "unavailable"));
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      worker.terminate();
      for (const track of stream?.getTracks() ?? []) track.stop();
      mapper.reset();
    };
  }, [controller, mapper]);

  return (
    <section className="card probecam" aria-label="Probe Cam">
      <header className="probecam-head">
        <strong>{t.probeCam.title}</strong>
        <span className={`probecam-status is-${status}`} role="status">
          {t.probeCam.status[status]}
        </span>
        <IconButton label={t.probeCam.close} onClick={() => setProbeCam(false)}>
          <CloseIcon />
        </IconButton>
      </header>
      <div className="probecam-view">
        <video ref={videoRef} muted playsInline aria-label={t.probeCam.preview} />
        <canvas ref={overlayRef} />
      </div>
      <div className="probecam-side">
        <p className="hint">{t.probeCam.help[status]}</p>
        <div className="tool-row">
          <Button onClick={() => mapper.reset()}>{t.probeCam.regrip}</Button>
          <Button onClick={() => setDialog("marker")}>{t.probeCam.print}</Button>
        </div>
        <p className="hint muted">{t.probeCam.privacy}</p>
      </div>
    </section>
  );
}

function drawOverlay(canvas: HTMLCanvasElement, observation: MarkerObservation | null, width: number, height: number): void {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  if (!observation) return;
  const [first, ...rest] = observation.corners;
  context.lineWidth = Math.max(2, width / 160);
  context.strokeStyle = "#4ade80";
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const corner of rest) context.lineTo(corner.x, corner.y);
  context.closePath();
  context.stroke();
  // The marker's top-left corner, like the probe's orientation marker.
  context.fillStyle = "#f2a43a";
  context.beginPath();
  context.arc(first.x, first.y, context.lineWidth * 2.5, 0, Math.PI * 2);
  context.fill();
}

/** The printable marker, drawn from the dictionary bits, at its true printed size. */
export function MarkerSheet() {
  const t = useT();
  const cells: { x: number; y: number }[] = [];
  for (let row = 0; row < SHEET_CELLS; row++) {
    for (let col = 0; col < SHEET_CELLS; col++) if (!sheetCellIsWhite(col, row)) cells.push({ x: col, y: row });
  }
  const sheetMm = (MARKER_MM / MARKER_CELLS) * SHEET_CELLS;
  return (
    <div className="marker-sheet">
      <ol className="steps">
        {t.probeCam.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="print-sheet">
        <svg
          viewBox={`0 0 ${SHEET_CELLS} ${SHEET_CELLS}`}
          style={{ width: `${sheetMm}mm`, height: `${sheetMm}mm` }}
          shapeRendering="crispEdges"
          role="img"
          aria-label={t.probeCam.markerLabel}
        >
          <rect width={SHEET_CELLS} height={SHEET_CELLS} fill="#fff" />
          {cells.map((c) => (
            <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width={1.02} height={1.02} fill="#000" />
          ))}
        </svg>
        <p className="print-caption">{t.probeCam.caption}</p>
      </div>
      <div className="tool-row">
        <Button variant="primary" onClick={() => window.print()}>
          {t.probeCam.printButton}
        </Button>
      </div>
    </div>
  );
}
