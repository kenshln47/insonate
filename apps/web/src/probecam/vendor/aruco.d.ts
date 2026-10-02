// Types for the vendored js-aruco2 detector (see vendor-aruco.ts).
export interface ArucoPoint {
  x: number;
  y: number;
}

export interface ArucoMarker {
  id: number;
  corners: ArucoPoint[];
  hammingDistance: number;
}

export interface ArucoImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export declare const AR: {
  Detector: new (config?: {
    dictionaryName?: string;
    maxHammingDistance?: number;
  }) => {
    detect(image: ArucoImage): ArucoMarker[];
  };
  Dictionary: new (
    name: string,
  ) => {
    markSize: number;
    codeList: string[];
    generateSVG(id: number): string;
  };
};
