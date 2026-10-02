import { cardiacPhase, type FlowField, flowSlot, movedIndex, PEAK_CM_S, VESSELS, waveform } from "./flow";
import {
  PRESS_CLEAR_MM,
  PROBES,
  type ProbeFrame,
  type ProbeKind,
  planeExtent,
  planeToPolar,
  planeToWorld,
  type ScanGeometry,
  scanGeometry,
  scanline,
} from "./probe";
import { hash3, SPECKLE_SIZE, SpeckleField } from "./speckle";

const SPECKLE_MASK = SPECKLE_SIZE - 1;

import { type OrganKey, TISSUE, TISSUE_PROPS, TISSUE_TO_ORGAN, type TissueProps } from "./tissues";
import { type ClassVolume, withBreath } from "./volume";

/** Doppler mode: none, colour flow in a box, or pulsed-wave (spectral) at a sample volume. */
export type DopplerMode = "off" | "color" | "pw";

/** The colour box: a sector of scanlines (centre and width as fractions of the image) between two depths (mm). */
export interface ColorBox {
  readonly center: number;
  readonly width: number;
  readonly top: number;
  readonly bottom: number;
}

/** The PW Doppler sample volume (gate): its place in the image plane and its length along the beam (mm). */
export interface DopplerGate {
  readonly a: number;
  readonly d: number;
  readonly lengthMm: number;
}

/** Machine settings, as on a real scanner's control panel. */
export interface ImageSettings {
  probe: ProbeKind;
  frequencyMHz: number;
  depthMm: number;
  /** Overall gain, dB. */
  gainDb: number;
  /** Time-gain compensation: 8 slider values (dB) from shallow to deep. */
  tgcDb: readonly number[];
  /** Transmit focus depth, mm. */
  focusMm: number;
  dynamicRangeDb: number;
  /** 0 = expiration, 1 = deep inspiration (organs move toward the feet). */
  breath: number;
  /** Random electronic noise (off for deterministic tests). */
  noise: boolean;
  /** Edge-preserving speckle reduction, 0 (off) to 3 (high), like a scanner's SRI or XRES. */
  speckleReduction: number;
  /** Frame averaging, 0 (off) to 3 (high): smoother, but trails when the probe moves. */
  persistence: number;
  doppler: DopplerMode;
  colorBox: ColorBox;
  /** Velocity scale (cm/s): the Nyquist limit set by the pulse repetition frequency. Faster flow aliases. */
  scaleCmS: number;
  /** Colour gain, dB. */
  colorGainDb: number;
  /** Swap the colours of flow toward and away from the probe. */
  colorInvert: boolean;
  gate: DopplerGate;
  /** Time of the frame (ms): the moment of the cardiac cycle that colour Doppler shows. */
  timeMs: number;
  /**
   * Probe pressure, 0 (resting on the skin) to 1 (firm graded compression). Render with the frame
   * from `frameFromPose(skin, pose, pressure)`: the face sinks into the wall, and gas-filled bowel
   * under it is pushed aside down to `PRESS_CLEAR_MM` at full pressure.
   */
  pressure: number;
}

export const DEFAULT_SETTINGS: ImageSettings = {
  probe: "curvilinear",
  frequencyMHz: PROBES.curvilinear.frequencyMHz,
  depthMm: PROBES.curvilinear.depthMm,
  gainDb: 0,
  tgcDb: [0, 0, 0, 0, 0, 0, 0, 0],
  focusMm: 80,
  dynamicRangeDb: 60,
  breath: 0,
  noise: true,
  speckleReduction: 2,
  persistence: 1,
  doppler: "off",
  colorBox: { center: 0.5, width: 0.36, top: 40, bottom: 110 },
  scaleCmS: 30,
  colorGainDb: 0,
  colorInvert: false,
  gate: { a: 0, d: 70, lengthMm: 3 },
  timeMs: 0,
  pressure: 0,
};

