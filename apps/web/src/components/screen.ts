import { dopplerColor, grayLevel, ORGANS, type OrganKey, PROBES, planeToPixel, type ScanGeometry, scanline } from "@insonate/sono-engine";
import { CATEGORY_COLORS, ORGAN_COLORS, rgb, TISSUE_CATEGORY } from "../content/palette";
import type { FrameInfo } from "../sim/controller";
import type { AnatomyMap, CtMap } from "../sim/protocol";
import type { BodyScale } from "../sim/where";
import type { Measurement, SonoState } from "../state/store";

/** Everything the scanner screen draws over the image: the machine's chrome, anatomy, labels and calipers. */
export interface ScreenText {
  readonly frozen: string;
  readonly contact: string;
  readonly organName: (key: OrganKey) => string;
  /** Shown on the CT layer, top centre. */
  readonly ctLabel: string;
  /** The patient's landmarks, so the body marker is drawn to scale. */
  readonly body: BodyScale | null;
}

/** The monitor's graphics: neutral white text, the marker in the console's amber, overlays in yellow and amber. */
const TEXT = "rgba(236, 235, 230, 0.94)";
const DIM = "rgba(236, 235, 230, 0.56)";
const LINE = "rgba(236, 235, 230, 0.72)";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "'IBM Plex Sans', 'IBM Plex Sans Arabic', system-ui, sans-serif";
const MARKER = "#f2a43a";
const ACCENT = "#f2a43a";

/** Symbols and colours of successive caliper pairs, as scanners distinguish them. */
export const CALIPERS = [
  { symbol: "+", color: "#7ee8a2" },
  { symbol: "×", color: "#ffd166" },
  { symbol: "◇", color: "#7cc7ff" },
  { symbol: "□", color: "#ff9bd2" },
] as const;

export function drawScreen(
  canvas: HTMLCanvasElement,
  info: FrameInfo | null,
  state: SonoState,
  draft: Measurement | null,
  text: ScreenText,
): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx || width === 0) return;
  ctx.clearRect(0, 0, width, height);
  if (!info) return;
  const px = (a: number, d: number) => {
    const p = planeToPixel(info.view, a, d);
    return { x: (p.x * width) / info.width, y: (p.y * height) / info.height };
  };
  // Readouts shrink on small screens so they leave the image visible.
  const fit = Math.min(1, Math.max(0.66, rect.width / 760));
  const u = (n: number) => n * dpr * fit;

  if (state.ct && info.ct) {
    ctx.save();
    ctx.globalAlpha = state.ctBlend;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(ctLayer(info.ct), 0, 0, width, height);
    ctx.restore();
    ctx.font = `700 ${u(11)}px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffd166";
    ctx.fillText(text.ctLabel, width / 2, u(34));
  }
  if (state.anatomy && info.anatomy) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(anatomyLayer(info.anatomy), 0, 0, width, height);
    ctx.restore();
  }
  if (state.labels || state.anatomy) drawLabels(ctx, info, px, u, text);
  if (state.settings.doppler === "color") drawColorBox(ctx, info, state, px, u, width);
  if (state.settings.doppler === "pw") drawGate(ctx, info, state, px, u);
  drawCalipers(ctx, draft ? [...state.measurements, draft] : state.measurements, px, u, Boolean(draft));
  drawInfo(ctx, info, state, u);
  drawGrayBar(ctx, u, height);
  drawDepthScale(ctx, info, state, px, u, width);
  drawOrientationMarker(ctx, info, px, u);
  drawMeasurementBox(ctx, state.measurements, u, width);
  drawBodyMarker(ctx, state, text.body, u(14), height - u(104), u(62), dpr * fit);
  if (info.contact < 0.5) {
    ctx.font = `600 ${u(14)}px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255, 209, 102, 0.95)";
    ctx.fillText(text.contact, width / 2, height * 0.55);
  }
}

type Px = (a: number, d: number) => { x: number; y: number };
type Units = (n: number) => number;

