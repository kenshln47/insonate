# How the image is made

Insonate computes every frame from a model of sound in tissue. The model is deliberately simple, but each part is physically motivated, so the familiar artefacts appear for the right reasons. Nothing is drawn on by hand. All code referred to here is in [`packages/sono-engine/src`](../packages/sono-engine/src).

## The patient: tissue classes

The CT is converted into a volume of 1.5 mm voxels, and each voxel holds one of 56 tissue classes ([`tissues.ts`](../packages/sono-engine/src/tissues.ts)). Thin walls and capsules (gallbladder and bladder walls, the aortic and portal vein walls, the liver and spleen capsules) are classes of their own, one voxel thick. The stomach has its own wall, gas and fluid classes because it moves with breathing, unlike the rest of the bowel. The iliac arteries and veins are kept apart from other blood so that Doppler knows which way they flow. Twelve classes exist only in findings: gallstone, mural thrombus, cyst, free fluid in the upper abdomen and in the pelvis, gallbladder polyp, the oedema of an inflamed gallbladder wall, haemangioma, a metastasis's core and its dark halo, pleural fluid, and liver spared by fat. Each class has four acoustic properties:

| Property | Meaning | Example values |
| --- | --- | --- |
| Impedance *Z* (MRayl) | Sets how strongly a boundary reflects | fat 1.38, liver 1.65, bone 7.8, gas 0.0004 |
| Attenuation α (dB/cm/MHz) | Energy lost along the path | bile 0.002, liver 0.5, muscle 1.0, bone 20 |
| Backscatter *b* | Echogenicity: the amplitude of scattering inside the tissue | bile 0, renal medulla 0.12, liver 0.55, deep fat 0.9, portal vein wall 1.2, renal sinus fat 1.6 |
| Heterogeneity | Coarse texture: lobules, striations | liver 0.12, bowel 0.6 |

The values are typical figures, rounded for teaching. They are not measured from this patient.

## Probe model

The skin is stored as a cylindrical height field: for every height *z* and angle φ around the body's long axis, the distance from the axis to the skin ([`surface.ts`](../packages/sono-engine/src/surface.ts)). φ = 0° is anterior, +90° the patient's right and −90° the left.

A probe pose uses the five movements sonographers use ([`probe.ts`](../packages/sono-engine/src/probe.ts)):