export interface ImageBuffer {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

/** Mapping between image pixels and plane coordinates (a toward the marker, d depth). */
export interface ImageView {
  readonly width: number;
  readonly height: number;
  readonly mmPerPixel: number;
  /** Plane coordinate a at the left edge (x = 0). a decreases to the right. */
  readonly aLeft: number;
  /** Depth d at the top edge (y = 0). */
  readonly dTop: number;
}

export interface OrganView {
  /** Well-insonated area in the image, mm². */
  readonly areaMm2: number;
  /** Centre in plane coordinates, for labels. */
  readonly a: number;
  readonly d: number;
}

/** What the PW Doppler sample volume holds: the blood in it, for the spectral display. */
export interface GateSample {
  /** Per blood sample: its speed toward the probe as a fraction of the vessel's peak (cosine × laminar profile). */
  readonly toward: Float32Array;
  /** Per blood sample: index into VESSELS. */
  readonly kind: Uint8Array;
  /** Signal strength 0–1 (0 behind bone or gas). */
  readonly power: number;
  /** Angle between the beam and the mean flow in the gate (degrees, 0–90), or null with no flow. */
  readonly flowAngleDeg: number | null;
  /**
   * The flow's direction within the image plane, as a signed angle from the Doppler line (degrees),
   * or null: what an angle-correction cursor aligned with the vessel on screen would read.
   */
  readonly flowInPlaneDeg: number | null;
}

export interface RenderInfo {
  readonly geometry: ScanGeometry;
  readonly view: ImageView;
  readonly organs: Partial<Record<OrganKey, OrganView>>;
  /** Fraction of scanlines that made contact with the skin. */
  readonly contact: number;
  /** PW Doppler: the blood in the sample volume (null in other modes). */
  readonly gate: GateSample | null;
}

export function pixelToPlane(view: ImageView, x: number, y: number): { a: number; d: number } {
  return { a: view.aLeft - x * view.mmPerPixel, d: view.dTop + y * view.mmPerPixel };
}

export function planeToPixel(view: ImageView, a: number, d: number): { x: number; y: number } {
  return { x: (view.aLeft - a) / view.mmPerPixel, y: (d - view.dTop) / view.mmPerPixel };
}

/** Electronic noise amplitudes (Rayleigh, −68 dB), cycled through. */
const NOISE = (() => {
  const table = new Float32Array(4096);
  let state = 99;
  for (let i = 0; i < table.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const u = (state + 1) / 4294967297;
    table[i] = 0.0004 * Math.sqrt(-2 * Math.log(u));
  }
  return table;
})();

/**
 * Gray map: display level (0-1) to an opaque gray RGBA pixel. A gentle S-curve, like a scanner's
 * abdominal gray map: deep blacks for fluid, open mid-tones for parenchyma, a soft roll-off for bright echoes.
 */
export function grayLevel(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  const smooth = t * t * (3 - 2 * t);
  return Math.round(255 * Math.min(1, 0.7 * t ** 1.25 + 0.3 * smooth));
}

const GRAY32 = (() => {
  const table = new Uint32Array(1025);
  const little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  for (let i = 0; i <= 1024; i++) {
    const v = grayLevel(i / 1023);
    table[i] = little ? (0xff000000 | (v << 16) | (v << 8) | v) >>> 0 : ((v << 24) | (v << 16) | (v << 8) | 0xff) >>> 0;
  }
  return table;
})();

/** Layered textures of the abdominal wall: bright thin sheets at a regular depth spacing. */
interface LayerTexture {
  readonly periodMm: number;
  readonly widthMm: number;
  /** How far the sheets wander, in periods. */
  readonly warp: number;
  readonly base: number;
  readonly peak: number;
}
const LAYER_WARP_MM = 14;
const LAYERS: ReadonlyArray<LayerTexture | undefined> = (() => {
  const table: Array<LayerTexture | undefined> = new Array(256).fill(undefined);
  // Subcutaneous fat: dark lobules between bright fibrous septa.
  table[TISSUE.fat] = { periodMm: 4.5, widthMm: 0.45, warp: 1.8, base: 0.45, peak: 3.2 };
  // Muscle: fine bright perimysial striations along the fibres.
  table[TISSUE.muscle] = { periodMm: 1.6, widthMm: 0.28, warp: 0.9, base: 0.6, peak: 1.4 };
  return table;
})();

/** Share of the intensity-averaged echo, by speckle-reduction setting. */
const COMPOUND = [0, 0.55, 0.8, 0.95];
/** Weights along the beam for intensity averaging (about one axial speckle cell). */
const COMPOUND_AXIAL = [0.35, 0.75, 1, 0.75, 0.35];
/** Share of the edge-preserving (log-domain) filter in the output, by speckle-reduction setting. */
const SPECKLE_BLEND = [0, 0.3, 0.5, 0.7];
/** Share of the previous frame kept, by persistence setting. */
const PERSISTENCE = [0, 0.3, 0.5, 0.65];
/** Spatial weights along the beam (distance 0, 1, 2 samples). */
const AXIAL_TAPS = [1, 0.8, 0.45];
/** Range weight by level difference (in 1/512 units): speckle (a few dB) is smoothed, organ edges (tens of dB) stay sharp. */
const RANGE_WEIGHT = (() => {
  const table = new Float32Array(256);
  const sigma = 0.16;
  for (let i = 0; i < 256; i++) {
    const d = i / 512;
    table[i] = Math.exp(-(d * d) / (2 * sigma * sigma));
  }
  return table;
})();

/** Gas that firm pressure pushes aside: in bowel loops and the stomach (never the lung). */
const PUSHED_ASIDE: Uint8Array = (() => {
  const table = new Uint8Array(256);
  table[TISSUE.air] = 1;
  table[TISSUE.stomachGas] = 1;
  return table;
})();

/** Tissue classes that carry flowing blood (the flow field says how). */
const FLOWS: Uint8Array = (() => {
  const table = new Uint8Array(256);
  for (const t of [TISSUE.aorta, TISSUE.ivc, TISSUE.portalVein, TISSUE.liverVessel, TISSUE.iliacArtery, TISSUE.iliacVein]) table[t] = 1;
  return table;
})();
/** Colour is written only where the B-mode is darker than this (the vessel lumen): "write priority". */
const COLOR_PRIORITY = 0.62;
/** Weakest echo power shown as colour at 0 dB colour gain. */
const COLOR_THRESHOLD = 0.02;
/** The wall filter removes velocities slower than this fraction of the scale. */
const WALL_FILTER = 0.06;

/**
 * Colour map, index 1–255 (128 = zero velocity): red for flow toward the probe, blue for flow away
 * ("BART": blue away, red toward), brighter and warmer (yellow, cyan) toward the Nyquist limit.
 */
function colorTable(invert: boolean): Uint32Array {
  const table = new Uint32Array(256);
  const little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  for (let i = 1; i < 256; i++) {
    let v = (i - 128) / 127;
    if (invert) v = -v;
    const m = Math.min(1, Math.abs(v));
    let r: number;
    let g: number;
    let b: number;
    if (v >= 0) {
      r = 110 + 145 * Math.min(1, m * 1.6);
      g = m > 0.6 ? 230 * ((m - 0.6) / 0.4) ** 1.2 : 18 * m;
      b = m > 0.85 ? 80 * ((m - 0.85) / 0.15) : 10;
    } else {
      r = m > 0.75 ? 90 * ((m - 0.75) / 0.25) : 0;
      g = m > 0.45 ? 225 * ((m - 0.45) / 0.55) ** 1.1 : 25 * m;
      b = 120 + 135 * Math.min(1, m * 1.6);
    }
    const R = Math.round(Math.min(255, r));
    const G = Math.round(Math.min(255, g));
    const B = Math.round(Math.min(255, b));
    table[i] = little ? (0xff000000 | (B << 16) | (G << 8) | R) >>> 0 : ((R << 24) | (G << 16) | (B << 8) | 0xff) >>> 0;
  }
  return table;
}
const COLOR_TABLES = [colorTable(false), colorTable(true)];

/** The colour of a Doppler velocity (fraction of the scale, −1 to 1) as CSS, for scales and legends. */
export function dopplerColor(fraction: number, invert = false): string {
  const index = Math.max(1, Math.min(255, Math.round(128 + fraction * 127)));
  const v = COLOR_TABLES[invert ? 1 : 0][index];
  const little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  const [r, g, b] = little ? [v & 255, (v >>> 8) & 255, (v >>> 16) & 255] : [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255];
  return `rgb(${r}, ${g}, ${b})`;
}

/** Echo amplitude per unit of pressure reflection coefficient. */
const SPECULAR_GAIN = 12;
/** Reference level (dB re. amplitude 1) shown as full white. */
const TOP_DB = 24;
/** The machine's built-in depth compensation, dB per cm per MHz (round trip). */
const AUTO_TGC = 0.95;
const REVERB_ORDERS = 5;
/** Solid organs that lie on the diaphragm and show a mirror image beyond it. */
const MIRRORING: readonly boolean[] = (() => {
  const table = new Array<boolean>(256).fill(false);
  for (const t of [TISSUE.liver, TISSUE.liverVessel, TISSUE.spleen]) table[t] = true;
  return table;
})();
/** How far the face may sit above the skin (mm) and still couple, as if pressed in. */
const MAX_STANDOFF_MM = 60;
/** Just under the skin, "outside" samples are dithering artefacts or skin folds, not air. */
const SKIN_GRACE_MM = 5;

/**
 * Ray-traced B-mode ultrasound from a tissue-class volume.
 *
 * Each scanline is marched through the volume. Impedance changes reflect
 * (and take energy from the transmitted beam), every tissue attenuates and
 * scatters. Scattering is coherent (in-phase and quadrature components), so
 * after the beam's point-spread function is applied the envelope shows real,
 * fully developed speckle. Shadowing, posterior enhancement and reverberation
 * are not drawn: they emerge from these rules.
 */
export class UltrasoundSimulator {
  private readonly volume: ClassVolume;
  private readonly speckle: SpeckleField;
  private readonly impedance = new Float32Array(256);
  private readonly attenuation = new Float32Array(256);
  private readonly backscatter = new Float32Array(256);
  private readonly heterogeneity = new Float32Array(256);
  private readonly respiratory = new Uint8Array(256);
  private re = new Float32Array(0);
  private im = new Float32Array(0);
  private tmpRe = new Float32Array(0);
  private tmpIm = new Float32Array(0);
  private level = new Float32Array(0);
  /** Round-trip attenuation at each sample of the current line (for mirror images). */
  private lossAt = new Float32Array(0);
  private contact = new Uint8Array(0);
  private lutKey = "";
  /** Per output pixel: index of the top-left polar sample (-1 outside the image) and the two interpolation weights. */
  private lutIndex = new Int32Array(0);
  private lutWeights = new Float32Array(0);
  /** The previous frame's display levels, for persistence. */
  private previous = new Float32Array(0);
  private previousKey = "";
  /** True when this frame continues the last one (same geometry, no jump): persistence applies. */
  private continuous = false;
  private view: ImageView = { width: 0, height: 0, mmPerPixel: 1, aLeft: 0, dTop: 0 };
  private noiseState = 1;
  private readonly kernels = new Map<number, Float32Array>();
  /** Blood flow, for Doppler (set once it is built). */
  private flow: FlowField | null = null;
  /** Colour Doppler per polar sample: velocity toward the probe (cm/s) and echo power; then the colour index. */
  private dopV = new Float32Array(0);
  private dopP = new Float32Array(0);
  private dopIndex = new Uint8Array(0);
  /** Colour persistence: the last colour of each sample, and for how many more frames it may stay. */
  private dopLast = new Uint8Array(0);
  private dopHold = new Uint8Array(0);
  private random = 7;