/** The machine readout, top left: preset, transducer, gain, dynamic range, depth, frame rate, processing. */
function drawInfo(ctx: CanvasRenderingContext2D, info: FrameInfo, state: SonoState, u: Units): void {
  const s = state.settings;
  const probe = PROBES[s.probe];
  const frameRate = Math.min(60, Math.max(1, Math.round(1000 / Math.max(1, info.ms))));
  const rows: Array<[string, string]> = [
    [`${probe.model}`, `${s.frequencyMHz.toFixed(1)} MHz`],
    ["Gn", `${s.gainDb > 0 ? "+" : ""}${s.gainDb} dB`],
    ["DR", `${s.dynamicRangeDb}`],
    ["D", `${(s.depthMm / 10).toFixed(1)} cm`],
    ["FR", `${frameRate} Hz`],
    ["SRI", `${s.speckleReduction}   P ${s.persistence}`],
  ];
  if (s.doppler === "color") rows.push(["CF", `±${s.scaleCmS} cm/s  G ${s.colorGainDb > 0 ? "+" : ""}${s.colorGainDb}`]);
  if (s.doppler === "pw") rows.push(["PW", `SV ${s.gate.lengthMm.toFixed(1)} mm  ∠${state.dopplerAngle}°`]);
  // Probe pressure (graded compression), while the probe is pressed in.
  if (s.pressure > 0.01) rows.push(["PRS", `${"▮".repeat(Math.round(s.pressure * 5)).padEnd(5, "▯")} ${Math.round(s.pressure * 100)}%`]);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `600 ${u(11)}px ${MONO}`;
  ctx.fillStyle = TEXT;
  ctx.fillText("INSONATE  ABD", u(12), u(10));
  ctx.font = `500 ${u(10.5)}px ${MONO}`;
  rows.forEach(([label, value], i) => {
    const y = u(28 + i * 14);
    ctx.fillStyle = DIM;
    ctx.fillText(label, u(12), y);
    ctx.fillStyle = TEXT;
    ctx.fillText(value, u(12 + (i === 0 ? 40 : 30)), y);
  });
}

/** Plane coordinates of a point on scanline `line` (fractional) at depth `t` along it (mm). */
function onLine(g: ScanGeometry, line: number, t: number): { a: number; d: number } {
  const sl = scanline(g, line);
  return { a: sl.a + sl.da * t, d: sl.d + sl.dd * t };
}

