import {
  type ImageView,
  MOVES_WITH_BREATH,
  type OrganKey,
  type ProbeFrame,
  type ProbeKind,
  planeToPixel,
  planeToPolar,
  planeToWorld,
  type ScanGeometry,
  type Vec3,
  worldToPlane,
} from "@insonate/sono-engine";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import type { MeshData } from "../case/loader";
import { ORGAN_COLORS, STRUCTURE_COLORS } from "../content/palette";
import type { FindingMesh } from "../sim/protocol";
import type { Layers } from "../state/store";
import { buildProbeModel } from "./probeModel";

/** Scene units are metres; case data is in millimetres. */
const MM = 0.001;
const FAN_COLUMNS = 40;
const FAN_ROWS = 24;

export type CameraPreset = "sonographer" | "front" | "left" | "plane";

const LAYER_OF: Record<string, keyof Layers> = {
  skin: "skin",
  bone: "bones",
  lung: "lungs",
  heart: "lungs",
  stomach: "bowel",
  duodenum: "bowel",
  smallBowel: "bowel",
  colon: "bowel",
};

/** Context structures: shown for orientation, but not outlined where the plane cuts them. */
const CONTEXT_ONLY = new Set(["skin", "stomach", "duodenum", "smallBowel", "colon", "heart", "psoas"]);

/** Colours of teaching-case findings (fluid as in the anatomy overlay). */
const FINDING_COLORS: Record<string, { color: string; opacity: number }> = {
  stones: { color: STRUCTURE_COLORS.stone, opacity: 1 },
  renalStone: { color: STRUCTURE_COLORS.stone, opacity: 1 },
  fluid: { color: STRUCTURE_COLORS.fluid, opacity: 0.62 },
  pelvicFluid: { color: STRUCTURE_COLORS.fluid, opacity: 0.62 },
  effusion: { color: STRUCTURE_COLORS.fluid, opacity: 0.55 },
  pelvis: { color: STRUCTURE_COLORS.fluid, opacity: 0.75 },
  cyst: { color: STRUCTURE_COLORS.fluid, opacity: 0.75 },
  renalCyst: { color: STRUCTURE_COLORS.fluid, opacity: 0.75 },
  aneurysm: { color: "#ff6b6b", opacity: 0.5 },
  polyp: { color: STRUCTURE_COLORS.lesion, opacity: 1 },
  hemangioma: { color: STRUCTURE_COLORS.lesion, opacity: 0.9 },
  metastases: { color: STRUCTURE_COLORS.lesion, opacity: 0.9 },
  wall: { color: "#4fd18b", opacity: 0.55 },
  // An enlarged spleen replaces the spleen as scanned.
  spleen: { color: "#b07cf0", opacity: 0.8 },
};

/** Meshes that move with breathing (the contents of the abdominal cavity), like the tissue in the simulator. */
const BREATHING = new Set<string>([
  "lung",
  "adrenals",
  "stomach",
  "duodenum",
  "smallBowel",
  "colon",
  ...(Object.keys(MOVES_WITH_BREATH) as OrganKey[]).filter((key) => MOVES_WITH_BREATH[key]),
]);

export type LandmarkId = "xiphoid" | "umbilicus" | "asisRight" | "asisLeft" | "symphysis";

/** Surface and skeletal landmarks, in world millimetres. */
export interface SceneLandmarks {
  /** The costal margin, traced on the skin. */
  readonly costalMargin: readonly Vec3[];
  readonly points: ReadonlyArray<{ readonly id: LandmarkId; readonly position: Vec3 }>;
  /** Where to write each vertebra's name, beside the spine. */
  readonly vertebrae: ReadonlyArray<{ readonly name: string; readonly position: Vec3 }>;
}