  constructor(volume: ClassVolume, seed = 1234) {
    this.volume = volume;
    this.speckle = new SpeckleField(seed);
    this.setTissues([]);
  }

  /** Acoustic properties: the tissue table, with some tissues changed (a fatty liver, say). */
  setTissues(overrides: ReadonlyArray<{ readonly tissue: number; readonly props: Partial<TissueProps> }>): void {
    TISSUE_PROPS.forEach((p, id) => {
      const changed = overrides.find((o) => o.tissue === id)?.props;
      const q = changed ? { ...p, ...changed } : p;
      this.impedance[id] = q.impedance;
      this.attenuation[id] = q.attenuation;
      this.backscatter[id] = q.backscatter;
      this.heterogeneity[id] = q.heterogeneity;
      this.respiratory[id] = q.respiratory ? 1 : 0;
    });
  }

  /** Drop the blood flow (the anatomy changed: it is built again when Doppler next needs it). */
  clearFlow(): void {
    this.flow = null;
  }

  /** Give the simulator its blood flow (enables colour and PW Doppler). */
  setFlow(flow: FlowField): void {
    this.flow = flow;
  }

  get hasFlow(): boolean {
    return this.flow !== null;
  }

  render(frame: ProbeFrame, settings: ImageSettings, out: ImageBuffer): RenderInfo {
    const spec = PROBES[settings.probe];
    const samplesPerMm = Math.max(3, settings.frequencyMHz);
    const g = scanGeometry(spec, settings.depthMm, samplesPerMm);
    const n = g.lines * g.samples;
    if (this.re.length !== n) {
      this.re = new Float32Array(n);
      this.im = new Float32Array(n);
      this.tmpRe = new Float32Array(n);
      this.tmpIm = new Float32Array(n);
      this.level = new Float32Array(n);
      this.previous = new Float32Array(n);
      this.previousKey = "";
      this.dopV = new Float32Array(n);
      this.dopP = new Float32Array(n);
      this.dopIndex = new Uint8Array(n);
      this.dopLast = new Uint8Array(n);
      this.dopHold = new Uint8Array(n);
    }
    if (this.contact.length !== g.lines) this.contact = new Uint8Array(g.lines);
    if (this.lossAt.length !== g.samples) this.lossAt = new Float32Array(g.samples);
    const color = settings.doppler === "color" && this.flow !== null;
    const organs = this.acquire(frame, g, settings, color);
    this.beamProfile(g, settings);
    this.compress(g, settings);
    this.reduceSpeckle(g, settings.speckleReduction);
    this.persist(g, settings.persistence);
    if (color) this.colorFlow(g, settings);
    this.scanConvert(g, out, color ? settings.colorInvert : null);
    let contact = 0;
    for (let l = 0; l < g.lines; l++) contact += this.contact[l];
    const gate = settings.doppler === "pw" && this.flow ? this.sampleGate(frame, g, settings) : null;
    return { geometry: g, view: this.view, organs, contact: contact / g.lines, gate };
  }

  /** Scanline and sample ranges of the colour box. */
  private colorRange(g: ScanGeometry, box: ColorBox): { l0: number; l1: number; s0: number; s1: number } {
    const half = Math.max(0.02, box.width / 2);
    const l0 = Math.max(0, Math.round((box.center - half) * (g.lines - 1)));
    const l1 = Math.min(g.lines - 1, Math.round((box.center + half) * (g.lines - 1)));
    const top = Math.max(0, Math.min(box.top, box.bottom));
    const bottom = Math.min(g.depthMm, Math.max(box.top, box.bottom));
    return { l0, l1, s0: Math.round(top / g.sampleMm), s1: Math.min(g.samples - 1, Math.round(bottom / g.sampleMm)) };
  }

  /** The image ↔ plane mapping of the last render. */
  get lastView(): ImageView {
    return this.view;
  }

