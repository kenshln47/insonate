import { DICTIONARY, focalLength, MARKER_ID, MARKER_MM } from "./marker";
import { AR, type ArucoImage } from "./vendor/aruco.js";
import { POS } from "./vendor/posit1.js";

/** A sighting of the marker. Camera space: x right, y up, z away from the camera (mm). */
export interface MarkerObservation {
  /** Corners in image pixels, clockwise from the marker's top-left. */
  readonly corners: readonly { readonly x: number; readonly y: number }[];
  /** Centre of the marker. */
  readonly position: readonly [number, number, number];
  /** Rotation from marker to camera axes (row-major 3×3). */
  readonly rotation: readonly (readonly number[])[];
}

/** Finds the marker in camera frames and estimates its 3D pose (POSIT). */
export class MarkerTracker {
  private readonly detector = new AR.Detector({ dictionaryName: DICTIONARY, maxHammingDistance: 6 });
  private solver: InstanceType<typeof POS.Posit> | null = null;
  private solverWidth = 0;

  detect(image: ArucoImage): MarkerObservation | null {
    const marker = this.detector.detect(image).find((m) => m.id === MARKER_ID);
    if (!marker) return null;
    if (!this.solver || this.solverWidth !== image.width) {
      this.solver = new POS.Posit(MARKER_MM, focalLength(image.width));
      this.solverWidth = image.width;
    }
    const centred = marker.corners.map((c) => ({ x: c.x - image.width / 2, y: image.height / 2 - c.y }));
    const pose = this.solver.pose(centred);
    const [x, y, z] = pose.bestTranslation;
    return {
      corners: marker.corners.map((c) => ({ x: c.x, y: c.y })),
      position: [x, y, z],
      rotation: pose.bestRotation.map((row) => [...row]),
    };
  }
}