/** What the pointer is over, for the tooltip. */
export interface Hover {
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

const SKIN_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const SKIN_FRAGMENT = /* glsl */ `
  uniform vec3 color;
  uniform float base;
  uniform float rim;
  varying vec3 vNormal;
  varying vec3 vView;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float fresnel = pow(1.0 - facing, 2.4);
    gl_FragColor = vec4(color, base + rim * fresnel);
    #include <colorspace_fragment>
  }
`;

/**
 * The 3D context view: an X-ray-like body with organs and bones from the CT, the probe,
 * the scan plane textured with the live image, and where that plane cuts each organ.
 * World axes (from the case): x → patient right, y → anterior, z → head.
 */
export class BodyScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly probe = new THREE.Group();
  private probeKind: ProbeKind | null = null;
  private readonly fan: THREE.Mesh;
  private readonly fanGeometry: THREE.BufferGeometry;
  private fanTexture: THREE.CanvasTexture | null = null;
  private readonly contours: LineSegments2;
  private readonly contourMaterial: LineMaterial;
  private readonly raycaster = new THREE.Raycaster();
  private readonly resize: ResizeObserver;
  private readonly clipPlane = new THREE.Plane();
  private cut = false;
  private preset: CameraPreset = "sonographer";
  private frame: ProbeFrame | null = null;
  private geometry: ScanGeometry | null = null;
  private contourKey = "";
  private hovered: THREE.Mesh | null = null;
  private dragging = false;
  private needsRender = true;
  private raf = 0;
  private readonly container: HTMLElement;
  private readonly onPick: (point: Vec3) => void;
  /** Rotate the probe in place (degrees), from the wheel over the probe. */
  private readonly onTwist: (degrees: number) => void;
  /** Grabbing the probe itself moves it from where it is (no jump to the pointer): the offset kept. */
  private grabOffset: THREE.Vector3 | null = null;
  private readonly onHover: (hover: Hover | null) => void;
  private readonly names: (name: string) => string;
  private readonly labelRenderer = new CSS2DRenderer();
  private readonly landmarks = new THREE.Group();
  private readonly landmarkLabels: Array<{ element: HTMLElement; key: string }> = [];
  /** Vertebral levels, top to bottom: some are hidden when the view crowds them. */
  private readonly levelLabels: CSS2DObject[] = [];
  private landmarkMaterial: LineMaterial | null = null;
  private breath = 0;
  /** The layers shown, and organs a finding stands in for (hidden while it does). */
  private layers: Layers | null = null;
  private replaced = new Set<string>();
  /** How far (mm) moving tissue travels at a height, for the current breath. */
  private shiftAt: (zMm: number) => number = () => 0;