  /** Cast every scanline. Fills the complex echo arrays `re` / `im` (and, for colour Doppler, the blood velocities). */
  private acquire(frame: ProbeFrame, g: ScanGeometry, settings: ImageSettings, color: boolean): Partial<Record<OrganKey, OrganView>> {
    const { lines, samples, sampleMm } = g;
    const vol = this.volume;
    const [nx, ny, nz] = vol.dims;
    const isx = 1 / vol.spacing[0];
    const isy = 1 / vol.spacing[1];
    const isz = 1 / vol.spacing[2];
    const [ox, oy, oz] = vol.origin;
    const data = vol.data;
    const f = settings.frequencyMHz;
    // Breathing: per slice, how many slices higher the moving tissue shown there comes from.
    const shifts = withBreath(vol, settings.breath).breathShift ?? null;
    const sz = vol.spacing[2];
    // Graded compression: the face is already sunk into the wall (the frame); bowel gas within
    // reach of the pressure is pushed aside, and what is left there is collapsed bowel.
    const pressure = Math.max(0, Math.min(1, settings.pressure ?? 0));
    const clearSamples = pressure > 0 ? Math.round((pressure * PRESS_CLEAR_MM) / sampleMm) : 0;
    // A pressed face is in the wall: lines start at the face, not up to 10 mm in front of it.
    const searchFrom = -10 * (1 - pressure);
    const inverseFine = f / 1.0;
    const hazeDecay = Math.exp(-sampleMm / 9);
    const coarseCell = 3.5;
    const stepLoss = new Float32Array(256);
    for (let c = 0; c < 256; c++) stepLoss[c] = 10 ** ((-2 * this.attenuation[c] * f * (sampleMm / 10)) / 20);
    const imp = this.impedance;
    const back = this.backscatter;
    const het = this.heterogeneity;
    const resp = this.respiratory;
    const sre = this.speckle.re;
    const sim = this.speckle.im;
    const re = this.re;
    const im = this.im;
    const areaSum = new Float64Array(256);
    const areaA = new Float64Array(256);
    const areaD = new Float64Array(256);
    const lat = frame.lateral;
    const beam = frame.beam;
    const origin = frame.origin;
    const lineStride = 3;
    const sampleStride = 3;
    // Jitter of ±0.75 voxel, folded into rounding: index = floor(v + U[0,1.5) − 0.25).
    const jitterVoxel = 1.5 / 1024;
    // Colour Doppler: the box, and each vessel's speed at this moment of the cardiac cycle (cm/s).
    const flow = this.flow;
    const box = this.colorRange(g, settings.colorBox);
    const dopV = this.dopV;
    const dopP = this.dopP;
    if (color) dopP.fill(0);
    const phase = cardiacPhase(settings.timeMs);
    const speedNow = Float32Array.from(VESSELS, (kind) => PEAK_CM_S[kind] * waveform(kind, phase));

    const classAt = (x: number, y: number, z: number): number => {
      const i = Math.round((x - ox) * isx);
      const j = Math.round((y - oy) * isy);
      const k = Math.round((z - oz) * isz);
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return TISSUE.outside;
      const c0 = data[i + nx * (j + ny * k)];
      const shift = shifts ? shifts[k] : 0;
      if (shift === 0 || !resp[c0]) return c0;
      const ks = k + shift;
      const c1 = ks < nz ? data[i + nx * (j + ny * ks)] : TISSUE.outside;
      return resp[c1] ? c1 : c0;
    };

    for (let line = 0; line < lines; line++) {
      const sl = scanline(g, line);
      const dx = sl.da * lat[0] + sl.dd * beam[0];
      const dy = sl.da * lat[1] + sl.dd * beam[1];
      const dz = sl.da * lat[2] + sl.dd * beam[2];
      const faceX = origin[0] + sl.a * lat[0] + sl.d * beam[0];
      const faceY = origin[1] + sl.a * lat[1] + sl.d * beam[1];
      const faceZ = origin[2] + sl.a * lat[2] + sl.d * beam[2];
      const base = line * samples;
      const colorLine = color && flow !== null && line >= box.l0 && line <= box.l1;
      // The face conforms to the skin: start this line where it enters the body.
      let entry = Number.NaN;
      for (let t = searchFrom; t <= MAX_STANDOFF_MM; t += 0.5) {
        if (classAt(faceX + dx * t, faceY + dy * t, faceZ + dz * t) !== TISSUE.outside) {
          entry = t;
          break;
        }
      }
      if (Number.isNaN(entry)) {
        this.contact[line] = 0;
        re.fill(0, base, base + samples);
        im.fill(0, base, base + samples);
        continue;
      }
      this.contact[line] = 1;
      const counting = line % lineStride === 0;
      let x = faceX + dx * entry;
      let y = faceY + dy * entry;
      let z = faceZ + dz * entry;
      // Walk in voxel space; jitter is precomputed per half-millimetre cell.
      let vx = (x - ox) * isx;
      let vy = (y - oy) * isy;
      let vz = (z - oz) * isz;
      const svx = dx * sampleMm * isx;
      const svy = dy * sampleMm * isy;
      const svz = dz * sampleMm * isz;
      let fx = x * inverseFine;
      let fy = y * inverseFine;
      let fz = z * inverseFine;
      const sfx = dx * sampleMm * inverseFine;
      const sfy = dy * sampleMm * inverseFine;
      const sfz = dz * sampleMm * inverseFine;
      let transmission = 1;
      let loss = 1;
      let prevClass: number = TISSUE.outside;
      let prevZ = imp[TISSUE.outside];
      let reverbAt = -1;
      let reverbR = 0;
      let reverbLung = false;
      let mirrorAt = -1;
      let mirrorGain = 0;
      let haze = 0;
      let texture = 1;
      const lossAt = this.lossAt;
      for (let s = 0; s < samples; s++) {
        // Stable sub-voxel dithering softens the voxel staircase at organ boundaries.
        const h = hash3(Math.floor(x * 2), Math.floor(y * 2), Math.floor(z * 2));
        const i = (vx + (h & 1023) * jitterVoxel - 0.25) | 0;
        const j = (vy + ((h >>> 10) & 1023) * jitterVoxel - 0.25) | 0;
        const k = (vz + ((h >>> 20) & 1023) * jitterVoxel - 0.25) | 0;
        let c: number;
        // The voxel the tissue came from (tissue that moves with breathing comes from higher up),
        // and how far it moved (mm), so its speckle moves with it.
        let voxel = -1;
        let movedMm = 0;
        if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) {
          c = TISSUE.outside;
        } else {
          voxel = i + nx * (j + ny * k);
          const c0 = data[voxel];
          const shift = shifts ? shifts[k] : 0;
          if (shift === 0 || !resp[c0]) {
            c = c0;
          } else {
            const ks = k + shift;
            const moved = i + nx * (j + ny * ks);
            const c1 = ks < nz ? data[moved] : TISSUE.outside;
            if (resp[c1]) {
              c = c1;
              voxel = moved;
              movedMm = shift * sz;
            } else {
              c = c0;
            }
          }
        }
        if (s < clearSamples && PUSHED_ASIDE[c]) c = TISSUE.bowelWall;
        if (c === TISSUE.outside) {
          if (s * sampleMm >= SKIN_GRACE_MM) {
            // A grazing line at the edge of the face has left the body: nothing more comes back.
            re.fill(0, base + s, base + samples);
            im.fill(0, base + s, base + samples);
            break;
          }
          c = TISSUE.soft;
        }
        let echoRe = 0;
        let echoIm = 0;
        let boundary = 0;
        if (c !== prevClass) {
          const zc = imp[c];
          const r = (zc - prevZ) / (zc + prevZ);
          const R = r * r;
          // A boundary echo carries the energy that reached the boundary, before the boundary takes its share.
          const incident = transmission * loss;
          if (prevClass !== TISSUE.outside) {
            let cosine = this.incidence(x, y, z, dx, dy, dz, classAt);
            // Gas and bone surfaces are rough: they send echoes back from almost any angle.
            if (R > 0.9) cosine = Math.max(cosine, 0.55);
            else if (R > 0.3) cosine = Math.max(cosine, 0.35);
            boundary = SPECULAR_GAIN * Math.abs(r) * cosine * incident;
            if (R > 0.9 && reverbAt < 0 && mirrorAt < 0) {
              if (c === TISSUE.lung && MIRRORING[prevClass]) {
                // Liver or spleen on the diaphragm: the dome acts as a mirror and shows the organ again beyond it.
                mirrorAt = s;
                mirrorGain = 0.85 * cosine;
              } else {
                // Bowel gas, or lung under the chest wall: ring-down haze and reverberation (the "dirty" shadow).
                reverbAt = s;
                reverbR = R;
                reverbLung = c === TISSUE.lung;
                // About 20 dB below the gas echo: a gray, streaky shadow, darker than the tissue in front.
                haze = boundary * (reverbLung ? 0.05 : 0.09);
              }
            }
          } else {
            boundary = SPECULAR_GAIN * 0.05 * incident; // the skin line
          }
          transmission *= 1 - R;
          prevClass = c;
          prevZ = zc;
        }
        const bs = back[c];
        if (bs > 0) {
          // Tissue that moved with breathing carries its speckle with it.
          if ((s & 3) === 0) {
            const hv = het[c];
            texture = hv > 0 ? 1 + hv * (2 * this.speckle.coarseAt(x, y, z + movedMm, coarseCell) - 1) : 1;
            // The abdominal wall is layered: fibrous septa in the fat, striations in the muscle,
            // roughly parallel to the skin (so they follow the depth below the skin, wavily).
            const layer = LAYERS[c];
            if (layer) {
              const warp = this.speckle.coarseAt(x, y, z, LAYER_WARP_MM);
              const u = (s * sampleMm) / layer.periodMm + layer.warp * warp;
              const f = u - Math.floor(u);
              const away = Math.min(f, 1 - f) * layer.periodMm;
              texture *= layer.base + layer.peak * Math.exp(-((away / layer.widthMm) ** 2));
            }
          }
          const idx =
            (Math.floor(fx) & SPECKLE_MASK) +
            SPECKLE_SIZE * ((Math.floor(fy) & SPECKLE_MASK) + SPECKLE_SIZE * (Math.floor(fz + movedMm * inverseFine) & SPECKLE_MASK));
          const a = bs * texture;
          echoRe += a * sre[idx];
          echoIm += a * sim[idx];
        }
        const weight = transmission * loss;
        if (colorLine && FLOWS[c] && s >= box.s0 && s <= box.s1 && flow) {
          const slot = flowSlot(flow, voxel);
          if (slot >= 0) {
            const o = slot * 3;
            // Positive toward the probe: blood moving against the beam.
            const toward = -(flow.direction[o] * dx + flow.direction[o + 1] * dy + flow.direction[o + 2] * dz) / 127;
            dopV[base + s] = toward * (flow.profile[slot] / 255) * speedNow[flow.kind[slot]];
            dopP[base + s] = weight;
          }
        }
        let ringRe = 0;
        let ringIm = 0;
        if (haze > 1e-4) {
          const idx =
            (Math.floor(fx) & SPECKLE_MASK) +
            SPECKLE_SIZE * ((Math.floor(fy) & SPECKLE_MASK) + SPECKLE_SIZE * (Math.floor(fz) & SPECKLE_MASK));
          ringRe = haze * sre[idx];
          ringIm = haze * sim[idx];
          haze *= hazeDecay;
        }
        re[base + s] = echoRe * weight + boundary + ringRe;
        im[base + s] = echoIm * weight + ringIm;
        lossAt[s] = loss;
        loss *= stepLoss[c];

        if (counting && s % sampleStride === 0 && transmission > 0.2 && TISSUE_TO_ORGAN[c] !== null) {
          const t = s * sampleMm;
          const width = g.kind === "curvilinear" ? ((g.faceRadiusMm + t) * g.fovRad) / (lines - 1) : g.widthMm / (lines - 1);
          const cell = width * lineStride * sampleMm * sampleStride;
          areaSum[c] += cell;
          areaA[c] += (sl.a + sl.da * t) * cell;
          areaD[c] += (sl.d + sl.dd * t) * cell;
        }
        x += dx * sampleMm;
        y += dy * sampleMm;
        z += dz * sampleMm;
        vx += svx;
        vy += svy;
        vz += svz;
        fx += sfx;
        fy += sfy;
        fz += sfz;
      }
      // Mirror image: echoes reflected by the diaphragm appear as far beyond it as their source lies before it.
      // The mirrored path crosses the stretch between source and diaphragm twice more, so it loses that much more.
      if (mirrorAt > 0) {
        const limit = Math.min(samples, 2 * mirrorAt);
        for (let s = mirrorAt + 1; s < limit; s++) {
          const source = 2 * mirrorAt - s;
          const extra = lossAt[mirrorAt] / Math.max(1e-12, lossAt[source]);
          const m = mirrorGain * extra * extra;
          re[base + s] += re[base + source] * m;
          im[base + s] += im[base + source] * m;
        }
      }
      // Reverberation behind a strong near-field reflector (gas, bone): repeating, fading echoes.
      // Reverberation lines (A-lines) need a flat reflector: the pleura under the chest wall, not bubbly bowel gas.
      if (reverbAt > 0 && reverbLung && reverbAt * sampleMm < g.depthMm * 0.45) {
        let amp = Math.abs(re[base + reverbAt]) * 0.6;
        for (let order = 2; order <= REVERB_ORDERS; order++) {
          amp *= reverbR * 0.5;
          const at = reverbAt * order;
          if (at >= samples) break;
          re[base + at] += amp;
          if (at + 1 < samples) re[base + at + 1] += amp * 0.5;
          if (at > 0) re[base + at - 1] += amp * 0.5;
        }
      }
    }
    const totals = new Map<OrganKey, { area: number; a: number; d: number }>();
    for (let c = 0; c < 256; c++) {
      const organ = TISSUE_TO_ORGAN[c];
      if (!organ || areaSum[c] === 0) continue;
      const entry = totals.get(organ) ?? { area: 0, a: 0, d: 0 };
      entry.area += areaSum[c];
      entry.a += areaA[c];
      entry.d += areaD[c];
      totals.set(organ, entry);
    }
    const result: Partial<Record<OrganKey, OrganView>> = {};
    for (const [organ, entry] of totals) result[organ] = { areaMm2: entry.area, a: entry.a / entry.area, d: entry.d / entry.area };
    return result;
  }

