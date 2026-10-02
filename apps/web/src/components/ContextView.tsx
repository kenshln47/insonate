import { breathShiftMm, type OrganKey, type SkinSurface, type Vec3 } from "@insonate/sono-engine";
import { useEffect, useRef, useState } from "react";
import type { CaseLandmarks } from "../case/loader";
import { MESSAGES, useT } from "../i18n";
import type { LandmarkKey, StructureKey } from "../i18n/messages";
import { useController } from "../sim/context";
import { examLocked, type Layers, useSono } from "../state/store";
import { BodyScene, type CameraPreset, type Hover, type SceneLandmarks } from "../three/BodyScene";

const PRESET_IDS: readonly CameraPreset[] = ["front", "sonographer", "left", "plane"];
const LAYER_IDS: ReadonlyArray<keyof Layers> = ["skin", "organs", "bowel", "bones", "lungs", "landmarks"];

/** A point on the skin over a landmark, lifted a little so it is drawn on top. */
function onSkin(skin: SkinSurface, p: Vec3, lift = 1.5): Vec3 {
  const { phiDeg } = skin.locate(p);
  const at = skin.at(phiDeg, p[2]);
  return [at.position[0] + at.normal[0] * lift, at.position[1] + at.normal[1] * lift, at.position[2] + at.normal[2] * lift];
}

/** The case's landmarks as 3D geometry: the costal margin on the skin, points and vertebral levels. */
function sceneLandmarks(landmarks: CaseLandmarks, skin: SkinSurface): SceneLandmarks {
  // The rib cage's lower edge is ragged between cartilages: a light median-then-mean smoothing across φ.
  const z = landmarks.costalMargin.map(([, zz]) => zz);
  const median = z.map((_, i) => {
    const w = [z[Math.max(0, i - 1)], z[i], z[Math.min(z.length - 1, i + 1)]].sort((a, b) => a - b);
    return w[1];
  });
  const smooth = median.map((_, i) => (median[Math.max(0, i - 1)] + 2 * median[i] + median[Math.min(median.length - 1, i + 1)]) / 4);
  const costalMargin: Vec3[] = [];
  landmarks.costalMargin.forEach(([phiDeg], i) => {
    for (let step = 0; step < 4; step++) {
      const next = landmarks.costalMargin[i + 1];
      if (step > 0 && !next) break;
      const t = step / 4;
      const phi = next ? phiDeg + (next[0] - phiDeg) * t : phiDeg;
      const zz = next ? smooth[i] + (smooth[i + 1] - smooth[i]) * t : smooth[i];
      const at = skin.at(phi, zz);
      costalMargin.push([at.position[0] + at.normal[0] * 1.5, at.position[1] + at.normal[1] * 1.5, at.position[2] + at.normal[2] * 1.5]);
    }
  });
  return {
    costalMargin,
    points: [
      { id: "xiphoid", position: onSkin(skin, landmarks.xiphoid) },
      { id: "umbilicus", position: onSkin(skin, landmarks.umbilicus) },
      { id: "asisRight", position: onSkin(skin, landmarks.asis[0]) },
      { id: "asisLeft", position: onSkin(skin, landmarks.asis[1]) },
      { id: "symphysis", position: onSkin(skin, landmarks.symphysis) },
    ],
    // On the spine, just behind the front of each vertebral body.
    vertebrae: landmarks.vertebrae.map((v) => ({ name: v.name, position: [v.front[0], v.front[1] - 14, v.centre[2]] as Vec3 })),
  };
}

