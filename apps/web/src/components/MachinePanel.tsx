import { PROBES } from "@insonate/sono-engine";
import { useT } from "../i18n";
import { examLocked, useSono } from "../state/store";
import { AnatomyIcon, CtIcon, FreezeIcon, LungsIcon, ResetIcon, RulerIcon, TagIcon } from "./icons";
import { Button, Segmented, Slider } from "./ui";

/** The scanner's control panel: probe, frequency, depth, gain, focus, dynamic range, processing and TGC. */
export function MachinePanel() {
  const settings = useSono((s) => s.settings);
  const setSettings = useSono((s) => s.setSettings);
  const setTgc = useSono((s) => s.setTgc);
  const setProbe = useSono((s) => s.setProbe);
  const t = useT();
  const spec = PROBES[settings.probe];
  const levels = t.machine.levels.map((label, value) => ({ value, label }));

  return (
    <div className="machine">
      <Segmented
        label={t.machine.transducer}
        value={settings.probe}
        onChange={setProbe}
        options={[
          { value: "curvilinear", label: `${t.machine.curvilinear} · ${PROBES.curvilinear.model}`, title: t.machine.curvilinearTitle },
          { value: "linear", label: `${t.machine.linear} · ${PROBES.linear.model}`, title: t.machine.linearTitle },
        ]}
      />
      <div className="machine-grid">
        <Slider
          label={t.machine.frequency}
          min={spec.frequencyRange[0]}
          max={spec.frequencyRange[1]}
          step={0.5}
          value={settings.frequencyMHz}
          display={`${settings.frequencyMHz.toFixed(1)} MHz`}
          onChange={(frequencyMHz) => setSettings({ frequencyMHz })}
          hint={t.machine.frequencyHint}
        />
        <Slider
          label={t.machine.depth}
          min={spec.depthRange[0]}
          max={spec.depthRange[1]}
          step={10}
          value={settings.depthMm}
          display={`${(settings.depthMm / 10).toFixed(0)} cm`}
          onChange={(depthMm) => setSettings({ depthMm })}
        />
        <Slider
          label={t.machine.gain}
          min={-20}
          max={20}
          step={1}
          value={settings.gainDb}
          display={`${settings.gainDb > 0 ? "+" : ""}${settings.gainDb} dB`}
          onChange={(gainDb) => setSettings({ gainDb })}
        />
        <Slider
          label={t.machine.focus}
          min={10}
          max={settings.depthMm - 5}
          step={5}
          value={settings.focusMm}
          display={`${(settings.focusMm / 10).toFixed(1)} cm`}
          onChange={(focusMm) => setSettings({ focusMm })}
          hint={t.machine.focusHint}
        />
        <Slider
          label={t.machine.dynamicRange}
          min={40}
          max={80}
          step={5}
          value={settings.dynamicRangeDb}
          display={`${settings.dynamicRangeDb} dB`}
          onChange={(dynamicRangeDb) => setSettings({ dynamicRangeDb })}
          hint={t.machine.dynamicRangeHint}
        />
      </div>
      <div className="machine-grid">
        <Segmented
          label={t.machine.speckle}
          value={settings.speckleReduction}
          onChange={(speckleReduction) => setSettings({ speckleReduction })}
          options={levels}
        />
        <Segmented
          label={t.machine.persistence}
          value={settings.persistence}
          onChange={(persistence) => setSettings({ persistence })}
          options={levels}
        />
      </div>
      <DopplerControls />
      <fieldset className="tgc" aria-label={t.machine.tgcLabel}>
        <div className="tgc-head">
          <span className="field-label">{t.machine.tgc}</span>
          <button type="button" className="link" onClick={() => setSettings({ tgcDb: [0, 0, 0, 0, 0, 0, 0, 0] })}>
            {t.machine.reset}
          </button>
        </div>
        <div className="tgc-sliders" dir="ltr">
          {settings.tgcDb.map((value, i) => (
            <input
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length slider bank
              key={i}
              type="range"
              className="tgc-slider"
              min={-15}
              max={15}
              step={1}
              value={value}
              aria-label={t.machine.tgcBand(i + 1)}
              onChange={(event) => setTgc(i, Number(event.target.value))}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Scan-time tools: breathing, freeze, measure, labels and anatomy. */
export function ScanTools() {
  const breathing = useSono((s) => s.breathing);
  const setBreathing = useSono((s) => s.setBreathing);
  const frozen = useSono((s) => s.frozen);
  const setFrozen = useSono((s) => s.setFrozen);
  const measuring = useSono((s) => s.measuring);
  const setMeasuring = useSono((s) => s.setMeasuring);
  const measurements = useSono((s) => s.measurements);
  const clearMeasurements = useSono((s) => s.clearMeasurements);
  const labels = useSono((s) => s.labels);
  const setLabels = useSono((s) => s.setLabels);
  const anatomy = useSono((s) => s.anatomy);
  const setAnatomy = useSono((s) => s.setAnatomy);
  const ct = useSono((s) => s.ct);
  const setCt = useSono((s) => s.setCt);
  const ctBlend = useSono((s) => s.ctBlend);
  const setCtBlend = useSono((s) => s.setCtBlend);
  const stats = useSono((s) => s.stats);
  // During an exam, the answer key stays shut: outlines and CT always, labels from level 2.
  const locked = useSono(examLocked);
  const labelsLocked = useSono((s) => examLocked(s) && (s.exam?.case.level ?? 1) > 1);
  const t = useT();
  return (
    <div className="scan-tools">
      <Segmented
        label={t.tools.breathing}
        value={breathing}
        onChange={setBreathing}
        options={[
          {
            value: "normal",
            label: (
              <>
                <LungsIcon size={15} /> {t.tools.breathe}
              </>
            ),
            title: t.tools.breatheTitle,
          },
          { value: "inspire", label: t.tools.inspire, title: t.tools.inspireTitle },
          { value: "expire", label: t.tools.expire },
        ]}
      />
      <div className="tool-row">
        <Button icon={<FreezeIcon />} className={frozen ? "is-active" : undefined} onClick={() => setFrozen(!frozen)} title="Space">
          {frozen ? t.tools.unfreeze : t.tools.freeze}
        </Button>
        <Button
          icon={<RulerIcon />}
          className={measuring ? "is-active" : undefined}
          onClick={() => setMeasuring(!measuring)}
          title={t.tools.measureTitle}
        >
          {t.tools.measure}
        </Button>
        {measurements.length > 0 && (
          <Button variant="ghost" icon={<ResetIcon />} onClick={clearMeasurements}>
            {t.tools.clear}
          </Button>
        )}
        <Button
          icon={<TagIcon />}
          className={labels ? "is-active" : undefined}
          onClick={() => setLabels(!labels)}
          title={labelsLocked ? t.report.locked : "L"}
          disabled={labelsLocked}
        >
          {t.tools.labels}
        </Button>
        <Button
          icon={<AnatomyIcon />}
          className={anatomy ? "is-active" : undefined}
          onClick={() => setAnatomy(!anatomy)}
          title={locked ? t.report.locked : t.tools.anatomyTitle}
          disabled={locked}
        >
          {t.tools.anatomy}
        </Button>
        <Button
          icon={<CtIcon />}
          className={ct ? "is-active" : undefined}
          onClick={() => setCt(!ct)}
          title={locked ? t.report.locked : t.tools.ctTitle}
          disabled={locked}
        >
          {t.tools.ct}
        </Button>
      </div>
      {ct && (
        <Slider
          label={t.tools.ctBlend}
          min={0}
          max={100}
          step={5}
          value={Math.round(ctBlend * 100)}
          display={`${Math.round(ctBlend * 100)} % CT`}
          onChange={(value) => setCtBlend(value / 100)}
          hint={t.tools.ctHint}
        />
      )}
      <p className="hint stats">
        {t.tools.perFrame(Math.round(stats.ms))}
        {stats.contact < 0.9 ? t.tools.contact(Math.round(stats.contact * 100)) : ""}
      </p>
    </div>
  );
}

/** Box widths (fractions of the image's scanlines) for the narrow, medium and wide colour box. */
const BOX_WIDTHS = [0.2, 0.36, 0.6] as const;

/** Doppler: off, colour flow (scale, colour gain, invert, box) or PW (scale, gate, angle correction). */
function DopplerControls() {
  const settings = useSono((s) => s.settings);
  const setSettings = useSono((s) => s.setSettings);
  const angle = useSono((s) => s.dopplerAngle);
  const setAngle = useSono((s) => s.setDopplerAngle);
  const t = useT();
  const mode = settings.doppler;
  const boxSize = BOX_WIDTHS.reduce(
    (best, w, i) => (Math.abs(w - settings.colorBox.width) < Math.abs(BOX_WIDTHS[best] - settings.colorBox.width) ? i : best),
    0,
  );
  return (
    <div className="doppler">
      <Segmented
        label={t.doppler.mode}
        value={mode}
        onChange={(doppler) => setSettings({ doppler })}
        options={[
          { value: "off", label: t.doppler.off },
          { value: "color", label: t.doppler.color, title: t.doppler.colorTitle },
          { value: "pw", label: t.doppler.pw, title: t.doppler.pwTitle },
        ]}
      />
      {mode !== "off" && (
        <div className="machine-grid">
          <Slider
            label={t.doppler.scale}
            min={5}
            max={120}
            step={1}
            value={settings.scaleCmS}
            display={`±${settings.scaleCmS} cm/s`}
            onChange={(scaleCmS) => setSettings({ scaleCmS })}
            hint={t.doppler.scaleHint}
          />
          {mode === "color" ? (
            <Slider
              label={t.doppler.colorGain}
              min={-20}
              max={20}
              step={1}
              value={settings.colorGainDb}
              display={`${settings.colorGainDb > 0 ? "+" : ""}${settings.colorGainDb} dB`}
              onChange={(colorGainDb) => setSettings({ colorGainDb })}
              hint={t.doppler.colorGainHint}
            />
          ) : (
            <Slider
              label={t.doppler.gate}
              min={1}
              max={8}
              step={0.5}
              value={settings.gate.lengthMm}
              display={`${settings.gate.lengthMm.toFixed(1)} mm`}
              onChange={(lengthMm) => setSettings({ gate: { ...settings.gate, lengthMm } })}
              hint={t.doppler.gateHint}
            />
          )}
        </div>
      )}
      {mode === "color" && (
        <div className="doppler-row">
          <Segmented
            label={t.doppler.box}
            value={boxSize}
            onChange={(size) => setSettings({ colorBox: { ...settings.colorBox, width: BOX_WIDTHS[size] } })}
            options={t.doppler.boxSizes.map((label, value) => ({ value, label }))}
          />
          <Button
            className={settings.colorInvert ? "is-active" : undefined}
            onClick={() => setSettings({ colorInvert: !settings.colorInvert })}
          >
            {t.doppler.invert}
          </Button>
          <p className="hint">{t.doppler.boxHint}</p>
        </div>
      )}
      {mode === "pw" && (
        <Slider
          label={t.doppler.angle}
          min={-80}
          max={80}
          step={1}
          value={angle}
          display={`${angle}°`}
          onChange={setAngle}
          hint={t.doppler.angleHint}
        />
      )}
    </div>
  );
}
