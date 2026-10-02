// Writes a short Y4M video of the printed marker moving and turning, which Chromium
// plays as a fake webcam (--use-file-for-fake-video-capture).
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { focalLength } from "../src/probecam/marker";
import { type CameraModel, renderMarker, rotation } from "../src/probecam/synthetic";

export const FAKE_CAMERA = join(tmpdir(), "insonate-fake-camera.y4m");

const WIDTH = 480;
const HEIGHT = 360;
const FPS = 15;

/** The marker glides 70 mm across, then turns 35°. Chromium loops the clip. */
function frame(index: number, camera: CameraModel): Uint8Array {
  const slide = Math.min(1, index / 30);
  const turn = Math.max(0, (index - 30) / 15);
  return renderMarker(camera, rotation("z", 35 * turn), [-35 + 70 * slide, 0, 360]);
}

export default function writeFakeCamera(): void {
  const camera: CameraModel = { width: WIDTH, height: HEIGHT, focalPx: focalLength(WIDTH) };
  const chroma = new Uint8Array((WIDTH / 2) * (HEIGHT / 2)).fill(128);
  const header = Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F${FPS}:1 Ip A1:1 C420jpeg\n`);
  const parts: Uint8Array[] = [header];
  for (let i = 0; i < 46; i++) parts.push(Buffer.from("FRAME\n"), frame(i, camera), chroma, chroma);
  writeFileSync(FAKE_CAMERA, Buffer.concat(parts));
}