/** The 3D body with the probe, the live scan plane and where it cuts each organ. */
export function ContextView() {
  const controller = useController();
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BodyScene | null>(null);
  const layers = useSono((s) => s.layers);
  const setLayer = useSono((s) => s.setLayer);
  const [preset, setPreset] = useState<CameraPreset>("front");
  const language = useSono((s) => s.language);
  const [cut, setCut] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const t = useT();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const landmarks = controller.data.json.landmarks;
    const scene = new BodyScene(
      container,
      controller.data.meshes,
      {
        onPick: (point) => {
          const located = controller.skin.locate(point);
          const pose = useSono.getState().pose;
          controller.setPose({ ...pose, phiDeg: located.phiDeg, zMm: located.zMm });
        },
        onTwist: (degrees) => {
          const state = useSono.getState();
          if (!state.frozen) controller.setPose({ ...state.pose, rotationDeg: state.pose.rotationDeg + degrees });
        },
        onHover: setHover,
        names: (name) => {
          // Read the language at use time: the scene outlives language changes.
          const words = MESSAGES[useSono.getState().language];
          if (name.startsWith("finding:")) return words.cases.findings[name.slice(8)] ?? name;
          return words.organs[name as OrganKey] ?? words.structures[name as StructureKey] ?? words.landmarks[name as LandmarkKey] ?? name;
        },
      },
      landmarks ? sceneLandmarks(landmarks, controller.skin) : undefined,
    );
    sceneRef.current = scene;
    controller.viewAxes = () => scene.screenAxes();
    scene.setImageSource(controller.imageCanvas);
    scene.setLayers(useSono.getState().layers);
    // Probe follows the pose immediately; the plane texture follows rendered frames.
    const stopPose = useSono.subscribe((state, previous) => {
      if (state.pose !== previous.pose) scene.update(controller.frameFor(state.pose), null, null, false);
    });
    // While an exam is being sat, its findings stay hidden: the 3D view would give the answer away.
    let latest: Parameters<typeof scene.setFindings>[0] = [];
    const showFindings = () => scene.setFindings(examLocked(useSono.getState()) ? [] : latest);
    const stopFindings = controller.onFindings((findings) => {
      latest = findings;
      showFindings();
    });
    const stopExam = useSono.subscribe((state, previous) => {
      if (examLocked(state) !== examLocked(previous)) showFindings();
    });
    const stopFrames = controller.onFrame((info) => {
      // The organs in 3D breathe with the image.
      scene.setBreath(info.breath, (z) => breathShiftMm(controller.data.volume, info.breath, z));
      scene.update(info.frame, info.view, info.geometry, true);
    });
    return () => {
      stopPose();
      stopFindings();
      stopExam();
      stopFrames();
      scene.dispose();
      sceneRef.current = null;
      controller.viewAxes = null;
    };
  }, [controller]);

  useEffect(() => {
    sceneRef.current?.setLayers(layers);
  }, [layers]);

  useEffect(() => {
    sceneRef.current?.setCut(cut);
  }, [cut]);

  useEffect(() => {
    if (language) sceneRef.current?.relabel();
  }, [language]);

  const choose = (id: CameraPreset) => {
    setPreset(id);
    sceneRef.current?.setCamera(id);
  };

  return (
    <div className="context">
      <div className="context-view" ref={containerRef} dir="ltr">
        {hover && (
          <span className="scene-tooltip" style={{ left: hover.x, top: hover.y }}>
            {hover.name}
          </span>
        )}
      </div>
      <div className="context-tools">
        <fieldset className="chip-row" aria-label={t.context.camera}>
          {PRESET_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`chip${preset === id ? " is-on" : ""}`}
              aria-pressed={preset === id}
              title={t.context.presets[id].title}
              onClick={() => choose(id)}
            >
              {t.context.presets[id].label}
            </button>
          ))}
        </fieldset>
        <fieldset className="chip-row" aria-label={t.context.layers}>
          {LAYER_IDS.map((layer) => (
            <button
              key={layer}
              type="button"
              className={`chip${layers[layer] ? " is-on" : ""}`}
              aria-pressed={layers[layer]}
              onClick={() => setLayer(layer, !layers[layer])}
            >
              {t.context.layerNames[layer]}
            </button>
          ))}
          <button
            type="button"
            className={`chip${cut ? " is-on" : ""}`}
            aria-pressed={cut}
            title={t.context.cutTitle}
            onClick={() => setCut(!cut)}
          >
            {t.context.cut}
          </button>
        </fieldset>
      </div>
      <p className="context-hint">{t.context.hint}</p>
    </div>
  );
}