  /** Specular strength by incidence: strongest when the beam meets a boundary head-on. */
  private incidence(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    classAt: (x: number, y: number, z: number) => number,
  ): number {
    const imp = this.impedance;
    // Central differences over one and two voxels: a smoother normal than the voxel staircase.
    const h = this.volume.spacing[0];
    const h2 = 2 * h;
    const gx = imp[classAt(x + h, y, z)] - imp[classAt(x - h, y, z)] + imp[classAt(x + h2, y, z)] - imp[classAt(x - h2, y, z)];
    const gy = imp[classAt(x, y + h, z)] - imp[classAt(x, y - h, z)] + imp[classAt(x, y + h2, z)] - imp[classAt(x, y - h2, z)];
    const gz = imp[classAt(x, y, z + h)] - imp[classAt(x, y, z - h)] + imp[classAt(x, y, z + h2)] - imp[classAt(x, y, z - h2)];
    const n = Math.hypot(gx, gy, gz);
    if (n < 1e-6) return 0.5;
    const cos = Math.abs(gx * dx + gy * dy + gz * dz) / n;
    return 0.12 + 0.88 * cos * cos;
  }

  /** Energy-normalised Gaussian (Σw² = 1), cached by σ in tenths. */
  private kernel(sigma: number): Float32Array {
    const key = Math.round(Math.max(0, sigma) * 10);
    let k = this.kernels.get(key);
    if (k) return k;
    const s = key / 10;
    if (s < 0.3) {
      k = Float32Array.of(1);
    } else {
      const radius = Math.max(1, Math.ceil(s * 2.5));
      k = new Float32Array(radius * 2 + 1);
      let energy = 0;
      for (let i = -radius; i <= radius; i++) {
        const w = Math.exp(-(i * i) / (2 * s * s));
        k[i + radius] = w;
        energy += w * w;
      }
      const norm = 1 / Math.sqrt(energy);
      for (let i = 0; i < k.length; i++) k[i] *= norm;
    }
    this.kernels.set(key, k);
    return k;
  }

