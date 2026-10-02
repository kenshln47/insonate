# The patient: from CT to an acoustic model

Insonate ships with two patients: cases **s0319** (a man of 67) and **s0139** (a woman of 30) of the [TotalSegmentator v2 dataset](https://doi.org/10.5281/zenodo.10047292). Both are abdomen–pelvis CTs without pathology in the dataset's metadata, chosen because every abdominal organ is in the scan. The dataset holds 1,228 CT scans with 117 anatomical structures segmented, released under CC BY 4.0 by Wasserthal et al. (*Radiology: Artificial Intelligence*, 2023). This page explains how that CT becomes the files in [`apps/web/public/cases/s0319`](../apps/web/public/cases/s0319), and how to build another case.

## Rebuilding the case

```bash
npm run data:fetch            # downloads s0319 into data/raw (about 25 MB)
npm run data:build            # writes apps/web/public/cases/s0319
npm run previews              # optional: PNGs of every task view, in data/previews
```

Pass another case id to both commands, for example `npm run data:fetch -- s0245`. To offer a new case in the app, add it to [`patients.ts`](../apps/web/src/content/patients.ts).

### Downloading only one case

The full dataset is a 22.6 GB archive. [`scripts/remote-zip.ts`](../scripts/remote-zip.ts) reads the ZIP's central directory with HTTP range requests (ZIP64 included), finds the case's entries, and downloads only those bytes. The source is the [TotalSegmentator-CT-Lite](https://huggingface.co/datasets/YongchengYAO/TotalSegmentator-CT-Lite) mirror on Hugging Face, which stores the CTs at 1.5 mm.

## Build steps

[`scripts/build-case.ts`](../scripts/build-case.ts), using [`classify.ts`](../packages/sono-engine/src/classify.ts):

1. **Read** the CT and the segmentation (NIfTI-1, gunzipped in memory), apply the intensity scaling, and flip the axes to RAS order: x to the patient's right, y anterior, z toward the head.
2. **Crop** from 30 mm below the bladder to 45 mm above the liver dome, which keeps the lung bases for intercostal views. Then crop to the body outline plus a small margin. Outside air is found by flood-filling from the slice borders. The CT table and other stray objects are dropped by keeping the largest component in each slice.
3. **Smooth the organ outlines.** Segmentations are voxel staircases with stray spurs. Each solid organ's mask (liver, spleen, kidneys, gallbladder, pancreas, bladder) is blurred with a Gaussian (σ = 0.8 voxel) and thresholded at one half. Voxels that fall out return to the background; background voxels that fall in join the organ. Other organs are never overwritten.
4. **Classify** every voxel into a tissue class:
   - Segmented organs map to their tissue: liver, spleen, kidneys, gallbladder, pancreas, bladder, aorta, IVC, portal and splenic veins, bones, lungs, muscles and so on.
   - Inside the liver and spleen, voxels brighter than the organ's median by 40–45 HU are vessels (the CT is contrast-enhanced).
   - Bowel and stomach are split by HU into gas, fluid and wall. The stomach (with the abdominal oesophagus) has classes of its own, because it moves with breathing and the rest of the bowel does not.
   - The common iliac arteries and veins get classes of their own, so Doppler knows which way their blood flows.
   - Unlabelled voxels fall back to HU: below −400 is gas, below −25 is fat, above 130 is blood or contrast, and anything else is soft tissue.
   - Fat more than 22 mm below the skin is **deep fat** (retroperitoneal, perirenal and mesenteric), which is echogenic in ultrasound. Subcutaneous fat is darker.
5. **Shape the kidneys** (see [Kidneys](#kidneys) below).
6. **Clean the bowel gas.** A gas voxel with at most one gas neighbour is CT noise, not a pocket, and becomes bowel wall (two passes). A voxel of wall or fluid surrounded by gas on five or six sides becomes gas. Pockets then reflect as pockets instead of scattered specks.
7. **Add walls and capsules.** The outer voxels of the gallbladder, bladder, aorta, portal vein and IVC become their walls, and those of the liver and spleen their capsules. These are one-voxel shells with their own, brighter acoustic properties. They belong to their organ, so measurements and the coach are unchanged (aortic diameters are outer wall to outer wall, as measured clinically).
8. **Measure the organs:** volume, centroid, principal axes and extents. The aorta and IVC are restricted to their abdominal segments.
9. **Map the skin** as a radius for 180 angles around the body at every slice, lightly smoothed, so the probe can slide over it.
10. **Measure landmarks** ([`landmarks.ts`](../scripts/landmarks.ts)), from the segmentation:
    - vertebral levels (T7 to S1);
    - the ribs under the skin along lines down the body every 4°, and from them the costal margin;
    - the xiphoid (the lowest point of the sternum);
    - the umbilicus (the deepest dip of the anterior midline between L2 and L5, or the L3/L4 disc if there is none);
    - the iliac crests and anterior superior iliac spines;
    - the top of the pubic symphysis.

    In s0319 the kidneys span T11 to L3 with their hila at L1–L2, the gallbladder lies at L1–L2, the pancreas at L1–L2, the aortic bifurcation at L4–L5, the xiphoid at T9 and the umbilicus at L3/L4: textbook positions.
11. **Find reference views** for every task. In each breath (out, and a deep breath in), the coach's search proposes the 16 best, mutually distinct views by geometry, and refines each. The simulator then renders every candidate and measures how much of the organ is really visible, rib and gas shadows included. The view with the best live score wins ([coach.md](coach.md#show-me)).
12. **Mesh** the skin, bones, lungs and organs for the 3D view, and from the segmentation labels the stomach, duodenum, small bowel, colon, heart, adrenals, psoas muscles, iliac vessels and prostate. The masks are downsampled 2–4×, meshed with surface nets and Taubin-smoothed. Positions are stored as int16 multiples of 0.02 mm.

## Kidneys

CT shows each kidney as one solid organ. Ultrasound shows layers: a cortex slightly darker than the liver, darker medullary pyramids, and a bright central sinus of fat that opens at the hilum. Insonate **models** these layers from the kidney's outline, using the depth of each voxel below the capsule:

| Depth below the capsule | Becomes |
| --- | --- |
| 0–6 mm | Cortex |
| 6–13 mm | Pyramids, in a cellular pattern about 12 mm apart, separated by columns of cortex about 4 mm wide |
| Over 13 mm | Renal sinus fat |
| Hilum (the concavity filled by a morphological closing) | Renal sinus fat; any fluid becomes renal pelvis |

A 3 mm rim of echogenic perirenal fat, and a one-voxel capsule line where the kidney touches the liver, spleen or muscle, outline the organ. These layers are anatomically plausible but not this patient's real internal anatomy. The About dialog and the README say so.

## What checking the cases found

Each case is checked against its own CT and segmentation (`data/shots/verify_ct.py` and `scripts/audit-anatomy.ts`): label intensities and sides, vertebral numbering against the ribs (rib *n* joins vertebra T*n*), and the ultrasound laid over the CT cut in the same plane.

- **s0319, a man of 67.** Organs at textbook levels: kidneys T11–L3, gallbladder and pancreas L1–L2, xiphoid T9, umbilicus L3/L4. He has an **infrarenal abdominal aortic aneurysm** of about 3.7 cm (an equivalent diameter of 37.7 mm on the CT's widest axial slice, a round lumen of about 125 HU), beginning about 4 cm below the renal arteries and about 5.5 cm long. The aorta above it is 2.3–2.9 cm. His spleen is 14.9 cm pole to pole, at the upper limit of normal. These are his own findings, and the app treats them as such. As scanned, he has an aneurysm. The exam either leaves it as an incidental finding or brings his aorta to a normal calibre for a case.
- **s0139, a woman of 30.** Her organs lie low (a long, thin build), not high: the right kidney at L2–L4, the left at L1–L3, the liver reaching L4 and the gallbladder at L3. Because her right kidney hangs low, the renal arteries' level is estimated from the higher kidney.

## Output files

Each case has its own folder ([`s0319`](../apps/web/public/cases/s0319), [`s0139`](../apps/web/public/cases/s0139)):

| File | Size (s0319 / s0139) | Contents |
| --- | --- | --- |
| `volume.u8.gz` | 1.2 / 1.0 MB | Tissue classes at 1.5 mm: 269 × 199 × 299 / 280 × 158 × 265 voxels |
| `surface.f32.gz` | 0.1 / 0.1 MB | Skin radius map |
| `meshes.bin.gz` | 2.9 / 1.9 MB | Meshes: a JSON header, then int16 positions and uint16 or uint32 indices |
| `ct.u8.gz` | 1.1 / 0.8 MB | The CT itself, averaged to 3 mm and windowed from −160 to 240 HU, for the CT–ultrasound view (loaded only when that view is first opened) |
| `case.json` | 34 / 28 kB | Volume, skin map and CT geometry, organ statistics, landmarks, task reference poses with their breath, and the data source |

All the binary files are gzip-compressed. The app decompresses them in the browser with `DecompressionStream`.

## Licence and attribution

The case files are derivatives of TotalSegmentator v2 cases s0319 and s0139: cropped, classified and meshed. They remain under **CC BY 4.0**. Please keep this attribution if you reuse them:

> Wasserthal J., Breit H.-C., Meyer M. T., et al. TotalSegmentator: Robust Segmentation of 104 Anatomic Structures in CT Images. *Radiology: Artificial Intelligence* 2023;5(5):e230024. Dataset v2: [doi:10.5281/zenodo.10047292](https://doi.org/10.5281/zenodo.10047292), CC BY 4.0.
