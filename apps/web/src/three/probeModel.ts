import { PROBES, type ProbeKind } from "@insonate/sono-engine";
import * as THREE from "three";

/**
 * A transducer model in probe coordinates (metres): x toward the orientation marker,
 * y up and away from the skin, z along the elevation (thickness) of the face.
 * The face touches the skin at the origin, as the scan plane does.
 */
export function buildProbeModel(kind: ProbeKind): THREE.Group {
  const spec = PROBES[kind];
  const group = new THREE.Group();
  const mm = 0.001;
  const housing = new THREE.MeshPhysicalMaterial({
    color: 0xe9edf3,
    roughness: 0.38,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.35,
  });
  const lensMaterial = new THREE.MeshStandardMaterial({ color: 0x1d2433, roughness: 0.55, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x242c3b, roughness: 0.7 });
  const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xff9f43, emissive: 0xff7a00, emissiveIntensity: 0.7, roughness: 0.4 });

  const thickness = kind === "curvilinear" ? 24 : 16;
  const outline = new THREE.Shape();
  let faceHalf: number;
  if (kind === "curvilinear") {
    // The face is an arc of the probe's radius: its edges curve up from the skin.
    const r = spec.faceRadiusMm;
    const half = (spec.fovDeg / 2) * (Math.PI / 180);
    faceHalf = r * Math.sin(half);
    const edgeLift = r * (1 - Math.cos(half));
    outline.moveTo(-faceHalf, edgeLift);
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const a = -half + (2 * half * i) / steps;
      outline.lineTo(r * Math.sin(a), r * (1 - Math.cos(a)));
    }
    outline.bezierCurveTo(faceHalf + 3, edgeLift + 8, faceHalf - 4, edgeLift + 30, 15, 66);
    outline.quadraticCurveTo(13, 80, 0, 82);
    outline.quadraticCurveTo(-13, 80, -15, 66);
    outline.bezierCurveTo(-faceHalf + 4, edgeLift + 30, -faceHalf - 3, edgeLift + 8, -faceHalf, edgeLift);
  } else {
    faceHalf = spec.widthMm / 2;
    outline.moveTo(-faceHalf, 0.5);
    outline.lineTo(faceHalf, 0.5);
    outline.bezierCurveTo(faceHalf + 2, 10, faceHalf - 6, 26, 11, 58);
    outline.quadraticCurveTo(10, 72, 0, 74);
    outline.quadraticCurveTo(-10, 72, -11, 58);
    outline.bezierCurveTo(-faceHalf + 6, 26, -faceHalf - 2, 10, -faceHalf, 0.5);
  }
  const bevel = 3;
  const body = new THREE.ExtrudeGeometry(outline, {
    depth: thickness - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: 2.2,
    bevelSegments: 4,
    curveSegments: 18,
  });
  body.translate(0, 0.6, -(thickness - 2 * bevel) / 2);
  body.scale(mm, mm, mm);
  body.computeVertexNormals();
  group.add(new THREE.Mesh(body, housing));

  // The acoustic lens: a dark band over the face.
  if (kind === "curvilinear") {
    const r = spec.faceRadiusMm;
    const fov = spec.fovDeg * (Math.PI / 180);
    const lens = new THREE.CylinderGeometry(r * mm, r * mm, (thickness - 4) * mm, 32, 1, true, -fov / 2, fov);
    lens.rotateX(Math.PI / 2);
    lens.translate(0, r * mm, 0);
    group.add(new THREE.Mesh(lens, lensMaterial));
  } else {
    const lens = new THREE.BoxGeometry(spec.widthMm * mm, 1.2 * mm, (thickness - 4) * mm);
    lens.translate(0, 0.6 * mm, 0);
    group.add(new THREE.Mesh(lens, lensMaterial));
  }

  // Strain relief and cable.
  const top = kind === "curvilinear" ? 82 : 74;
  const relief = new THREE.CylinderGeometry(4.2 * mm, 6 * mm, 18 * mm, 20);
  relief.translate(0, (top + 7) * mm, 0);
  group.add(new THREE.Mesh(relief, dark));
  const cable = new THREE.CylinderGeometry(3 * mm, 3 * mm, 90 * mm, 14);
  cable.translate(0, (top + 60) * mm, 0);
  group.add(new THREE.Mesh(cable, dark));

  // Orientation marker: a lit ridge on the marker side, near the face.
  const marker = new THREE.Mesh(new THREE.BoxGeometry(2.2 * mm, 9 * mm, 6 * mm), markerMaterial);
  const markerX = kind === "curvilinear" ? faceHalf + 0.6 : faceHalf + 1.2;
  marker.position.set(markerX * mm, (kind === "curvilinear" ? 22 : 14) * mm, 0);
  group.add(marker);
  return group;
}