  /** The beam's point-spread function: short pulse axially, focus-dependent width laterally. Coherent. */
  private beamProfile(g: ScanGeometry, settings: ImageSettings): void {
    const { lines, samples, sampleMm } = g;
    const lambda = 1.54 / settings.frequencyMHz;
    // Axial: along each line, re/im → tmp.
    const axial = this.kernel((0.7 * lambda) / sampleMm);
    const ar = (axial.length - 1) / 2;
    const { re, im, tmpRe, tmpIm } = this;
    for (let l = 0; l < lines; l++) {
      const base = l * samples;
      for (let s = 0; s < samples; s++) {
        let accRe = 0;
        let accIm = 0;
        const lo = Math.max(0, s - ar);
        const hi = Math.min(samples - 1, s + ar);
        for (let q = lo; q <= hi; q++) {
          const w = axial[q - s + ar];
          accRe += re[base + q] * w;
          accIm += im[base + q] * w;
        }
        tmpRe[base + s] = accRe;
        tmpIm[base + s] = accIm;
      }
    }
    // Lateral: across lines, tmp → re/im.
    const scale = 3.5 / settings.frequencyMHz;
    for (let s = 0; s < samples; s++) {
      const depth = s * sampleMm;
      // Gaussian-beam width: narrowest at the focus, widening over a Rayleigh range of ~30 mm.
      const away = (depth - settings.focusMm) / 30;
      const beamMm = 0.45 * scale * Math.sqrt(1 + away * away) + 0.1;
      const spacing = g.kind === "curvilinear" ? ((g.faceRadiusMm + depth) * g.fovRad) / (lines - 1) : g.widthMm / (lines - 1);
      const kernel = this.kernel(Math.min(8, beamMm / spacing));
      const kr = (kernel.length - 1) / 2;
      for (let l = 0; l < lines; l++) {
        let accRe = 0;
        let accIm = 0;
        const lo = Math.max(0, l - kr);
        const hi = Math.min(lines - 1, l + kr);
        for (let q = lo; q <= hi; q++) {
          const w = kernel[q - l + kr];
          accRe += tmpRe[q * samples + s] * w;
          accIm += tmpIm[q * samples + s] * w;
        }
        re[l * samples + s] = accRe;
        im[l * samples + s] = accIm;
      }
    }
  }

  /** Envelope, gain, TGC, noise and log compression → display levels 0–1. */
  private compress(g: ScanGeometry, settings: ImageSettings): void {
    const { lines, samples, sampleMm } = g;
    const { re, im, level, tmpRe: intensity, tmpIm: smoothed } = this;
    // Echo intensity, averaged over about one speckle cell when speckle reduction is on. Like spatial
    // compounding, averaging intensity (not log values) fills the deep speckle nulls without blurring edges much.
    const compound = COMPOUND[Math.max(0, Math.min(3, Math.round(settings.speckleReduction)))];
    for (let i = 0; i < intensity.length; i++) intensity[i] = re[i] * re[i] + im[i] * im[i];
    if (compound > 0) {
      for (let l = 0; l < lines; l++) {
        const base = l * samples;
        for (let s = 0; s < samples; s++) {
          let sum = 0;
          let weight = 0;
          for (let d = -2; d <= 2; d++) {
            const q = s + d;
            if (q < 0 || q >= samples) continue;
            const w = COMPOUND_AXIAL[d + 2];
            sum += intensity[base + q] * w;
            weight += w;
          }
          smoothed[base + s] = sum / weight;
        }
      }
      for (let l = 0; l < lines; l++) {
        const base = l * samples;
        const up = l > 0 ? base - samples : base;
        const down = l + 1 < lines ? base + samples : base;
        for (let s = 0; s < samples; s++) {
          const lateral = 0.25 * smoothed[up + s] + 0.5 * smoothed[base + s] + 0.25 * smoothed[down + s];
          intensity[base + s] = intensity[base + s] * (1 - compound) + lateral * compound;
        }
      }
    }
    const dr = Math.max(10, settings.dynamicRangeDb);
    const floor = TOP_DB - dr;
    const tgc = settings.tgcDb;
    const auto = (AUTO_TGC * settings.frequencyMHz) / 10;
    const gains = new Float32Array(samples);
    for (let s = 0; s < samples; s++) {
      const depth = s * sampleMm;
      const u = Math.min(tgc.length - 1, Math.max(0, (depth / g.depthMm) * (tgc.length - 1)));
      const i0 = Math.floor(u);
      const i1 = Math.min(tgc.length - 1, i0 + 1);
      const user = tgc[i0] * (1 - (u - i0)) + tgc[i1] * (u - i0);
      gains[s] = settings.gainDb + user + auto * depth;
    }
    for (let l = 0; l < lines; l++) {
      const base = l * samples;
      if (!this.contact[l]) {
        level.fill(0, base, base + samples);
        continue;
      }
      for (let s = 0; s < samples; s++) {
        let amp = Math.sqrt(intensity[base + s]);
        if (settings.noise) {
          this.noiseState = (this.noiseState + 1) & 4095;
          amp += NOISE[this.noiseState];
        }
        const db = 20 * Math.log10(amp + 1e-7) + gains[s];
        const v = (db - floor) / dr;
        level[base + s] = v <= 0 ? 0 : v >= 1 ? 1 : v;
      }
    }
  }

