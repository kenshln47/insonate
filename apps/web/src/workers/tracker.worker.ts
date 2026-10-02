import { type MarkerObservation, MarkerTracker } from "../probecam/tracker";

export interface TrackerFrame {
  readonly type: "frame";
  readonly bitmap: ImageBitmap;
}

export interface TrackerResult {
  readonly type: "result";
  readonly observation: MarkerObservation | null;
  readonly width: number;
  readonly height: number;
  readonly ms: number;
}

const port = self as unknown as Worker;
const tracker = new MarkerTracker();
let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;

port.onmessage = (event: MessageEvent<TrackerFrame>) => {
  const { bitmap } = event.data;
  const { width, height } = bitmap;
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas = new OffscreenCanvas(width, height);
    context = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!context) return;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const t0 = performance.now();
  let observation: MarkerObservation | null = null;
  try {
    observation = tracker.detect(context.getImageData(0, 0, width, height));
  } catch {
    // A degenerate quad can trip the pose solver; treat it as not seen.
  }
  const result: TrackerResult = { type: "result", observation, width, height, ms: performance.now() - t0 };
  port.postMessage(result);
};
