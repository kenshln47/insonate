// Types for the vendored js-aruco2 coplanar POSIT pose solver (see vendor-aruco.ts).
export interface PositPose {
  bestError: number;
  bestRotation: number[][];
  bestTranslation: number[];
  alternativeError: number;
  alternativeRotation: number[][];
  alternativeTranslation: number[];
}

export declare const POS: {
  Posit: new (
    modelSize: number,
    focalLength: number,
  ) => {
    pose(points: { x: number; y: number }[]): PositPose;
  };
};