  /**
   * Edge-preserving speckle reduction on the log-compressed image: a separable bilateral filter
   * (two samples along the beam, one line across), blended with the original image.
   */
  private reduceSpeckle(g: ScanGeometry, strength: number): void {
    const amount = SPECKLE_BLEND[Math.max(0, Math.min(3, Math.round(strength)))];
    if (amount === 0) return;
    const { lines, samples } = g;
    const { level, tmpRe: pass } = this;
    // Along each line: two samples either side.
    for (let l = 0; l < lines; l++) {
      const base = l * samples;
      for (let s = 0; s < samples; s++) {
        const v = level[base + s];
        let sum = v;
        let weight = 1;
        for (let d = -2; d <= 2; d++) {
          if (d === 0) continue;
          const q = s + d;
          if (q < 0 || q >= samples) continue;
          const u = level[base + q];
          const w = AXIAL_TAPS[d < 0 ? -d : d] * RANGE_WEIGHT[Math.min(255, (Math.abs(u - v) * 512) | 0)];
          sum += u * w;
          weight += w;
        }
        pass[base + s] = sum / weight;
      }
    }
    // Across lines: one line either side, then blend with the original.
    for (let l = 0; l < lines; l++) {
      const base = l * samples;
      const up = l > 0 ? base - samples : -1;
      const down = l + 1 < lines ? base + samples : -1;
      for (let s = 0; s < samples; s++) {
        const v = pass[base + s];
        let sum = v;
        let weight = 1;
        if (up >= 0) {
          const u = pass[up + s];
          const w = 0.6 * RANGE_WEIGHT[Math.min(255, (Math.abs(u - v) * 512) | 0)];
          sum += u * w;
          weight += w;
        }
        if (down >= 0) {
          const u = pass[down + s];
          const w = 0.6 * RANGE_WEIGHT[Math.min(255, (Math.abs(u - v) * 512) | 0)];
          sum += u * w;
          weight += w;
        }
        level[base + s] = level[base + s] * (1 - amount) + (sum / weight) * amount;
      }
    }
  }

  /**
   * Colour Doppler, from the blood velocities found while casting the lines: spatial smoothing (as
   * scanners do), depth-compensated power against the colour gain, estimation noise, the wall filter
   * and aliasing beyond the Nyquist limit. The result is a colour index per polar sample (0 = none).
   */
  private colorFlow(g: ScanGeometry, settings: ImageSettings): void {
    const { samples, sampleMm } = g;
    const box = this.colorRange(g, settings.colorBox);
    const { dopV, dopP, dopIndex } = this;
    dopIndex.fill(0);
    const nyquist = Math.max(1, settings.scaleCmS);
    const gain = 10 ** (settings.colorGainDb / 20);
    const auto = (AUTO_TGC * settings.frequencyMHz) / 10;
    const noisy = settings.noise;
    const axialTaps = Math.max(2, Math.round(1.7 / sampleMm));
    // Above +6 dB of colour gain, noise starts to paint random colour in tissue.
    const flecks = noisy ? Math.max(0, Math.min(0.05, ((settings.colorGainDb - 6) / 14) * 0.05)) : 0;
    for (let l = box.l0; l <= box.l1; l++) {
      if (!this.contact[l]) continue;
      for (let s = box.s0; s <= box.s1; s++) {
        const q = l * samples + s;
        if (dopP[q] <= 0) {
          if (flecks > 0 && this.uniform() < flecks) dopIndex[q] = 1 + Math.floor(this.uniform() * 255);
          continue;
        }
        // Colour Doppler resolves less finely than B-mode (longer pulses, fewer lines): average the
        // velocity over about two lines and ±1.7 mm of depth, weighted by echo power.
        let v = 0;
        let p = 0;
        let count = 0;
        for (let dl = -2; dl <= 2; dl++) {
          const ll = l + dl;
          if (ll < box.l0 || ll > box.l1) continue;
          for (let ds = -axialTaps; ds <= axialTaps; ds++) {
            const ss = s + ds;
            if (ss < box.s0 || ss > box.s1) continue;
            const r = ll * samples + ss;
            const w = dopP[r];
            if (w <= 0) continue;
            v += dopV[r] * w;
            p += w;
            count++;
          }
        }
        v /= p;
        p /= count;
        // Depth-compensated power, like the B-mode's built-in TGC.
        const strength = p * 10 ** ((auto * s * sampleMm) / 20) * gain;
        if (strength < COLOR_THRESHOLD) continue;
        // Estimation noise: small for strong signals, larger near the colour threshold.
        if (noisy) v += nyquist * (0.02 + 0.06 * Math.min(1, COLOR_THRESHOLD / strength)) * this.gaussian();
        if (Math.abs(v) < WALL_FILTER * nyquist) continue;
        // Aliasing: beyond ±Nyquist the estimate wraps to the other side.
        const wrapped = ((((v + nyquist) % (2 * nyquist)) + 2 * nyquist) % (2 * nyquist)) - nyquist;
        dopIndex[q] = Math.max(1, Math.min(255, Math.round(128 + (wrapped / nyquist) * 127)));
      }
    }
    // Colour persistence, as on scanners: colour lingers for two frames, which steadies pulsatile flow.
    const { dopLast, dopHold } = this;
    const fresh = !this.continuous;
    for (let l = box.l0; l <= box.l1; l++) {
      for (let s = box.s0; s <= box.s1; s++) {
        const q = l * samples + s;
        if (fresh) dopHold[q] = 0;
        if (dopIndex[q] !== 0) {
          dopLast[q] = dopIndex[q];
          dopHold[q] = 2;
        } else if (dopHold[q] > 0) {
          dopIndex[q] = dopLast[q];
          dopHold[q]--;
        }
      }
    }
  }

  private uniform(): number {
    this.random = (Math.imul(this.random, 1664525) + 1013904223) >>> 0;
    return this.random / 4294967296;
  }

  private gaussian(): number {
    return (this.uniform() + this.uniform() + this.uniform() + this.uniform() - 2) * 1.7;
  }

