import { type CSSProperties, type ReactNode, useEffect, useMemo } from "react";
import { useT } from "../i18n";
import { useController } from "../sim/context";
import { MOVE_KEYS, PRESS_KEY } from "../sim/keyboard";
import { type Move, movePose, QUICK_POSITIONS } from "../sim/pose";
import { locateProbe } from "../sim/where";
import { useSono } from "../state/store";
import { ArrowIcon, CameraIcon, FanIcon, PressIcon, RockIcon, RotateIcon } from "./icons";

/** A button that moves the probe while held (a tap nudges), with its keyboard key in the corner. */
function HoldButton({ move, label, children }: { move: Move; label: string; children: ReactNode }) {
  const controller = useController();
  const source = `pad:${move}`;
  const release = () => controller.drive.release(source);
  // Stop if the button unmounts while held.
  useEffect(() => () => controller.drive.release(source), [controller, source]);
  return (
    <button
      type="button"
      className="pad-btn"
      aria-label={label}
      title={label}
      aria-keyshortcuts={MOVE_KEYS[move]}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        controller.drive.press(source, move, event.shiftKey);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!useSono.getState().frozen) controller.setPose(movePose(useSono.getState().pose, move, controller.skin, event.shiftKey));
        }
      }}
    >
      {children}
      <span className="pad-key" aria-hidden="true">
        {MOVE_KEYS[move]}
      </span>
    </button>
  );
}

/**
 * Press the probe in while held (graded compression), as X does: the pressure builds up over half a
 * second and eases off on release. The meter shows how hard the probe is pressed.
 */
function PressButton() {
  const controller = useController();
  const pressure = useSono((s) => s.settings.pressure);
  const t = useT();
  const source = "pad:press";
  const release = () => controller.drive.pressOut(source);
  useEffect(() => () => controller.drive.pressOut(source), [controller]);
  const key = PRESS_KEY.replace("Key", "");
  return (
    <button
      type="button"
      className={`pad-btn pad-press${pressure > 0.02 ? " is-pressing" : ""}`}
      aria-label={t.pad.pressLabel}
      title={t.pad.pressLabel}
      aria-keyshortcuts={key}
      style={{ "--pressure": pressure } as CSSProperties}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        controller.drive.pressIn(source);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          controller.drive.pressIn(source);
        }
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") release();
      }}
      onBlur={release}
    >
      <span className="pad-meter" aria-hidden="true" />
      <PressIcon size={17} />
      <span className="pad-key" aria-hidden="true">
        {key}
      </span>
    </button>
  );
}