| Movement | Pose field | Effect |
| --- | --- | --- |
| Slide | φ, *z* | Moves the contact point over the skin |
| Rotate | `rotationDeg` | 0° is longitudinal (marker toward the head); 90° is transverse (marker toward the patient's right) |
| Fan (tilt) | `tiltDeg` | Sweeps the beam out of the image plane, about the probe's long axis |
| Rock (heel–toe) | `rockDeg` | Angles the beam within the image plane |

From the pose, the code builds a frame on the skin: an origin, a beam direction (into the body), a lateral direction (toward the probe's marker, shown on the left of the image) and the plane normal.

**How the face sits.** With no fan or heel–toe, the beam is square to the skin, but to the skin under the whole face, not at a point. The skin's normal is a least-squares fit of its height across ±12 mm along the body and around it, as a probe face rests on centimetres of skin. The segmented surface steps by 1.5 mm; differenced over 4 mm, as it first was, it tipped the beam by up to 13° per millimetre of slide, enough to move a structure 10 cm deep by 2 cm. Fitted across the face, the beam turns with the body's real curve: a median of 0.4° per millimetre on these patients (a radius of about 15 cm) and at most 3–5°.

**Pressure.** Holding the probe in builds up graded compression over half a second and releases it faster. The face sinks up to 12 mm into the wall (`PRESS_WALL_MM`), and bowel gas within 75 mm of it at full pressure (`PRESS_CLEAR_MM`) is pushed aside: the loop is squeezed empty, so its gas becomes bowel wall in the trace and in the anatomy outlines. Deeper gas stays, and so do organs, which do not deform.

**Dragging the image.** Grabbing the image and dragging it moves the probe so that the anatomy under the pointer follows. A small damped least-squares solve (Levenberg–Marquardt) finds slide, heel–toe and fan, starting from where the hand already is, against the point's miss across the image and out of the plane, plus a light cost on how far the hand has moved. Sliding is cheapest. Where sliding barely moves a deep point (under a convex body wall a deep point pivots with the probe), heel–toe is used instead, and the fan brings the plane back onto the point when an oblique slide carries it off. Each solver step is limited and must bring the point closer. The probe moves at most three times as far as the pointer asks, so it never leaps; where the target cannot be reached, it lags. Dragging up or down slides across the plane, sweeping through the anatomy.

Two transducers are modelled:

| Probe | Face | Lines | Default frequency | Depth range |
| --- | --- | --- | --- | --- |
| C6-2 curvilinear | Radius 50 mm, 68° sector | 192 | 3.5 MHz (2–6 MHz) | 4–24 cm |
| L14-5 linear | 40 mm wide | 160 | 8 MHz (5–14 MHz) | 2–10 cm |

## Scanlines

For each line, the simulator ([`simulate.ts`](../packages/sono-engine/src/simulate.ts)) takes these steps:

1. **Find the skin.** A curved face cannot touch a curved body everywhere, so each line starts where it enters the body. A gap of up to 60 mm is allowed, as if the probe were pressed in. Lines that find no skin are black, which is lost contact. A line that leaves the body again returns nothing.
2. **March through the tissue** in steps of 1/max(3, *f*) mm, where *f* is in MHz, walking the voxel grid incrementally. A stable sub-voxel jitter softens the voxel staircase at organ boundaries.
3. **Reflect at boundaries.** Where the tissue class changes, the pressure reflection coefficient is *r* = (*Z*₂ − *Z*₁)/(*Z*₂ + *Z*₁). The echo is proportional to |*r*| and to the energy that *reached* the boundary. It also depends on the angle of incidence: it is strongest head-on, with the boundary normal taken from the local impedance gradient over two voxels, so the voxel staircase does not flicker. Gas and bone surfaces are rough and reflect from almost any angle. After the echo, the transmitted beam keeps the fraction 1 − *r*² of its energy. That is why a rib or a gas pocket shows a bright surface with darkness behind it.
4. **Scatter inside tissue.** Each tissue scatters with amplitude *b*, modulated by its coarse texture. The scattering is **coherent**: in-phase and quadrature amplitudes come from a lattice of complex Gaussian scatterers fixed in the tissue, at about one wavelength spacing. Because the scatterers belong to the tissue and not to the screen, speckle stays put when the probe moves slightly and decorrelates when the plane leaves it, as real speckle does.
5. **Attenuate** both ways, by 10^(−2 α *f* Δ*z* / 20) per step.
6. **Ring and reverberate behind gas.** The first reflector with *r*² > 0.9 (gas, not bone) rings. A gray, streaky haze of echoes about 20 dB below the surface echo fades over about 9 mm, giving the "dirty" shadow behind bowel gas, in contrast to the clean shadow behind bone. Under a flat pleural line, repeated echoes at multiples of its depth form A-lines.
7. **Mirror at the diaphragm.** Where the liver or spleen meets aerated lung, the dome acts as a mirror. Echoes from a depth δ before the diaphragm return as if from δ beyond it, weakened by the extra path, so the liver appears again above the diaphragm, as it does on real scanners.
8. **Layer the abdominal wall.** In subcutaneous fat, bright fibrous septa run roughly parallel to the skin about every 4.5 mm; in muscle, fine striations run every 1.6 mm. Both are wavy and follow the depth below the skin.

## Breathing

The CT was taken near end-expiration (the right hemidiaphragm is at T8), so the scanned volume is the "breathe out" state. A deep breath in pushes the contents of the abdominal cavity toward the feet: liver, gallbladder, spleen, kidneys, pancreas, stomach and bowel, the portal vein, IVC, adrenals, the fat and soft tissue among them, and the lung bases. How far depends on height (`breathProfile`): the full **30 mm** within 6 cm of the top of the liver, fading smoothly to nothing at the top of the bladder. A kidney therefore moves less than the liver above it, as it does in life. Quiet breathing moves everything up to a quarter of a deep breath, in a 4.5 s cycle.

Each slice of the volume shows the moving tissue from that many slices higher. Fixed structures never give way: the body wall, muscles (psoas, quadratus), ribs and spine, aorta, iliac vessels and bladder stay where they are. Moving tissue only ever takes the place of moving tissue, so organs slide beside fixed structures, never into them. Where moving tissue has gone, the lung slides down into the space, as in the costophrenic recess. Moving tissue carries its speckle with it.

One rule ([`withBreath`](../packages/sono-engine/src/volume.ts)) serves every part of the app, so they always agree. The image, the anatomy outlines, the CT view, the coach's geometry, measurements, Doppler and the organs in the 3D view all move together. Each guided task names the breath it is usually scanned in, for example a deep breath in for the liver, gallbladder and kidneys, and **Show me** asks the patient for it.

## Beam and speckle

The echo lines are convolved with the beam's point-spread function, which is separable and energy-normalised:

- **Axial:** a Gaussian with σ = 0.7 λ (λ = 1.54 mm / *f*), so higher frequencies give finer axial detail.
- **Lateral:** a Gaussian beam. Its width is narrowest at the focus and widens over a Rayleigh range of about 30 mm: *w*(*d*) = 0.45 · (3.5 / *f*) · √(1 + ((*d* − focus) / 30)²) + 0.1 mm.

Because the scattering is complex and the convolution is coherent, the envelope |*re* + *i im*| has the Rayleigh statistics of fully developed speckle. The grain size follows from frequency and focus without any texture being painted on.

## From echoes to pixels

1. **Compounding:** when speckle reduction is on, the echo *intensity* is averaged over about one speckle cell (five samples along the beam, three lines across). Like a scanner's spatial compounding, averaging intensity rather than log values fills the deep speckle nulls (the dark specks) without blurring organ edges much.
2. **Envelope and noise:** amplitude, plus a little electronic noise (Rayleigh, about −68 dB).
3. **Gain:** overall gain, plus the user's 8-band TGC interpolated with depth, plus an automatic depth compensation of 0.95 · *f* dB/cm. That last term makes average soft tissue look evenly bright, as a modern scanner does.
4. **Log compression** to the chosen dynamic range.
5. **Speckle reduction:** an edge-preserving (bilateral) filter on the log image. It smooths differences of a few dB (speckle) and keeps those of tens of dB (organ edges), blended with the original by the chosen level.
6. **Persistence:** averaging with the previous frame (off, 30 %, 50 % or 65 %). It is reset when the probe jumps, so a new view never ghosts.
7. **Gray map:** a gentle S-curve, with deep blacks for fluid, open mid-tones for parenchyma and a soft roll-off for bright echoes. The gray bar on the screen is drawn from the same curve.
8. **Scan conversion** from lines and samples to the fan-shaped image, at the screen's own pixel size, through a cached table of indices and weights (one 32-bit write per pixel).

## Artefacts that emerge

| Artefact | Where it comes from in the model |
| --- | --- |
| Bright bone surface with a clean shadow behind | Large impedance step (the echo carries the incident energy, the beam keeps little) and α = 20 dB/cm/MHz |
| "Dirty" shadow behind gas | Total reflection, then a fading, streaky ring-down haze |
| A-lines under the pleura | Repeated reverberation between probe and a flat gas surface |
| Mirror image of the liver above the diaphragm | Echoes reflected by the dome appear as far beyond it as their source lies before it |
| Posterior enhancement behind the gallbladder, bladder and cysts | Fluid barely attenuates while the automatic depth compensation still adds gain |
| Brighter boundaries seen head-on | The incidence term of the specular echo |
| Speckle that changes with frequency and focus | Coherent scattering and the point-spread function |
| Loss of image when the face lifts off | Lines that find no skin |

These are checked by unit tests ([`simulate.test.ts`](../packages/sono-engine/test/simulate.test.ts)). In a cylinder phantom:

- a fluid sphere must be anechoic with brighter tissue behind it;
- a bone plate must cast a shadow;
- a gas pocket must show a bright surface over a darker shadow;
- a lung below the liver must show the mirror image, which bowel gas must not;
- gain must brighten the image, and rendering must be deterministic.

## Doppler

### Blood flow

Every voxel of the large vessels gets three things ([`flow.ts`](../packages/sono-engine/src/flow.ts)):

- a flow direction;
- a place in the vessel's laminar profile;
- a vessel type.

The direction comes from the vessel's own shape. A geodesic distance (Dijkstra over 26 neighbours) is grown through the vessel from where blood enters it. Blood flows down that distance, smoothed over a 5-voxel neighbourhood.

| Vessel | Blood enters at | Peak speed | Waveform |
| --- | --- | --- | --- |
| Aorta | its top | 90 cm/s | High-resistance, triphasic: systolic peak, brief reversal, small forward wave |
| Iliac arteries | the bifurcation (top of each side) | 105 cm/s | Triphasic, with a deeper reversal |
| IVC | its bottom | 28 cm/s | Toward the heart in systole (S) and diastole (D), briefly reversed by atrial contraction (a) |
| Portal and splenic vein | the spleen (the patient's left end) | 22 cm/s | Continuous toward the liver, gently undulating |
| Portal branches in the liver | the portal vein | 22 cm/s | As the portal vein |
| Hepatic veins | drain toward the IVC | 32 cm/s | As the IVC |
| Iliac veins | the bottom of each side | 16 cm/s | Continuous, phasic |

Liver vessels are split between the two trees by which source is nearer along the vessels. The speed across the lumen is parabolic (laminar): zero at the wall and full on the axis. It is computed from each voxel's distance to the wall and the vessel's local radius. The heart rate is 72 beats per minute.

### Colour Doppler

While the scanlines are traced, each sample of flowing blood inside the colour box records two things: its velocity *toward* the probe at that moment of the cardiac cycle (*v* · cos θ), and the echo power that reached it. Then, as on a scanner:

1. The velocity is averaged over about two lines and ±1.7 mm of depth, weighted by power. Colour resolves less finely than B-mode.
2. The power, compensated for depth like the B-mode, must clear a threshold set by the **colour gain**. Above +6 dB, noise begins to paint random colour over tissue.
3. Estimation noise is added: small for strong signals, larger near the threshold.
4. The **wall filter** removes velocities slower than 6 % of the scale.
5. Velocities beyond the **scale** wrap to the other end: **aliasing**. The scale is the Nyquist limit, ± PRF · c / 4 *f*₀.
6. Colour is written only where the B-mode is dark (the lumen), and it lingers for two frames (colour persistence).

The colour map follows the BART convention, **B**lue **A**way, **R**ed **T**oward, and turns warmer (yellow, cyan) toward the Nyquist limit. *Invert* swaps the colours. With a curvilinear probe over a horizontal vessel, one side of the fan is red and the other blue, with a black gap where the beam meets the flow at 90°, as on a scanner.

### Spectral (PW) Doppler

The sample volume (gate) lies on the Doppler line through the scanline. Every blood sample inside it, along the beam and across the beam's width and slice thickness, contributes its speed toward the probe at each moment of the cardiac cycle.

- **Display.** The spectrum scrolls at 4 s across, with spectral broadening and the grain of a real spectrum. Speeds beyond the scale wrap around.
- **Angle correction** divides by cos θ. Above 60°, the app warns that speeds are unreliable. *Align with the vessel* sets θ to the flow's direction in the image plane, which is all a real scanner can know too: a vessel that crosses the plane obliquely still gives a wrong speed.
- **Auto-trace** reports PSV, EDV and RI for arteries, and peak and lowest speeds for veins.
- **Sound.** The Doppler shift is audible (2 *f*₀ *v* / *c*, a few hundred hertz to a few kilohertz) as band-passed noise. Flow toward the probe plays in the left ear and flow away in the right.
- **Shadowing.** Bone and gas in the path silence the signal.

## Findings

Findings are painted into the patient's tissue volume ([`findings.ts`](../packages/sono-engine/src/findings.ts)), so their signs come from the same physics as normal anatomy. Each is made to order: its size, side, grade and place are parameters, so the exam can draw them at random. Several can be combined in one patient, and the same parameters always make the same patient.

| Finding | How it is made | Signs that emerge |
| --- | --- | --- |
| Gallstones | 1–6 stones (*Z* = 6.0 MRayl, α = 30 dB/cm/MHz) resting on the floor (supine: the back) of the gallbladder, from its lowest point | Bright curved surfaces with clean shadows |
| Gallbladder polyp | A soft-tissue nodule (backscatter 0.9, α = 0.7) on the non-dependent wall | Echogenic, no shadow, does not move |
| Acute cholecystitis | The wall grows outward to 6–10 mm in three layers (bright mucosa, dark oedema, bright serosa); a rim of fluid around it; a stone impacted in the neck | The thick, striated wall, pericholecystic fluid, the stone's shadow; the patient winces under the probe |
| Fatty liver | Liver backscatter and attenuation rise by grade: 0.95/0.60, 1.30/0.78, 1.70/1.00 (normal 0.55/0.50); at grades 2–3, optionally a tongue of normal liver beside the gallbladder | Brighter than the kidney's cortex; vessel walls and the diaphragm fade at higher grades; focal fatty sparing |
| Liver cyst | A sphere of fluid, placed at random wholly inside the liver, clear of the big vessels and the dome | Anechoic, posterior enhancement |
| Haemangioma | Two or three overlapping balls (backscatter 2.0, α = 0.35) | A well-defined, homogeneously bright, lobulated lesion |
| Metastases | 3–7 target lesions of different sizes, apart from each other: a core (0.75) inside a dark halo (0.09) | Bull's-eye lesions through the liver |
| Hydronephrosis | The core of the sinus becomes urine; from grade 2 the calyces next to it, with an extrarenal bulge; at grade 3 ballooned calyces and a 4.6 mm rim of cortex. The pelvis is grown to at least 10, 15 or 22 mm across by grade | A dilated pelvis splitting the sinus; rounded calyces; a thin cortex |
| Renal stone | A ball of stone in a lower-pole calyx, or at the pelviureteric junction (with hydronephrosis: obstructing) | A bright focus with a shadow, hard to see in the bright sinus |
| Renal cyst | A sphere centred on the kidney's surface, about half outside it | Exophytic, anechoic, enhancement |
| Aortic aneurysm | An infrarenal spindle of the chosen width, forward and to the left; crescentic thrombus around an eccentric lumen of the chosen share | The sac, the thrombus, colour only in the lumen |
| Free fluid | Small: Morison's pouch. Moderate: also the liver tip, around the spleen and behind the bladder. Large: also around the bowel loops and under the abdominal wall, never in the retroperitoneum | The black stripe of a positive FAST; floating loops in ascites |
| Splenomegaly | The spleen grows from its upper pole downward and forward to the chosen length, pushing bowel and stomach aside; bone, muscle and kidney stay | A long spleen reaching below the kidney's upper pole |
| Pleural effusion | Fluid layering at the back of the chest (supine), deepest at the costophrenic recess, thinning over 16 cm | Anechoic fluid above the diaphragm, the spine seen through it |

Two more are not findings but adjust the patient for a case. The infrarenal aorta can be brought to a normal calibre, undoing the 67-year-old's own aneurysm. **Graded compression** clears bowel gas from in front of the aorta, as a sonographer does to see an aneurysm. The bowel stays; its gas goes.

Each finding returns its true sizes, and the patient is then measured as a sonographer would report it (`measureCase`):

- the kidneys' and spleen's pole-to-pole lengths, along each organ's long axis;
- the aorta's widest outer diameter, across the vessel whatever its course, below the renal arteries and above them.

The renal arteries are placed 15 mm below the middle of the higher kidney, since they leave the aorta at L1–L2 even when a kidney hangs low. The exam is marked against these numbers.

*Show me* aims the probe at a finding wherever it was placed (`aimAt`). Over the reachable skin and six image orientations, it fans the probe until the point is in the image plane, then heel-toes it toward the middle of the sector. It keeps views whose way in is clear of bone, gas and aerated lung across five rays spanning 32 mm, and the middle ray must be clear. A pleural effusion is preferably seen through the liver or spleen, as from the flank. The breath (in or out) that shows the point best is chosen with it.

### The teaching cases

The Cases tab uses fixed recipes of these findings ([`pathology.ts`](../packages/sono-engine/src/pathology.ts)):

| Case | What changes | Signs that emerge |
| --- | --- | --- |
| Gallstones | Three stones (13, 9 and 7 mm) rest on the most dependent (posterior) part of the gallbladder; *Z* = 6.0 MRayl, α = 30 dB/cm/MHz | Bright curved surfaces with clean acoustic shadows |
| Free fluid (FAST) | Anechoic fluid fills Morison's pouch and surrounds the tip of the liver, the spleen and the back of the bladder | The black stripe of a positive FAST |
| Hydronephrosis | The core of the right renal sinus and the inner pyramids become urine, keeping a rim of sinus fat | A dilated pelvis and rounded calyces |
| Aortic aneurysm | An infrarenal spindle, 5.2 cm across and 8 cm long, grows forward and to the left. Crescent-shaped mural thrombus surrounds an eccentric lumen. Bowel gas in front is cleared, as compression would | The sac, the thrombus, and colour only in the lumen |
| Liver cyst | A 3.4 cm sphere of fluid sits deep in the lower right lobe | Anechoic, thin smooth wall, posterior enhancement |
| Fatty liver | Grade 2: liver backscatter rises from 0.55 to 1.30, and attenuation from 0.50 to 0.78 dB/cm/MHz | A bright liver that fades with depth, much brighter than the kidney |

The changes are deterministic, so the simulation worker and the 3D view build the same patient. The blood flow is rebuilt for the changed anatomy.

## Performance

A frame is about 192 lines × 500–1,000 samples. The inner loop walks voxel space incrementally and reads lookup tables (attenuation per step, noise, gray map), with no allocation. The stages take about 6 ms (tracing), 3 ms (beam), 3 ms (compounding and compression), 3 ms (speckle reduction and persistence) and 1 ms (scan conversion) on a laptop. That is about 15–20 ms per frame in a Web Worker, so the interface stays responsive. Colour Doppler adds about 5 ms. The blood flow is built once, in under a second, when Doppler is first switched on. The controller sends a new frame only when the previous one has arrived.

## What is not modelled

- Refraction, so there is no edge shadowing and no beam bending at fat–muscle interfaces.
- Organs giving under the probe: pressing in pushes bowel gas aside and brings the face closer, but no organ is squeezed and the IVC does not flatten.
- Side lobes and grating lobes.
- Frequency-dependent scattering, harmonic imaging and multiple transmit foci.
- Parts of Doppler:
  - turbulence;
  - the vessels CT does not segment (renal, mesenteric and splenic branches carry no flow);
  - colour blooming and twinkling;
  - breathing's effect on venous flow.

  Flow speeds are typical adult values with one waveform per vessel type, not this patient's.
- The kidneys' internal anatomy, which is modelled from each kidney's outline (see [data.md](data.md#kidneys)).
