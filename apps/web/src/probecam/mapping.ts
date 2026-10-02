import { clamp, cross, dot, normalize, type ProbePose, type SkinSurface, type Vec3, wrapDeg } from "@insonate/sono-engine";
import type { MarkerObservation } from "./tracker";

/**
 * The marker as the user feels it, in the mirrored preview: x to the user's right, y up (mm),
 * roll anticlockwise, and the two tilts of the face that become fanning and rocking (degrees).
 */
export interface MarkerReading {
  readonly x: number;
  readonly y: number;
  readonly roll: number;
  readonly fan: number;
  readonly rock: number;
}

const DEG = 180 / Math.PI;

export function readMarker(observation: MarkerObservation): MarkerReading {
  const r = observation.rotation;
  return {
    // The preview is a mirror: the camera's x runs the other way for the user.
    x: -observation.position[0],
    y: observation.position[1],
    roll: -Math.atan2(r[1][0], r[0][0]) * DEG,
    // Direction of the camera seen from the marker: how far the face is tipped about its own axes.
    fan: Math.atan2(r[2][1], r[2][2]) * DEG,
    rock: -Math.atan2(r[2][0], r[2][2]) * DEG,
  };
}

/** Screen directions of the 3D view, in world coordinates. */
export interface ViewAxes {
  readonly right: Vec3;
  readonly up: Vec3;
}

/** Looking at the patient from the front, head up: the patient's left is on the right. */
export const FRONT_AXES: ViewAxes = { right: [-1, 0, 0], up: [0, 0, 1] };

/**
 * One-Euro filter (Casiez et al., CHI 2012): smooths jitter when the hand is still,
 * follows quickly when it moves.
 */
export class OneEuro {
  private value: number | null = null;
  private slope = 0;
  private time = 0;

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.03,
    private readonly slopeCutoff = 1,
  ) {}

  reset(): void {
    this.value = null;
  }

  filter(x: number, timeMs: number): number {
    if (this.value === null) {
      this.value = x;
      this.slope = 0;
      this.time = timeMs;
      return x;
    }
    const dt = Math.max(1e-3, (timeMs - this.time) / 1000);
    this.time = timeMs;
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const slope = (x - this.value) / dt;
    this.slope += alpha(this.slopeCutoff) * (slope - this.slope);
    this.value += alpha(this.minCutoff + this.beta * Math.abs(this.slope)) * (x - this.value);
    return this.value;
  }
}

export interface MapperOptions {
  /** Millimetres the probe slides per millimetre the marker moves. */
  readonly slideGain: number;
  /** Degrees the probe turns or tilts per degree of the marker. */
  readonly angleGain: number;
}

export const DEFAULT_MAPPER: MapperOptions = { slideGain: 1.5, angleGain: 1 };

/** A marker jump bigger than this between frames is a new grip, not a movement. */
const JUMP_MM = 40;

/**
 * Turns marker movements into probe movements. Slides are relative, like a mouse: moving the
 * marker slides the probe the same way on screen. Angles are relative to how the marker was held
 * when it was found, so losing and finding it again never makes the probe jump.
 */
export class ProbeCamMapper {
  private readonly options: MapperOptions;
  private readonly filters = { x: new OneEuro(), y: new OneEuro(), roll: new OneEuro(), fan: new OneEuro(), rock: new OneEuro() };
  private anchor: { reading: MarkerReading; pose: ProbePose } | null = null;
  private last: MarkerReading | null = null;
  /** Roll unwrapped across ±180°. */
  private roll = 0;
  private rawRoll: number | null = null;

  constructor(options: MapperOptions = DEFAULT_MAPPER) {
    this.options = options;
  }

  /** Forget the grip: the next sighting becomes the new reference. */
  reset(): void {
    this.anchor = null;
    this.last = null;
    this.rawRoll = null;
    for (const f of Object.values(this.filters)) f.reset();
  }

  /** The probe pose for a new reading, or null while (re)gripping. */
  update(raw: MarkerReading, timeMs: number, pose: ProbePose, skin: SkinSurface, axes: ViewAxes): ProbePose | null {
    if (this.last && Math.hypot(raw.x - this.last.x, raw.y - this.last.y) > JUMP_MM) this.reset();
    this.roll = this.rawRoll === null ? raw.roll : this.roll + wrapDeg(raw.roll - this.rawRoll);
    this.rawRoll = raw.roll;
    const reading: MarkerReading = {
      x: this.filters.x.filter(raw.x, timeMs),
      y: this.filters.y.filter(raw.y, timeMs),
      roll: this.filters.roll.filter(this.roll, timeMs),
      fan: this.filters.fan.filter(raw.fan, timeMs),
      rock: this.filters.rock.filter(raw.rock, timeMs),
    };
    const last = this.last;
    this.last = reading;
    if (!this.anchor || !last) {
      this.anchor = { reading, pose };
      return null;
    }
    const { slideGain, angleGain } = this.options;
    // Slide: the screen movement, carried onto the skin under the probe.
    const dx = (reading.x - last.x) * slideGain;
    const dy = (reading.y - last.y) * slideGain;
    const move: Vec3 = [axes.right[0] * dx + axes.up[0] * dy, axes.right[1] * dx + axes.up[1] * dy, axes.right[2] * dx + axes.up[2] * dy];
    const point = skin.at(pose.phiDeg, pose.zMm);
    const around = normalize(cross(point.normal, point.towardHead));
    const zMm = pose.zMm + dot(move, point.towardHead);
    const phiDeg = pose.phiDeg + dot(move, around) / skin.mmPerDegree(pose.phiDeg, pose.zMm);
    const { reading: start, pose: from } = this.anchor;
    return {
      phiDeg,
      zMm,
      rotationDeg: from.rotationDeg + (reading.roll - start.roll) * angleGain,
      tiltDeg: clamp(from.tiltDeg + (reading.fan - start.fan) * angleGain, -60, 60),
      rockDeg: clamp(from.rockDeg + (reading.rock - start.rock) * angleGain, -40, 40),
    };
  }
}