  /**
   * PW Doppler: the blood inside the sample volume, along the Doppler line (for a curvilinear probe,
   * the scanline through the gate). Its speeds over the cardiac cycle make the spectrum.
   */
  private sampleGate(frame: ProbeFrame, g: ScanGeometry, settings: ImageSettings): GateSample {
    const flow = this.flow as FlowField;
    const volume = this.volume;
    const { a, d, lengthMm } = settings.gate;
    const r = g.kind === "curvilinear" ? g.faceRadiusMm : 0;
    // Direction of the Doppler line in the plane, then in the world.
    let da = 0;
    let dd = 1;
    if (g.kind === "curvilinear") {
      const n = Math.hypot(a, d + r) || 1;
      da = a / n;
      dd = (d + r) / n;
    }
    const lat = frame.lateral;
    const beam = frame.beam;
    const el = frame.elevation;
    const dir = [lat[0] * da + beam[0] * dd, lat[1] * da + beam[1] * dd, lat[2] * da + beam[2] * dd];
    const moved = withBreath(volume, settings.breath);
    const [nx, ny, nz] = volume.dims;
    const voxelOf = (p: readonly number[]): number => {
      const i = Math.round((p[0] - volume.origin[0]) / volume.spacing[0]);
      const j = Math.round((p[1] - volume.origin[1]) / volume.spacing[1]);
      const k = Math.round((p[2] - volume.origin[2]) / volume.spacing[2]);
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1;
      return movedIndex(moved, i, j, k);
    };
    // Is the path from the face to the gate open? Bone, lung and gas stop the Doppler signal too.
    let power = 1;
    const centre = planeToWorld(frame, a, d);
    const start = g.kind === "curvilinear" ? planeToWorld(frame, da * r, -r + dd * r) : planeToWorld(frame, a, 0);
    const pathMm = Math.hypot(centre[0] - start[0], centre[1] - start[1], centre[2] - start[2]);
    for (let t = 2; t < pathMm; t += 1) {
      const v = voxelOf([start[0] + dir[0] * t, start[1] + dir[1] * t, start[2] + dir[2] * t]);
      if (v < 0) continue;
      const c = volume.data[v];
      if (c === TISSUE.bone || c === TISSUE.lung || c === TISSUE.air || c === TISSUE.stomachGas || c === TISSUE.stone) {
        power = 0.03;
        break;
      }
    }
    const toward: number[] = [];
    const kinds: number[] = [];
    let mx = 0;
    let my = 0;
    let mz = 0;
    const half = Math.max(0.5, lengthMm / 2);
    // Along the beam over the gate length, and across the beam's width and slice thickness.
    for (let t = -half; t <= half + 1e-6; t += 0.5) {
      for (const u of [-0.8, 0, 0.8]) {
        for (const w of [-1.2, 0, 1.2]) {
          const p = [
            centre[0] + dir[0] * t + lat[0] * u + el[0] * w,
            centre[1] + dir[1] * t + lat[1] * u + el[1] * w,
            centre[2] + dir[2] * t + lat[2] * u + el[2] * w,
          ];
          const v = voxelOf(p);
          if (v < 0) continue;
          const c = volume.data[v];
          if (!FLOWS[c]) continue;
          const slot = flowSlot(flow, v);
          if (slot < 0) continue;
          const o = slot * 3;
          const fx = flow.direction[o] / 127;
          const fy = flow.direction[o + 1] / 127;
          const fz = flow.direction[o + 2] / 127;
          toward.push(-(fx * dir[0] + fy * dir[1] + fz * dir[2]) * (flow.profile[slot] / 255));
          kinds.push(flow.kind[slot]);
          mx += fx;
          my += fy;
          mz += fz;
        }
      }
    }
    const length = Math.hypot(mx, my, mz);
    const flowAngleDeg =
      length > 1e-6 ? (Math.acos(Math.min(1, Math.abs((mx * dir[0] + my * dir[1] + mz * dir[2]) / length))) * 180) / Math.PI : null;
    // In the plane: the flow's components along the face (a) and the beam (d), against the Doppler line.
    const fa = mx * lat[0] + my * lat[1] + mz * lat[2];
    const fd = mx * beam[0] + my * beam[1] + mz * beam[2];
    let flowInPlaneDeg: number | null = null;
    if (Math.hypot(fa, fd) > 1e-6 * Math.max(1, length)) {
      // The cursor is a line, not an arrow: fold the angle into −90°…90°.
      let angle = (Math.atan2(fa * dd - fd * da, fa * da + fd * dd) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      flowInPlaneDeg = angle;
    }
    return { toward: Float32Array.from(toward), kind: Uint8Array.from(kinds), power, flowAngleDeg, flowInPlaneDeg };
  }

  /** Average with the previous frame (same geometry only). */
  private persist(g: ScanGeometry, setting: number): void {
    const keep = PERSISTENCE[Math.max(0, Math.min(3, Math.round(setting)))];
    const key = [g.kind, g.lines, g.samples, g.depthMm].join("|");
    const { level, previous } = this;
    this.continuous = key === this.previousKey;
    if (keep > 0 && this.continuous) {
      for (let i = 0; i < level.length; i++) level[i] = level[i] * (1 - keep) + previous[i] * keep;
    }
    previous.set(level);
    this.previousKey = key;
  }

  /** Forget the previous frame (after a jump: a new task, a new probe). */
  resetPersistence(): void {
    this.previousKey = "";
  }

  /** Polar display levels → Cartesian RGBA image, with colour Doppler on top when `invert` is not null. */
  private scanConvert(g: ScanGeometry, out: ImageBuffer, invert: boolean | null): void {
    const { width, height } = out;
    const key = [g.kind, g.lines, g.samples, g.depthMm, width, height].join("|");
    if (key !== this.lutKey) this.buildLut(g, width, height, key);
    const { lutIndex, lutWeights, level } = this;
    const samples = g.samples;
    const pixels = new Uint32Array(out.rgba.buffer, out.rgba.byteOffset, width * height);
    const black = GRAY32[0];
    for (let p = 0; p < width * height; p++) {
      const i = lutIndex[p];
      if (i < 0) {
        pixels[p] = black;
        continue;
      }
      const ts = lutWeights[p * 2];
      const tl = lutWeights[p * 2 + 1];
      const v = (level[i] * (1 - ts) + level[i + 1] * ts) * (1 - tl) + (level[i + samples] * (1 - ts) + level[i + samples + 1] * ts) * tl;
      pixels[p] = GRAY32[(v * 1023) | 0];
    }
    if (invert === null) return;
    // Colour where there is flow and the B-mode is dark (the lumen), nearest sample: aliasing edges stay sharp.
    const colors = COLOR_TABLES[invert ? 1 : 0];
    const index = this.dopIndex;
    for (let p = 0; p < width * height; p++) {
      const i = lutIndex[p];
      if (i < 0) continue;
      const q = i + (lutWeights[p * 2] > 0.5 ? 1 : 0) + (lutWeights[p * 2 + 1] > 0.5 ? samples : 0);
      const c = index[q];
      if (c === 0 || level[q] > COLOR_PRIORITY) continue;
      pixels[p] = colors[c];
    }
  }

  private buildLut(g: ScanGeometry, width: number, height: number, key: string): void {
    const extent = planeExtent(g);
    const margin = 0.02;
    const mm = Math.max((extent.aMax - extent.aMin) / (width * (1 - margin)), (extent.dMax - extent.dMin) / (height * (1 - margin)));
    const aCenter = (extent.aMax + extent.aMin) / 2;
    this.view = {
      width,
      height,
      mmPerPixel: mm,
      aLeft: aCenter + (width * mm) / 2,
      dTop: extent.dMin - height * mm * margin * 0.5,
    };
    this.lutIndex = new Int32Array(width * height);
    this.lutWeights = new Float32Array(width * height * 2);
    const { lines, samples } = g;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const { a, d } = pixelToPlane(this.view, x + 0.5, y + 0.5);
        const polar = planeToPolar(g, a, d);
        if (!polar) {
          this.lutIndex[p] = -1;
          continue;
        }
        // Clamp so that the 2x2 neighbourhood stays inside the data.
        const line = Math.min(polar.line, lines - 1.0001);
        const sample = Math.min(polar.sample, samples - 1.0001);
        const l0 = Math.floor(line);
        const s0 = Math.floor(sample);
        this.lutIndex[p] = l0 * samples + s0;
        this.lutWeights[p * 2] = sample - s0;
        this.lutWeights[p * 2 + 1] = line - l0;
      }
    }
    this.lutKey = key;
  }
}
