# Probe Cam

Probe Cam turns a printed marker and a webcam into a probe. Moving a real object with your hand is closer to scanning than pressing keys, and it costs a sheet of paper.

## Using it

1. In Insonate, open **Probe Cam** (the webcam button in the probe controls), then choose **Print the marker**.
2. Print at 100 % (not "fit to page"): the black square should measure 5 cm. Keep the white margin.
3. Tape the marker flat to a small box, a phone case or a TV remote. That is your probe.
4. Hold it facing the camera, 30–60 cm away. When the status says **Tracking**, the probe follows your hand:
   - **move** the marker to slide the probe, in the direction you see in the mirrored preview and the 3D view;
   - **turn** it like a dial to rotate the probe;
   - **tip** it forward or back to fan, and sideways to rock.
5. If tracking is lost, show the marker again. The probe never jumps: it carries on from where it was, like lifting a mouse. **Re-grip** does the same on purpose.

Good light and a plain background help. Avoid glare on glossy paper.

## How it works

```text
webcam ─► <video> ─► ImageBitmap ─► tracker worker ─────────────────► main thread
                                    detect marker (ArUco 36h12)       filter (One-Euro)
                                    pose (coplanar POSIT)             map to probe pose
                                                                      controller.setPose()
```

- **Detection.** The tracker worker ([`tracker.worker.ts`](../apps/web/src/workers/tracker.worker.ts)) draws each frame into an `OffscreenCanvas` and runs the ArUco detector ([`tracker.ts`](../apps/web/src/probecam/tracker.ts)): adaptive threshold, contours, quadrilaterals, then the 6 × 6 bit code. Only marker 0 of the ARUCO_MIP_36h12 dictionary is accepted. That dictionary has a minimum Hamming distance of 12, so false detections are rare. One frame is in flight at a time, so a slow machine drops frames instead of queueing them.
- **Pose.** Coplanar POSIT recovers the marker's rotation and position from its four corners, using the printed size (50 mm) and a typical webcam field of view.
- **Reading the hand.** The preview is mirrored, so the user's right is the camera's left. [`mapping.ts`](../apps/web/src/probecam/mapping.ts) reads:
  - position (mm);
  - roll, anticlockwise as the user sees it;
  - fan and rock, as the tilt of the marker face about its own two axes. This keeps fanning and rocking separate whatever the roll.
- **Smoothing.** Each value passes through a One-Euro filter (Casiez et al., CHI 2012). It removes jitter when the hand is still and adds little lag when it moves.
- **Mapping.**
  - Slides are relative. The marker's movement on screen is converted to world directions with the 3D view's camera, then projected onto the skin under the probe. Moving right moves the probe right in the view you are looking at, whichever way the camera faces.
  - Rotation, fanning and rocking are relative to the grip: how the marker was held when it was found.
  - A jump of more than 40 mm between frames, such as a false detection or the marker reappearing elsewhere, starts a new grip instead of moving the probe.

## Privacy

The camera stream goes to a `<video>` element and a worker in the same page. No frame is stored or sent anywhere. Closing Probe Cam stops the camera.

## The vendored library

The detector and pose solver come from [js-aruco2](https://github.com/damianofalcioni/js-aruco2) (MIT). The library is CommonJS that assigns to top-level `this`, and modern bundlers compile that to `undefined`. [`scripts/vendor-aruco.ts`](../scripts/vendor-aruco.ts) therefore converts the four files Insonate needs into ES modules in [`apps/web/src/probecam/vendor`](../apps/web/src/probecam/vendor), keeping only the dictionary in use. The licence headers are kept. A unit test checks that the vendored dictionary still matches the package.

## Testing without a camera

[`synthetic.ts`](../apps/web/src/probecam/synthetic.ts) renders camera images of the marker in any pose, using a ray–plane intersection per pixel with supersampling. Unit tests use these images to check that detection and POSIT recover position, roll, fan and rock. The end-to-end test writes a short Y4M video of the marker sliding and turning, then starts Chromium with that video as a fake webcam and checks that the probe follows.