/** The colour box outline (a sector for a curvilinear probe) and the colour scale, as scanners draw them. */
function drawColorBox(ctx: CanvasRenderingContext2D, info: FrameInfo, state: SonoState, px: Px, u: Units, width: number): void {
  const g = info.geometry;
  const box = state.settings.colorBox;
  const half = Math.max(0.02, box.width / 2);
  const l0 = Math.max(0, box.center - half) * (g.lines - 1);
  const l1 = Math.min(1, box.center + half) * (g.lines - 1);
  const top = Math.max(0, Math.min(box.top, g.depthMm));
  const bottom = Math.max(top, Math.min(box.bottom, g.depthMm));
  ctx.save();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = u(1.2);
  ctx.beginPath();
  const steps = 24;
  const at = (line: number, t: number) => {
    const p = onLine(g, line, t);
    return px(p.a, p.d);
  };
  let p = at(l0, top);
  ctx.moveTo(p.x, p.y);
  p = at(l0, bottom);
  ctx.lineTo(p.x, p.y);
  for (let i = 1; i <= steps; i++) {
    p = at(l0 + ((l1 - l0) * i) / steps, bottom);
    ctx.lineTo(p.x, p.y);
  }
  p = at(l1, top);
  ctx.lineTo(p.x, p.y);
  for (let i = steps - 1; i >= 0; i--) {
    p = at(l0 + ((l1 - l0) * i) / steps, top);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  // Colour scale: flow toward the probe at the top, away at the bottom (unless inverted), ± the Nyquist limit.
  const x = width - u(58);
  const y = u(30);
  const h = u(84);
  const w = u(9);
  for (let i = 0; i < h; i++) {
    const fraction = 1 - (2 * i) / h;
    ctx.fillStyle = Math.abs(fraction) < 0.06 ? "#000" : dopplerColor(fraction, state.settings.colorInvert);
    ctx.fillRect(x, y + i, w, 1.5);
  }
  ctx.strokeStyle = "rgba(236, 235, 230, 0.45)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.fillStyle = TEXT;
  ctx.font = `500 ${u(10)}px ${MONO}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const scale = state.settings.scaleCmS;
  ctx.fillText(`+${scale}`, x - u(4), y + u(4));
  ctx.fillText(`-${scale}`, x - u(4), y + h - u(4));
  ctx.fillStyle = DIM;
  ctx.fillText("cm/s", x - u(4), y + h / 2);
  ctx.restore();
}

/** PW Doppler: the Doppler line through the gate, the sample volume's marks and the angle-correction cursor. */
function drawGate(ctx: CanvasRenderingContext2D, info: FrameInfo, state: SonoState, px: Px, u: Units): void {
  const g = info.geometry;
  const gate = state.settings.gate;
  const r = g.kind === "curvilinear" ? g.faceRadiusMm : 0;
  let da = 0;
  let dd = 1;
  if (g.kind === "curvilinear") {
    const n = Math.hypot(gate.a, gate.d + r) || 1;
    da = gate.a / n;
    dd = (gate.d + r) / n;
  }
  const start = g.kind === "curvilinear" ? { a: da * r, d: -r + dd * r } : { a: gate.a, d: 0 };
  const along = (t: number) => px(start.a + da * t, start.d + dd * t);
  const toGate = Math.hypot(gate.a - start.a, gate.d - start.d);
  const length = toGate + (g.depthMm - gate.d) / Math.max(0.2, dd);
  ctx.save();
  // The Doppler line, dashed, from the face to the bottom of the image.
  ctx.strokeStyle = LINE;
  ctx.lineWidth = u(1.2);
  ctx.setLineDash([u(5), u(4)]);
  ctx.beginPath();
  const a0 = along(0);
  const a1 = along(length);
  ctx.moveTo(a0.x, a0.y);
  ctx.lineTo(a1.x, a1.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // The gate: two marks across the line at its ends.
  const half = gate.lengthMm / 2;
  const centre = along(toGate);
  const ahead = along(toGate + 1);
  const ux = ahead.x - centre.x;
  const uy = ahead.y - centre.y;
  const norm = Math.hypot(ux, uy) || 1;
  const nx = -uy / norm;
  const ny = ux / norm;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = u(2);
  for (const t of [toGate - half, toGate + half]) {
    const m = along(t);
    ctx.beginPath();
    ctx.moveTo(m.x - nx * u(8), m.y - ny * u(8));
    ctx.lineTo(m.x + nx * u(8), m.y + ny * u(8));
    ctx.stroke();
  }
  // Angle correction: a line through the gate, θ from the Doppler line, to lay along the vessel.
  const theta = (state.dopplerAngle * Math.PI) / 180;
  const cx = (ux / norm) * Math.cos(theta) - (uy / norm) * Math.sin(theta);
  const cy = (ux / norm) * Math.sin(theta) + (uy / norm) * Math.cos(theta);
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = u(1.6);
  ctx.beginPath();
  ctx.moveTo(centre.x - cx * u(22), centre.y - cy * u(22));
  ctx.lineTo(centre.x + cx * u(22), centre.y + cy * u(22));
  ctx.stroke();
  ctx.restore();
}

/** The gray bar: the display's gray map from black (bottom) to white (top). */
function drawGrayBar(ctx: CanvasRenderingContext2D, u: Units, height: number): void {
  const x = u(12);
  const top = u(124);
  const barHeight = Math.min(u(120), height * 0.3);
  const w = u(7);
  for (let i = 0; i < barHeight; i++) {
    const v = grayLevel(1 - i / barHeight);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, top + i, w, 1.5);
  }
  ctx.strokeStyle = "rgba(236, 235, 230, 0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, top - 0.5, w + 1, barHeight + 1);
}

/** Depth scale (cm), transmit focus and the TGC curve, along the right edge. */
function drawDepthScale(ctx: CanvasRenderingContext2D, info: FrameInfo, state: SonoState, px: Px, u: Units, width: number): void {
  const depth = info.geometry.depthMm;
  const top = px(0, 0).y;
  const bottom = px(0, depth).y;
  const xScale = width - u(16);
  ctx.strokeStyle = LINE;
  ctx.fillStyle = TEXT;
  ctx.lineWidth = u(1);
  ctx.font = `500 ${u(10.5)}px ${MONO}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let mm = 0; mm <= depth + 0.01; mm += 5) {
    const y = px(0, mm).y;
    const major = mm % 50 === 0;
    const minor = mm % 10 !== 0;
    ctx.beginPath();
    ctx.moveTo(xScale, y);
    ctx.lineTo(xScale + u(major ? 10 : minor ? 3 : 6), y);
    ctx.stroke();
    if (major && mm > 0) ctx.fillText(`${mm / 10}`, xScale - u(5), y);
  }
  ctx.beginPath();
  ctx.moveTo(xScale + u(10), top);
  ctx.lineTo(xScale + u(10), bottom);
  ctx.stroke();

  // Transmit focus: a filled triangle at its depth.
  const fy = px(0, state.settings.focusMm).y;
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.moveTo(xScale - u(2), fy);
  ctx.lineTo(xScale - u(10), fy - u(5));
  ctx.lineTo(xScale - u(10), fy + u(5));
  ctx.closePath();
  ctx.fill();

  // TGC curve: each band's extra gain pushes the curve left (more gain) or right (less). Hidden when flat.
  const tgc = state.settings.tgcDb;
  if (tgc.every((db) => db === 0)) return;
  const base = xScale - u(34);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = u(1.2);
  ctx.beginPath();
  tgc.forEach((db, i) => {
    const y = px(0, (i / (tgc.length - 1)) * depth).y;
    const x = base - db * u(1.3);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = ACCENT;
  tgc.forEach((db, i) => {
    const y = px(0, (i / (tgc.length - 1)) * depth).y;
    ctx.beginPath();
    ctx.arc(base - db * u(1.3), y, u(1.8), 0, Math.PI * 2);
    ctx.fill();
  });
}

/** The orientation marker: beside the image corner on the probe marker's side. */
function drawOrientationMarker(ctx: CanvasRenderingContext2D, info: FrameInfo, px: Px, u: Units): void {
  const start = scanline(info.geometry, 0);
  const corner = px(start.a, start.d);
  ctx.fillStyle = MARKER;
  ctx.beginPath();
  ctx.arc(corner.x - u(12), corner.y + u(2), u(5), 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Organ names at the middle of what the image shows of each organ, largest organs first. A name
 * that would cover another moves a line up or down, or is left out: labels never overlap.
 */
function drawLabels(ctx: CanvasRenderingContext2D, info: FrameInfo, px: Px, u: Units, text: ScreenText): void {
  ctx.font = `600 ${u(12.5)}px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const placed: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  const line = u(17);
  const organs = Object.entries(info.organs)
    .filter(([, organ]) => organ && organ.areaMm2 >= 120)
    .sort((a, b) => (b[1]?.areaMm2 ?? 0) - (a[1]?.areaMm2 ?? 0));
  for (const [key, organ] of organs) {
    if (!organ) continue;
    const p = px(organ.a, organ.d);
    const name = text.organName(key as OrganKey);
    const half = ctx.measureText(name).width / 2 + u(4);
    let spot: { x: number; y: number } | null = null;
    for (const dy of [0, -line, line, -2 * line, 2 * line]) {
      const box = { x0: p.x - half, y0: p.y + dy - line / 2, x1: p.x + half, y1: p.y + dy + line / 2 };
      if (placed.every((b) => box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1)) {
        placed.push(box);
        spot = { x: p.x, y: p.y + dy };
        break;
      }
    }
    if (!spot) continue;
    ctx.lineWidth = u(3.5);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.strokeText(name, spot.x, spot.y);
    ctx.fillStyle = ORGAN_COLORS[key as OrganKey] ?? "#ffe08a";
    ctx.fillText(name, spot.x, spot.y);
  }
}

/** Caliper pairs: a symbol at each end, a dotted line between and the number beside the second end. */
function drawCalipers(ctx: CanvasRenderingContext2D, all: readonly Measurement[], px: Px, u: Units, drafting: boolean): void {
  all.forEach((m, i) => {
    const a = px(m.a1, m.d1);
    const b = px(m.a2, m.d2);
    const style = CALIPERS[i % CALIPERS.length];
    const live = drafting && i === all.length - 1;
    ctx.strokeStyle = style.color;
    ctx.fillStyle = style.color;
    ctx.globalAlpha = live ? 0.9 : 1;
    ctx.lineWidth = u(1.2);
    ctx.setLineDash([u(3), u(4)]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `600 ${u(15)}px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of [a, b]) ctx.fillText(style.symbol, p.x, p.y);
    const mm = Math.hypot(m.a2 - m.a1, m.d2 - m.d1);
    ctx.font = `600 ${u(11.5)}px ${MONO}`;
    ctx.textAlign = "left";
    ctx.lineWidth = u(3);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    const label = `D${i + 1} ${(mm / 10).toFixed(2)}`;
    ctx.strokeText(label, b.x + u(10), b.y - u(10));
    ctx.fillText(label, b.x + u(10), b.y - u(10));
    ctx.globalAlpha = 1;
  });
}

/** Results, as scanners list them: symbol, number and distance. */
function drawMeasurementBox(ctx: CanvasRenderingContext2D, measurements: readonly Measurement[], u: Units, width: number): void {
  if (measurements.length === 0) return;
  const x = width - u(176);
  const y = u(12);
  const rowHeight = u(17);
  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  ctx.strokeStyle = "rgba(236, 235, 230, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x, y, u(126), u(10) + rowHeight * measurements.length);
  ctx.fill();
  ctx.stroke();
  ctx.font = `600 ${u(11.5)}px ${MONO}`;
  ctx.textBaseline = "top";
  measurements.forEach((m, i) => {
    const style = CALIPERS[i % CALIPERS.length];
    const mm = Math.hypot(m.a2 - m.a1, m.d2 - m.d1);
    const row = y + u(6) + i * rowHeight;
    ctx.textAlign = "left";
    ctx.fillStyle = style.color;
    ctx.fillText(`${style.symbol} D${i + 1}`, x + u(9), row);
    ctx.textAlign = "right";
    ctx.fillStyle = TEXT;
    ctx.fillText(`${(mm / 10).toFixed(2)} cm`, x + u(118), row);
  });
}

/** Heights on the body marker (fractions of its height) of the xiphoid, umbilicus and pubic symphysis. */
const MARKER_XIPHOID = 0.34;
const MARKER_NAVEL = 0.62;
const MARKER_SYMPHYSIS = 0.95;

/**
 * A small torso pictogram with the probe's position and orientation, as scanners show. Heights follow
 * the patient's own landmarks (xiphoid, umbilicus, symphysis), and the costal margin is drawn, so the
 * marker shows truthfully whether the probe is over the ribs or below them.
 */
function drawBodyMarker(
  ctx: CanvasRenderingContext2D,
  state: SonoState,
  body: BodyScale | null,
  x: number,
  y: number,
  w: number,
  dpr: number,
): void {
  const pose = state.pose;
  const h = w * 1.4;
  // z (mm) → fraction of the marker's height, piecewise between the landmarks.
  const xiphoid = body?.xiphoid ?? 180;
  const navel = body?.umbilicus ?? -15;
  const symphysis = body?.symphysis ?? -175;
  const height = (z: number): number => {
    if (z >= navel) return MARKER_NAVEL - ((z - navel) / (xiphoid - navel)) * (MARKER_NAVEL - MARKER_XIPHOID);
    return MARKER_NAVEL + ((navel - z) / (navel - symphysis)) * (MARKER_SYMPHYSIS - MARKER_NAVEL);
  };
  // φ = 0 is midline; the patient's right is on the viewer's left.
  const across = (phiDeg: number): number => 0.5 - Math.sin((phiDeg * Math.PI) / 180) * 0.4;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(236, 235, 230, 0.55)";
  ctx.lineWidth = 1.2 * dpr;
  // Torso seen from the front: shoulders, waist and hips.
  ctx.beginPath();
  ctx.moveTo(w * 0.18, 0);
  ctx.bezierCurveTo(w * 0.04, h * 0.05, w * 0.06, h * 0.32, w * 0.16, h * 0.5);
  ctx.bezierCurveTo(w * 0.2, h * 0.62, w * 0.02, h * 0.82, w * 0.12, h);
  ctx.lineTo(w * 0.88, h);
  ctx.bezierCurveTo(w * 0.98, h * 0.82, w * 0.8, h * 0.62, w * 0.84, h * 0.5);
  ctx.bezierCurveTo(w * 0.94, h * 0.32, w * 0.96, h * 0.05, w * 0.82, 0);
  ctx.stroke();
  // The costal margin: the lower edge of the rib cage, from the xiphoid down and out to the flanks.
  if (body && body.costalMargin.length > 1) {
    ctx.strokeStyle = "rgba(255, 209, 102, 0.6)";
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([2.5 * dpr, 2 * dpr]);
    for (const sign of [1, -1]) {
      const side = body.costalMargin.filter(([phi]) => phi * sign >= 0).sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]));
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * height(xiphoid));
      for (const [phi, z] of side) ctx.lineTo(w * across(phi), h * Math.min(0.97, height(z)));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // Navel, for orientation.
  ctx.fillStyle = "rgba(236, 235, 230, 0.45)";
  ctx.beginPath();
  ctx.arc(w * 0.5, h * MARKER_NAVEL, 1.4 * dpr, 0, Math.PI * 2);
  ctx.fill();
  const cx = w * Math.min(0.95, Math.max(0.05, across(pose.phiDeg)));
  const cy = h * Math.min(0.97, Math.max(0.03, height(pose.zMm)));
  // Rotation 0 = longitudinal (marker to head = up); 90 = transverse (marker to patient's right = viewer's left).
  const theta = (pose.rotationDeg * Math.PI) / 180;
  const dx = -Math.sin(theta) * 9 * dpr;
  const dy = -Math.cos(theta) * 9 * dpr;
  ctx.strokeStyle = "#ecebe6";
  ctx.lineWidth = 3.2 * dpr;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - dx, cy - dy);
  ctx.lineTo(cx + dx, cy + dy);
  ctx.stroke();
  ctx.fillStyle = MARKER;
  ctx.beginPath();
  ctx.arc(cx + dx, cy + dy, 2.6 * dpr, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

let ctCache: { source: CtMap; canvas: HTMLCanvasElement } | null = null;

/** The CT cut in the image plane, in gray, transparent outside the fan. */
function ctLayer(map: CtMap): HTMLCanvasElement {
  if (ctCache?.source === map) return ctCache.canvas;
  const canvas = ctCache?.canvas ?? document.createElement("canvas");
  canvas.width = map.width;
  canvas.height = map.height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const image = ctx.createImageData(map.width, map.height);
    for (let p = 0; p < map.gray.length; p++) {
      const g = map.gray[p];
      const o = p * 4;
      image.data[o] = g;
      image.data[o + 1] = g;
      image.data[o + 2] = g;
      image.data[o + 3] = g === 0 ? 0 : 255;
    }
    ctx.putImageData(image, 0, 0);
  }
  ctCache = { source: map, canvas };
  return canvas;
}