  constructor(
    container: HTMLElement,
    meshes: MeshData[],
    callbacks: {
      onPick: (point: Vec3) => void;
      onTwist: (degrees: number) => void;
      onHover: (hover: Hover | null) => void;
      names: (name: string) => string;
    },
    landmarks?: SceneLandmarks,
  ) {
    this.container = container;
    this.onPick = callbacks.onPick;
    this.onTwist = callbacks.onTwist;
    this.onHover = callbacks.onHover;
    this.names = callbacks.names;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.localClippingEnabled = true;
    container.append(this.renderer.domElement);
    this.renderer.domElement.className = "scene-canvas";
    // Text labels (landmarks, vertebral levels) as HTML over the canvas: crisp in any script.
    this.labelRenderer.domElement.className = "scene-labels";
    container.append(this.labelRenderer.domElement);

    // Soft studio lighting: an environment for gloss, a key light that follows the camera.
    const environment = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = environment.fromScene(new RoomEnvironment(), 0.04).texture;
    environment.dispose();
    this.scene.environmentIntensity = 0.55;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 10);
    this.camera.up.set(0, 1, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x26282c, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(0.35, 0.55, 0.45);
    this.camera.add(key);
    this.scene.add(this.camera);

    // Our pointer handler is registered before OrbitControls', so a click on the body can disable orbiting.
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    // The wheel over the probe turns it (in the capture phase, before OrbitControls zooms).
    this.renderer.domElement.addEventListener("wheel", this.onWheel, { capture: true, passive: false });
    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("pointerup", this.onPointerUp);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.18;
    this.controls.maxDistance = 2.2;
    this.controls.addEventListener("change", () => {
      this.needsRender = true;
    });

    for (const data of meshes) this.addMesh(data);
    this.probe.matrixAutoUpdate = false;
    this.scene.add(this.probe);

    this.fanGeometry = new THREE.BufferGeometry();
    const vertexCount = (FAN_COLUMNS + 1) * (FAN_ROWS + 1);
    this.fanGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    this.fanGeometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2));
    const index: number[] = [];
    for (let r = 0; r < FAN_ROWS; r++) {
      for (let c = 0; c < FAN_COLUMNS; c++) {
        const a = r * (FAN_COLUMNS + 1) + c;
        const b = a + 1;
        const d = a + FAN_COLUMNS + 1;
        const e = d + 1;
        index.push(a, d, b, b, d, e);
      }
    }
    this.fanGeometry.setIndex(index);
    this.fan = new THREE.Mesh(
      this.fanGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.fan.renderOrder = 10;
    this.fan.frustumCulled = false;
    this.scene.add(this.fan);

    // Where the scan plane cuts each organ: coloured outlines drawn over everything.
    this.contourMaterial = new LineMaterial({
      linewidth: 2.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      worldUnits: false,
    });
    this.contours = new LineSegments2(new LineSegmentsGeometry(), this.contourMaterial);
    this.contours.renderOrder = 12;
    this.contours.frustumCulled = false;
    this.scene.add(this.contours);

    if (landmarks) this.buildLandmarks(landmarks);
    this.scene.add(this.landmarks);

    this.setCamera("front");
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.fit();
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Use the ultrasound canvas as the scan-plane texture. */
  setImageSource(canvas: HTMLCanvasElement | null): void {
    this.fanTexture?.dispose();
    this.fanTexture = canvas ? new THREE.CanvasTexture(canvas) : null;
    if (this.fanTexture) this.fanTexture.colorSpace = THREE.SRGBColorSpace;
    (this.fan.material as THREE.MeshBasicMaterial).map = this.fanTexture;
    (this.fan.material as THREE.MeshBasicMaterial).needsUpdate = true;
    this.needsRender = true;
  }

  /** Place the probe and scan plane for a frame; refresh the image texture and the organ cuts. */
  update(frame: ProbeFrame, view: ImageView | null, geometry: ScanGeometry | null, imageChanged: boolean): void {
    this.frame = frame;
    if (geometry) this.geometry = geometry;
    const kind = this.geometry?.kind ?? "curvilinear";
    if (kind !== this.probeKind) {
      this.probe.clear();
      this.probe.add(buildProbeModel(kind));
      this.probeKind = kind;
    }
    const x = new THREE.Vector3(...frame.lateral);
    const y = new THREE.Vector3(-frame.beam[0], -frame.beam[1], -frame.beam[2]);
    const z = new THREE.Vector3(-frame.elevation[0], -frame.elevation[1], -frame.elevation[2]);
    const matrix = new THREE.Matrix4().makeBasis(x, y, z);
    matrix.setPosition(frame.origin[0] * MM, frame.origin[1] * MM, frame.origin[2] * MM);
    this.probe.matrix.copy(matrix);
    this.probe.matrixWorldNeedsUpdate = true;
    if (view && geometry) this.updateFan(frame, view, geometry);
    if (imageChanged && this.fanTexture) this.fanTexture.needsUpdate = true;
    this.updateContours();
    this.updateClipping();
    if (this.preset === "plane") this.aimAtPlane();
    this.needsRender = true;
  }

  setLayers(layers: Layers): void {
    this.layers = layers;
    for (const [name, mesh] of this.meshes) {
      const layer = LAYER_OF[name] ?? "organs";
      const material = mesh.material as THREE.Material;
      // Hidden skin still catches clicks, so it is hidden at material level.
      if (name === "skin") material.visible = layers.skin;
      else mesh.visible = layers[layer] && !this.replaced.has(name);
    }
    this.landmarks.visible = layers.landmarks;
    this.contourKey = "";
    this.updateContours();
    this.needsRender = true;
  }

  /**
   * Move what moves with breathing toward the feet, each mesh as far as the simulator's breathing
   * field moves tissue at its height (`shiftAt`, mm). `breath` (0–1) only decides when to update.
   */
  setBreath(breath: number, shiftAt: (zMm: number) => number): void {
    if (Math.abs(breath - this.breath) < 0.002) return;
    this.breath = breath;
    this.shiftAt = shiftAt;
    for (const [name, mesh] of this.meshes) {
      if (!BREATHING.has(name) && !mesh.userData.breathes) continue;
      mesh.position.z = -this.meshShift(mesh) * MM;
    }
    this.contourKey = "";
    this.updateContours();
    this.needsRender = true;
  }

  private meshShift(mesh: THREE.Mesh): number {
    const centre = mesh.geometry.boundingSphere?.center;
    return centre ? this.shiftAt(centre.z / MM) : 0;
  }

  /** Show the findings of a case (stones, fluid, a cyst, an aneurysm...), replacing any before. */
  setFindings(findings: readonly FindingMesh[]): void {
    for (const [name, mesh] of this.meshes) {
      if (!name.startsWith("finding:")) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.meshes.delete(name);
    }
    // A finding that is a whole organ changed (an enlarged spleen) stands in for the organ as scanned.
    this.replaced = new Set(findings.map((f) => f.name).filter((name) => this.meshes.has(name)));
    for (const [name, mesh] of this.meshes) {
      if (name === "skin" || name.startsWith("finding:")) continue;
      mesh.visible = !this.replaced.has(name) && (this.layers ? this.layers[LAYER_OF[name] ?? "organs"] : true);
    }
    for (const [index, finding] of findings.entries()) {
      if (finding.positions.length === 0) continue;
      const style = FINDING_COLORS[finding.name] ?? { color: "#ffffff", opacity: 0.8 };
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(finding.positions.length);
      for (let i = 0; i < positions.length; i++) positions[i] = finding.positions[i] * MM;
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(finding.indices, 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const material = new THREE.MeshPhysicalMaterial({
        color: style.color,
        roughness: 0.35,
        clearcoat: 0.5,
        transparent: style.opacity < 1,
        opacity: style.opacity,
        depthWrite: style.opacity >= 1,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(style.color),
        emissiveIntensity: 0.18,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `finding:${finding.name}`;
      mesh.renderOrder = 2;
      mesh.userData.breathes = finding.breathes;
      mesh.position.z = finding.breathes ? -this.meshShift(mesh) * MM : 0;
      // Several findings can share a name (a cyst in each kidney): keep each.
      this.meshes.set(`${mesh.name}#${index}`, mesh);
      this.scene.add(mesh);
    }
    this.contourKey = "";
    this.updateContours();
    this.needsRender = true;
  }

  /** Rewrite the landmark labels (after a language change). */
  relabel(): void {
    for (const { element, key } of this.landmarkLabels) element.textContent = this.names(key);
    this.needsRender = true;
  }

  /** Cut away everything between the camera and the scan plane, to see the organs in section. */
  setCut(on: boolean): void {
    this.cut = on;
    this.updateClipping();
    this.needsRender = true;
  }

  /** Screen right and up as world (case) directions. */
  screenAxes(): { right: Vec3; up: Vec3 } {
    this.camera.updateMatrixWorld();
    const e = this.camera.matrixWorld.elements;
    return { right: [e[0], e[1], e[2]], up: [e[4], e[5], e[6]] };
  }

  setCamera(preset: CameraPreset): void {
    this.preset = preset;
    this.controls.enabled = true;
    // Face-on, the plane should read like the scanner screen; from outside, it glows through the body.
    const fanMaterial = this.fan.material as THREE.MeshBasicMaterial;
    fanMaterial.blending = preset === "plane" ? THREE.NormalBlending : THREE.AdditiveBlending;
    fanMaterial.opacity = preset === "plane" ? 0.94 : 1;
    fanMaterial.needsUpdate = true;
    if (preset === "plane") {
      this.aimAtPlane();
      return;
    }
    const target = new THREE.Vector3(0, -0.01, 0.0);
    // Front: head up and the patient's right on the left, like the body marker and W A S D,
    // seen a little from the feet so the probe stands out in depth.
    const positions: Record<Exclude<CameraPreset, "plane">, [number, number, number]> = {
      sonographer: [0.6, 0.52, -0.3],
      front: [0.08, 0.9, -0.2],
      left: [-0.8, 0.4, -0.04],
    };
    this.camera.up.set(0, preset === "front" ? 0 : 1, preset === "front" ? 1 : 0);
    this.camera.position.set(...positions[preset]);
    this.controls.target.copy(target);
    this.controls.update();
    this.updateClipping();
    this.needsRender = true;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.labelRenderer.domElement.remove();
    this.landmarkMaterial?.dispose();
    window.removeEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.removeEventListener("wheel", this.onWheel, { capture: true });
    this.controls.dispose();
    this.fanTexture?.dispose();
    this.scene.environment?.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
    this.contours.geometry.dispose();
    this.contourMaterial.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Look straight at the scan plane, oriented like the ultrasound image (marker side left, depth down). */
  private aimAtPlane(): void {
    const frame = this.frame;
    const g = this.geometry;
    if (!frame || !g) return;
    const centre = planeToWorld(frame, 0, g.depthMm * 0.45);
    const target = new THREE.Vector3(centre[0] * MM, centre[1] * MM, centre[2] * MM);
    const distance = (g.depthMm * MM * 1.15) / Math.tan((this.camera.fov * Math.PI) / 360) / 1.6;
    const e = frame.elevation;
    this.camera.position.set(target.x + e[0] * distance, target.y + e[1] * distance, target.z + e[2] * distance);
    this.camera.up.set(-frame.beam[0], -frame.beam[1], -frame.beam[2]);
    this.controls.target.copy(target);
    this.camera.lookAt(target);
    this.controls.update();
    this.updateClipping();
    this.needsRender = true;
  }

  private addMesh(data: MeshData): void {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(data.positions.length);
    for (let i = 0; i < positions.length; i++) positions[i] = data.positions[i] * MM;
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    let material: THREE.Material;
    if (data.name === "skin") {
      material = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color("#f3cfb3") }, base: { value: 0.035 }, rim: { value: 0.5 } },
        vertexShader: SKIN_VERTEX,
        fragmentShader: SKIN_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        clipping: true,
      });
    } else if (data.name === "bone") {
      material = new THREE.MeshPhysicalMaterial({
        color: STRUCTURE_COLORS.bone,
        roughness: 0.62,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    } else if (data.name === "lung") {
      material = new THREE.MeshPhysicalMaterial({
        color: "#c9d6e6",
        roughness: 0.8,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    } else if (data.name in ORGAN_COLORS) {
      const color = ORGAN_COLORS[data.name as OrganKey];
      const big = data.name === "liver";
      material = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.42,
        clearcoat: 0.55,
        clearcoatRoughness: 0.35,
        transparent: true,
        opacity: big ? 0.5 : 0.88,
        depthWrite: !big,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.06,
      });
    } else {
      // Context: bowel, heart, muscles, adrenals, iliac vessels, prostate. Their own colour, mostly see-through.
      const solid = data.opacity >= 0.8;
      material = new THREE.MeshPhysicalMaterial({
        color: data.color,
        roughness: 0.6,
        clearcoat: 0.2,
        transparent: true,
        opacity: data.opacity,
        depthWrite: solid,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(data.color),
        emissiveIntensity: 0.05,
      });
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder =
      data.name === "skin" ? 6 : data.name === "liver" || data.name === "lung" ? 4 : data.name === "bone" ? 3 : data.opacity < 0.8 ? 5 : 1;
    mesh.name = data.name;
    this.meshes.set(data.name, mesh);
    this.scene.add(mesh);
  }

  private updateFan(frame: ProbeFrame, view: ImageView, g: ScanGeometry): void {
    const position = this.fanGeometry.getAttribute("position") as THREE.BufferAttribute;
    const uv = this.fanGeometry.getAttribute("uv") as THREE.BufferAttribute;
    let v = 0;
    for (let r = 0; r <= FAN_ROWS; r++) {
      const t = (r / FAN_ROWS) * g.depthMm;
      for (let c = 0; c <= FAN_COLUMNS; c++) {
        const u = c / FAN_COLUMNS;
        let a: number;
        let d: number;
        if (g.kind === "curvilinear") {
          const alpha = (0.5 - u) * g.fovRad;
          a = (g.faceRadiusMm + t) * Math.sin(alpha);
          d = -g.faceRadiusMm + (g.faceRadiusMm + t) * Math.cos(alpha);
        } else {
          a = (0.5 - u) * g.widthMm;
          d = t;
        }
        const world = planeToWorld(frame, a, d);
        position.setXYZ(v, world[0] * MM, world[1] * MM, world[2] * MM);
        const pixel = planeToPixel(view, a, d);
        uv.setXY(v, pixel.x / view.width, 1 - pixel.y / view.height);
        v++;
      }
    }
    position.needsUpdate = true;
    uv.needsUpdate = true;
    this.fanGeometry.computeBoundingSphere();
  }

  /** Outline, in each organ's colour, where the scan plane cuts it (inside the image only). */
  private updateContours(): void {
    const frame = this.frame;
    const g = this.geometry;
    if (!frame || !g) return;
    const key = [...frame.origin, ...frame.elevation, g.depthMm, g.kind].map((v) => (typeof v === "number" ? v.toFixed(2) : v)).join();
    if (key === this.contourKey) return;
    this.contourKey = key;
    const n = frame.elevation;
    const o = [frame.origin[0] * MM, frame.origin[1] * MM, frame.origin[2] * MM];
    const offset = n[0] * o[0] + n[1] * o[1] + n[2] * o[2];
    const positions: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();
    const point: [number, number, number] = [0, 0, 0];
    const inImage = (x: number, y: number, z: number) => {
      point[0] = x / MM;
      point[1] = y / MM;
      point[2] = z / MM;
      const p = worldToPlane(frame, point);
      return planeToPolar(g, p.a, p.d) !== null;
    };
    for (const [name, mesh] of this.meshes) {
      if (CONTEXT_ONLY.has(name) || !mesh.visible) continue;
      const organColor =
        ORGAN_COLORS[name as OrganKey] ??
        (name === "bone"
          ? STRUCTURE_COLORS.bone
          : name === "lung"
            ? STRUCTURE_COLORS.lung
            : (mesh.material as THREE.MeshPhysicalMaterial).color);
      color.set(organColor);
      // Breathing moves some meshes along z: work in their own coordinates, against a shifted plane.
      const dz = mesh.position.z;
      const meshOffset = offset - n[2] * dz;
      const sphere = mesh.geometry.boundingSphere;
      if (sphere && Math.abs(n[0] * sphere.center.x + n[1] * sphere.center.y + n[2] * sphere.center.z - meshOffset) > sphere.radius)
        continue;
      const pos = mesh.geometry.getAttribute("position").array as Float32Array;
      const idx = mesh.geometry.getIndex()?.array;
      if (!idx) continue;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3;
        const b = idx[t + 1] * 3;
        const c = idx[t + 2] * 3;
        const da = n[0] * pos[a] + n[1] * pos[a + 1] + n[2] * pos[a + 2] - meshOffset;
        const db = n[0] * pos[b] + n[1] * pos[b + 1] + n[2] * pos[b + 2] - meshOffset;
        const dc = n[0] * pos[c] + n[1] * pos[c + 1] + n[2] * pos[c + 2] - meshOffset;
        if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0)) continue;
        const ends: number[] = [];
        const edge = (p: number, q: number, dp: number, dq: number) => {
          if (dp > 0 === dq > 0) return;
          const s = dp / (dp - dq);
          ends.push(
            pos[p] + (pos[q] - pos[p]) * s,
            pos[p + 1] + (pos[q + 1] - pos[p + 1]) * s,
            pos[p + 2] + (pos[q + 2] - pos[p + 2]) * s + dz,
          );
        };
        edge(a, b, da, db);
        edge(b, c, db, dc);
        edge(c, a, dc, da);
        if (ends.length < 6) continue;
        if (!inImage((ends[0] + ends[3]) / 2, (ends[1] + ends[4]) / 2, (ends[2] + ends[5]) / 2)) continue;
        positions.push(ends[0], ends[1], ends[2], ends[3], ends[4], ends[5]);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    }
    const geometry = new LineSegmentsGeometry();
    if (positions.length > 0) {
      geometry.setPositions(positions);
      geometry.setColors(colors);
    }
    this.contours.geometry.dispose();
    this.contours.geometry = geometry;
    this.contours.visible = positions.length > 0;
  }

  /** In cut mode, remove the half of the body between the camera and the scan plane. */
  private updateClipping(): void {
    const frame = this.frame;
    // Face-on to the plane, whatever lies in front of it would hide the image: cut it away too.
    const planes = (this.cut || this.preset === "plane") && frame ? [this.clipPlane] : [];
    if (frame) {
      const n = new THREE.Vector3(...frame.elevation);
      const o = new THREE.Vector3(frame.origin[0] * MM, frame.origin[1] * MM, frame.origin[2] * MM);
      const side = Math.sign(n.dot(new THREE.Vector3().subVectors(this.camera.position, o))) || 1;
      // Keep the far side: points p with −side·n·(p − o) ≥ 0.
      this.clipPlane.setFromNormalAndCoplanarPoint(n.multiplyScalar(-side), o);
    }
    for (const mesh of this.meshes.values()) {
      const material = mesh.material as THREE.Material;
      if ((material.clippingPlanes?.length ?? -1) !== planes.length) {
        material.clippingPlanes = planes;
        material.needsUpdate = true;
      }
    }
  }

  private fit(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.labelRenderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.contourMaterial.resolution.set(width, height);
    this.landmarkMaterial?.resolution.set(width, height);
    this.needsRender = true;
  }

  private ray(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  private pickSkin(event: PointerEvent): THREE.Vector3 | null {
    const skin = this.meshes.get("skin");
    if (!skin) return null;
    this.ray(event);
    const hit = this.raycaster.intersectObject(skin, false)[0];
    return hit ? hit.point : null;
  }

  /** The organ under the pointer (organs first, then bone and lung). */
  private pickOrgan(event: PointerEvent): THREE.Mesh | null {
    this.ray(event);
    const candidates = [...this.meshes.values()].filter((m) => m.name !== "skin" && m.visible);
    const hits = this.raycaster.intersectObjects(candidates, false);
    const organ = hits.find((h) => h.object.name !== "bone" && h.object.name !== "lung") ?? hits[0];
    return organ ? (organ.object as THREE.Mesh) : null;
  }

  private setHovered(mesh: THREE.Mesh | null, event: PointerEvent | null): void {
    if (mesh !== this.hovered) {
      if (this.hovered) {
        const previous = this.hovered.material as THREE.MeshPhysicalMaterial;
        if ("emissiveIntensity" in previous) previous.emissiveIntensity = 0.06;
      }
      if (mesh) {
        const material = mesh.material as THREE.MeshPhysicalMaterial;
        if ("emissiveIntensity" in material) material.emissiveIntensity = 0.32;
      }
      this.hovered = mesh;
      this.needsRender = true;
    }
    if (!mesh || !event) {
      this.onHover(null);
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.onHover({ name: this.names(mesh.name), x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  /** Where the probe face is, in scene units. */
  private probePosition(): THREE.Vector3 {
    return new THREE.Vector3().setFromMatrixPosition(this.probe.matrix);
  }

  /** The pointer is on the probe, or on the skin right under it. */
  private onProbe(event: PointerEvent | WheelEvent): THREE.Vector3 | null {
    this.ray(event as PointerEvent);
    if (this.raycaster.intersectObject(this.probe, true).length > 0) return this.probePosition();
    const skin = this.meshes.get("skin");
    const hit = skin ? this.raycaster.intersectObject(skin, false)[0] : undefined;
    return hit && hit.point.distanceTo(this.probePosition()) < 22 * MM ? hit.point : null;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const point = this.pickSkin(event);
    const onProbe = this.onProbe(event);
    if (!point && !onProbe) return;
    this.dragging = true;
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    if (this.preset === "plane") this.preset = "sonographer";
    // Grabbing the probe keeps it where it is and moves it from there; anywhere else on the skin, it goes there.
    this.grabOffset = onProbe ? this.probePosition().sub(point ?? onProbe) : null;
    if (point && !this.grabOffset) this.onPick([point.x / MM, point.y / MM, point.z / MM]);
    this.renderer.domElement.style.cursor = "grabbing";
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) {
      const skin = this.pickSkin(event);
      this.renderer.domElement.style.cursor = this.onProbe(event) ? "grab" : skin ? "crosshair" : "default";
      this.setHovered(this.pickOrgan(event), event);
      return;
    }
    const point = this.pickSkin(event);
    if (!point) return;
    if (this.grabOffset) point.add(this.grabOffset);
    this.onPick([point.x / MM, point.y / MM, point.z / MM]);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.onProbe(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.onTwist(event.deltaY < 0 ? 4 : -4);
  };

  private readonly onPointerLeave = (): void => {
    this.setHovered(null, null);
  };

  private readonly onPointerUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.grabOffset = null;
    this.controls.enabled = true;
  };

  private readonly loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (this.controls.update()) this.updateClipping();
    if (!this.needsRender) return;
    this.needsRender = false;
    this.renderer.render(this.scene, this.camera);
    if (this.landmarks.visible) {
      this.declutterLevels();
      this.labelRenderer.render(this.scene, this.camera);
    }
  };

  /**
   * Show a vertebral level only where it is clear of the landmark names and of the last level shown
   * (seen end-on, the spine crowds them).
   */
  private declutterLevels(): void {
    const height = this.container.clientHeight;
    const width = this.container.clientWidth;
    const p = new THREE.Vector3();
    const toScreen = (object: THREE.Object3D) => {
      p.copy(object.position).project(this.camera);
      return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height };
    };
    // Landmark names: their screen boxes (they are drawn centred, a little above their point).
    const boxes = this.landmarks.children
      .filter((child): child is CSS2DObject => child instanceof CSS2DObject && !this.levelLabels.includes(child))
      .map((label) => {
        const at = toScreen(label);
        const w = label.element.offsetWidth || 90;
        const h = label.element.offsetHeight || 20;
        return { x0: at.x - w / 2 - 4, x1: at.x + w / 2 + 4, y0: at.y - h - 14, y1: at.y + h };
      });
    let last: { x: number; y: number } | null = null;
    for (const label of this.levelLabels) {
      const at = toScreen(label);
      const free = boxes.every((b) => at.x < b.x0 - 14 || at.x > b.x1 + 14 || at.y < b.y0 - 8 || at.y > b.y1 + 8);
      const clear = free && (!last || Math.hypot(at.x - last.x, at.y - last.y) > 17);
      label.visible = clear;
      if (clear) last = at;
    }
  }

  /** The costal margin on the skin, the landmark points and the vertebral levels, with their names. */
  private buildLandmarks(landmarks: SceneLandmarks): void {
    const accent = new THREE.Color("#f2a43a");
    if (landmarks.costalMargin.length > 1) {
      const geometry = new LineGeometry();
      geometry.setPositions(landmarks.costalMargin.flatMap((p) => [p[0] * MM, p[1] * MM, p[2] * MM]));
      this.landmarkMaterial = new LineMaterial({
        color: accent.getHex(),
        linewidth: 2,
        dashed: true,
        dashSize: 0.008,
        gapSize: 0.005,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        worldUnits: false,
      });
      const line = new Line2(geometry, this.landmarkMaterial);
      line.computeLineDistances();
      line.renderOrder = 11;
      this.landmarks.add(line);
      // Name the margin where it is lowest at the front (screen left of centre, the patient's right).
      const right = landmarks.costalMargin.filter((p) => p[0] > 0);
      const anchor = right[Math.floor(right.length * 0.35)] ?? landmarks.costalMargin[0];
      this.addLabel("costalMargin", anchor, "is-margin");
    }
    const dotGeometry = new THREE.SphereGeometry(0.0032, 16, 12);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: accent, depthTest: false, transparent: true });
    for (const point of landmarks.points) {
      const dot = new THREE.Mesh(dotGeometry, dotMaterial);
      dot.position.set(point.position[0] * MM, point.position[1] * MM, point.position[2] * MM);
      dot.renderOrder = 11;
      this.landmarks.add(dot);
      this.addLabel(point.id, point.position, "is-point");
    }
    for (const vertebra of landmarks.vertebrae) {
      this.levelLabels.push(this.addLabel(vertebra.name, vertebra.position, "is-level", vertebra.name));
    }
  }

  private addLabel(key: string, position: Vec3, kind: string, fixed?: string): CSS2DObject {
    const element = document.createElement("span");
    element.className = `scene-label ${kind}`;
    element.textContent = fixed ?? this.names(key);
    const label = new CSS2DObject(element);
    label.position.set(position[0] * MM, position[1] * MM, position[2] * MM);
    this.landmarks.add(label);
    if (!fixed) this.landmarkLabels.push({ element, key });
    return label;
  }
}