export function ProbePad() {
  const controller = useController();
  const pose = useSono((s) => s.pose);
  const probeCam = useSono((s) => s.probeCam);
  const setProbeCam = useSono((s) => s.setProbeCam);
  const t = useT();
  return (
    <section className="card pad" aria-label={t.pad.region} dir="ltr">
      <div className="pad-group">
        <span className="pad-title">{t.pad.slide}</span>
        <div className="pad-cross">
          <HoldButton move="head" label={t.pad.moves.head}>
            <ArrowIcon direction="up" />
          </HoldButton>
          <HoldButton move="around-right" label={t.pad.moves.aroundRight}>
            <ArrowIcon direction="left" />
          </HoldButton>
          <HoldButton move="around-left" label={t.pad.moves.aroundLeft}>
            <ArrowIcon direction="right" />
          </HoldButton>
          <HoldButton move="feet" label={t.pad.moves.feet}>
            <ArrowIcon direction="down" />
          </HoldButton>
        </div>
      </div>
      <div className="pad-group">
        <span className="pad-title">{t.pad.rotate}</span>
        <div className="pad-pair">
          <HoldButton move="rotate-ccw" label={t.pad.moves.rotateCcw}>
            <RotateIcon clockwise={false} />
          </HoldButton>
          <HoldButton move="rotate-cw" label={t.pad.moves.rotateCw}>
            <RotateIcon clockwise />
          </HoldButton>
        </div>
        <span className="pad-value">{Math.round(pose.rotationDeg)}°</span>
      </div>
      <div className="pad-group">
        <span className="pad-title">{t.pad.fan}</span>
        <div className="pad-pair">
          <HoldButton move="fan-up" label={t.pad.moves.fanUp}>
            <FanIcon up />
          </HoldButton>
          <HoldButton move="fan-down" label={t.pad.moves.fanDown}>
            <FanIcon up={false} />
          </HoldButton>
        </div>
        <span className="pad-value">{Math.round(pose.tiltDeg)}°</span>
      </div>
      <div className="pad-group">
        <span className="pad-title">{t.pad.rock}</span>
        <div className="pad-pair">
          <HoldButton move="rock-marker" label={t.pad.moves.rockMarker}>
            <RockIcon toMarker />
          </HoldButton>
          <HoldButton move="rock-away" label={t.pad.moves.rockAway}>
            <RockIcon toMarker={false} />
          </HoldButton>
        </div>
        <span className="pad-value">{Math.round(pose.rockDeg)}°</span>
      </div>
      <div className="pad-group">
        <span className="pad-title">{t.pad.press}</span>
        <PressButton />
        <PressValue />
      </div>
      <div className="pad-group pad-positions">
        <span className="pad-title">{t.pad.startFrom}</span>
        <select
          className="select"
          aria-label={t.pad.positionsLabel}
          value=""
          onChange={(event) => {
            const position = QUICK_POSITIONS.find((p) => p.id === event.target.value);
            if (position) controller.animateTo(position.pose, 900);
          }}
        >
          <option value="" disabled>
            {t.pad.positionsPlaceholder}
          </option>
          {QUICK_POSITIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {t.positions[p.id] ?? p.id}
            </option>
          ))}
        </select>
      </div>
      <div className="pad-group">
        <span className="pad-title">{t.pad.probeCam}</span>
        <button
          type="button"
          className={`chip probecam-toggle${probeCam ? " is-on" : ""}`}
          aria-pressed={probeCam}
          aria-label={t.pad.probeCamLabel}
          title={t.pad.probeCamTitle}
          onClick={() => setProbeCam(!probeCam)}
        >
          <CameraIcon size={16} /> {probeCam ? t.pad.on : t.pad.webcam}
        </button>
      </div>
      <ProbeWhere />
      <p className="pad-mouse" dir={t.dir}>
        {t.pad.mouse.map(([gesture, action], i) => (
          <span key={gesture}>
            {i > 0 && " · "}
            <kbd>{gesture}</kbd> {action}
          </span>
        ))}
      </p>
    </section>
  );
}

/** How hard the probe is pressed in, under the Press key. */
function PressValue() {
  const pressure = useSono((s) => s.settings.pressure);
  return <span className="pad-value">{Math.round(pressure * 100)}%</span>;
}

/** Where the probe is, in anatomical words: side, surface line, ribs, region and vertebral level. */
function ProbeWhere() {
  const controller = useController();
  const pose = useSono((s) => s.pose);
  const t = useT();
  const landmarks = controller.data.json.landmarks;
  const where = useMemo(() => (landmarks ? locateProbe(pose, controller.skin, landmarks) : null), [pose, controller, landmarks]);
  if (!where) return null;
  // Quadrants and flanks already say which side; central regions need it on the line ("right paramedian").
  const central =
    where.region === "epigastrium" || where.region === "periumbilical" || where.region === "suprapubic" || where.region === "chest";
  const side = central ? t.where.side[where.side] : "";
  const tone = where.cage.kind === "rib" ? "is-rib" : where.cage.kind === "subcostal" ? "is-subcostal" : "";
  return (
    <output
      aria-live="off"
      className={`pad-where ${tone}`}
      dir={t.dir}
      aria-label={t.where.label}
      title={`φ ${Math.round(pose.phiDeg)}° · z ${Math.round(pose.zMm)} mm`}
    >
      <span className="where-main">
        {t.where.regions[where.region]} · {side ? `${side} ` : ""}
        {t.where.lines[where.line]}
      </span>
      <span className="where-cage">{t.where.cage(where.cage)}</span>
      <span className="where-level">{t.where.level(where.level)}</span>
    </output>
  );
}