let anatomyCache: { source: AnatomyMap; canvas: HTMLCanvasElement } | null = null;

/** Outlines (and a faint fill) of each organ and of bone, gas and lung, from the tissue map of the frame. */
function anatomyLayer(map: AnatomyMap): HTMLCanvasElement {
  if (anatomyCache?.source === map) return anatomyCache.canvas;
  const { width: w, height: h, classes } = map;
  const canvas = anatomyCache?.canvas ?? document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const image = ctx.createImageData(w, h);
  const category = new Uint8Array(w * h);
  for (let i = 0; i < category.length; i++) category[i] = TISSUE_CATEGORY[classes[i]];
  const colors = CATEGORY_COLORS.map(rgb);
  const organCount = Object.keys(ORGANS).length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const c = category[p];
      if (c === 0) continue;
      const edge =
        (x > 0 && category[p - 1] !== c) ||
        (x < w - 1 && category[p + 1] !== c) ||
        (y > 0 && category[p - w] !== c) ||
        (y < h - 1 && category[p + w] !== c);
      // Organs, fluid and stones get a faint fill as well as their outline.
      const alpha = edge ? 255 : c <= organCount || c >= organCount + 4 ? 34 : 0;
      if (alpha === 0) continue;
      const [r, g, b] = colors[c];
      const o = p * 4;
      image.data[o] = r;
      image.data[o + 1] = g;
      image.data[o + 2] = b;
      image.data[o + 3] = alpha;
    }
  }
  ctx.putImageData(image, 0, 0);
  anatomyCache = { source: map, canvas };
  return canvas;
}
