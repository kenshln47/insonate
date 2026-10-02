# The coach

The coach answers three questions while you scan: how good is this view, which way should I move, and is my measurement right? It works from geometry, the organ and the scan plane, rather than from the pixels, so it is fast and explainable. The code is in [`coach.ts`](../packages/sono-engine/src/coach.ts).

## Tasks

A task ([`ABDOMEN_TASKS`](../packages/sono-engine/src/coach.ts)) names:

- an organ;
- a view type: **long** (the organ's long axis lies in the plane) or **short** (the plane cuts across it);
- the expected probe orientation (longitudinal or transverse);
- the probe type and image depth;
- other organs that must also be visible (Morison's pouch needs the liver with the kidney);
- an optional measurement;
- the range of φ that sonographers use for this view. A supine patient's back is out of reach;
- the breath the view is usually taken in: a deep breath in for the liver, gallbladder and kidneys, which brings them down from under the ribs, and breathing out for the aorta, IVC and pancreas.

Each organ's centroid, principal axes and extents come from the segmentation at build time ([`organs.ts`](../packages/sono-engine/src/organs.ts)). The aorta and IVC are restricted to their abdominal segment. The coach scores against the organs where the patient's breath has put them: in a deep breath in, the liver, gallbladder, spleen, kidneys and pancreas sit 30 mm lower, and so do their centroids.

## Score

The geometric score is a product of five factors, each between 0 and 1:

| Factor | Question | How it is computed |
| --- | --- | --- |
| centred | Does the plane pass through the organ? | exp(−(*d*/tol)²), where *d* is the distance of the organ centre from the plane. The tolerance is 22 % of the organ's thickness for long views and 15 % of its length for short views, and at least 5 mm. |
| aligned | Is the plane oriented for this view? | exp(−(θ/16°)²), where θ is the angle between the plane and the organ's long axis (long views) or between the plane's normal and that axis (short views). |
| in view | Is the organ inside the image? | Lateral position within the sector, and depth above 85 % of the image depth. Other required organs must reach the plane. |
| access | Can sound get there? | Five rays from the probe face to points across the organ: along its length for long views, so a rib over a pole counts, and across its width for cross-sections. The central ray weighs most. A ray is blocked by bone, aerated lung or more than 2 mm of gas: Insonate does not model probe pressure, so gas cannot be pushed aside. |
| contact | Is the face on the skin? | The share of the face that touches the skin. |

**score = 100 · centred^0.8 · aligned · in view · access · contact**

The **live score** shown on screen also checks the rendered image. It is discounted when the organ's visible area is small compared with the cross-section the view should show: live = score · (0.35 + 0.65 · visible fraction). This catches views that are geometrically right but hidden, for example behind a shadow. A view counts as **achieved** when the live score stays at 80 or above for 0.7 s.

## Hints

Whenever the probe moves (at most four times a second), the coach tries ten small moves: slide 8 mm toward the head, the feet or either side, rotate ±12°, fan ±8° and rock ±8°. It suggests the one that raises the score most, if any raises it by more than 1.5 points. The advice is data, not text: a move and an anatomical direction, found by comparing the probe frames before and after the move. The interface words it in the chosen language: *"Slide the probe toward the head"*, or *"حرّك المسبار نحو الرأس"* in Arabic.

When the probe is far from the organ (score below 5), small moves change nothing. The coach then points toward the organ's usual window instead: up or down to the organ's height, around the body into the task's approach range, then into the right orientation.

## "Show me"

Each task has a reference pose, found at build time, in each breath. The task's usual breath is kept unless the other shows the organ more than 15 % better in this patient; *Show me* then asks the patient for that breath as it glides the probe there. `candidatePoses` runs a grid search over height, φ (within the approach range), rotation and tilt, and keeps the 16 best views that differ from one another. `refinePose` then refines each one coordinate by coordinate, in steps of 6°, 3° and 1.5°. Among good views, the search prefers the textbook layout: a long organ lying across the screen, not along the beam, so its walls face the beam and the whole organ fits. Finally the simulator renders every refined candidate. The one with the best live score, meaning the organ is really visible and not hidden by a rib or by gas, becomes the reference.

## Where the probe is

Under the probe pad, Insonate says where the probe sits in anatomical words, from landmarks measured on the CT at build time ([`landmarks.ts`](../scripts/landmarks.ts), [`where.ts`](../apps/web/src/sim/where.ts)):

- **the region**: epigastrium, the four quadrants (divided at the umbilicus), the flanks, around the umbilicus, suprapubic, or the lower chest;
- **the surface line**: midline, paramedian, mid-clavicular, or the anterior, mid or posterior axillary line, from the probe's position across the body's width at that height;
- **the ribs**: on rib *n* (expect its shadow), intercostal between ribs *n* and *n* + 1, subcostal (and how far below the costal margin), or how far below the xiphoid in the midline. The ribs are traced from the CT along lines down the body every 4°;
- **the vertebral level** at the probe's height.

The body marker on the image is drawn to the patient's own landmarks: xiphoid, umbilicus and pubic symphysis, with the costal margin, so it shows truthfully whether the probe is over the ribs.

## Measurement grading

When you measure in a task with a measurement (kidney or spleen length, aortic diameter), Insonate measures the organ's true cross-section in your scan plane (`crossSection`). It samples the plane every 0.5 mm, takes the organ's pixels, and finds their principal in-plane axis. Your caliper length is then compared with:

- the **in-plane size**: the length along the principal axis, or the anterior–posterior diameter for the aorta. Within 8 % counts as accurate;
- the **organ's true 3D length**, for length measurements. If your plane shows less than 90 % of it, the coach explains **foreshortening**: the organ is longer than your plane suggests, so rotate and fan until it is at its longest.

## Limits

- The score judges the plane, not the image settings. Gain, depth and focus are not scored yet.
- Reference poses are specific to each patient (each is found for that patient's anatomy).
- Organs are described by their centroid, principal axes and extents, which suits compact organs (kidney, spleen, gallbladder) better than curved ones (pancreas).
