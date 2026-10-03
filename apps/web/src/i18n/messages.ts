import type { Advice, Direction, OrganKey, Variant } from "@insonate/sono-engine";
import type { Cage, Region, SurfaceLine } from "../sim/where";
import { REPORT_AR, REPORT_EN, type ReportCopy } from "./report";

export type Language = "en" | "ar";

/** A teaching case: the patient's story, what to look for, and why it matters. */
export interface CaseCopy {
  readonly title: string;
  readonly history: string;
  readonly signs: string;
  readonly teaching: string;
}

export interface TaskCopy {
  readonly title: string;
  readonly goal: string;
  readonly how: string;
  readonly tip: string;
  readonly measurement?: { readonly label: string; readonly normal: string };
}

type ProbeCamStatus = "starting" | "searching" | "tracking" | "denied" | "unavailable";

/** Structures in the 3D view that are not organs of the tasks. */
export type StructureKey =
  | "bone"
  | "lung"
  | "skin"
  | "stomach"
  | "duodenum"
  | "smallBowel"
  | "colon"
  | "heart"
  | "adrenals"
  | "psoas"
  | "iliacArteries"
  | "iliacVeins"
  | "prostate";

/** Surface landmarks drawn in the 3D view. */
export type LandmarkKey = "costalMargin" | "xiphoid" | "umbilicus" | "asisRight" | "asisLeft" | "symphysis";

/** Every word Insonate shows, in one language. */
export interface Messages {
  readonly dir: "ltr" | "rtl";
  readonly languageName: string;
  readonly header: {
    readonly tagline: string;
    readonly mode: string;
    readonly freeScan: string;
    readonly guidedTasks: string;
    readonly cases: string;
    readonly report: string;
    readonly about: string;
    readonly shortcuts: string;
    readonly lightTheme: string;
    readonly darkTheme: string;
    readonly switchLanguage: string;
    readonly share: string;
    readonly patient: string;
    readonly patientTitle: string;
    readonly patientName: (sex: "m" | "f", age: number) => string;
    readonly copied: string;
    readonly copyFailed: string;
  };
  readonly loading: { readonly preparing: string; readonly failed: string };
  readonly footer: { readonly local: string; readonly source: string; readonly anatomy: string; readonly notDevice: string };
  readonly organs: Readonly<Record<OrganKey, string>>;
  readonly structures: Readonly<Record<StructureKey, string>>;
  readonly landmarks: Readonly<Record<LandmarkKey, string>>;
  readonly screen: { readonly image: string; readonly frozen: string; readonly contact: string };
  readonly cine: {
    readonly label: string;
    readonly play: string;
    readonly pause: string;
    readonly scrub: string;
    readonly position: (frame: number, frames: number, seconds: number) => string;
  };
  readonly pad: {
    readonly region: string;
    readonly slide: string;
    readonly rotate: string;
    readonly fan: string;
    readonly rock: string;
    readonly startFrom: string;
    readonly positionsLabel: string;
    readonly positionsPlaceholder: string;
    readonly probeCam: string;
    readonly webcam: string;
    readonly on: string;
    readonly probeCamLabel: string;
    readonly probeCamTitle: string;
    /** The Press key: hold to press the probe in (graded compression). */
    readonly press: string;
    readonly pressLabel: string;
    /** How the mouse moves the probe: [gesture, what it does]. */
    readonly mouse: ReadonlyArray<readonly [string, string]>;
    readonly moves: Readonly<
      Record<
        "head" | "feet" | "aroundRight" | "aroundLeft" | "rotateCcw" | "rotateCw" | "fanUp" | "fanDown" | "rockMarker" | "rockAway",
        string
      >
    >;
  };
  readonly positions: Readonly<Record<string, string>>;
  /** The probe's position in anatomical words. */
  readonly where: {
    readonly label: string;
    readonly side: Readonly<Record<"right" | "left" | "centre", string>>;
    readonly lines: Readonly<Record<SurfaceLine, string>>;
    readonly regions: Readonly<Record<Region, string>>;
    readonly cage: (cage: Cage) => string;
    readonly level: (level: string) => string;
  };
  readonly machine: {
    readonly title: string;
    readonly transducer: string;
    readonly curvilinear: string;
    readonly linear: string;
    readonly curvilinearTitle: string;
    readonly linearTitle: string;
    readonly frequency: string;
    readonly frequencyHint: string;
    readonly depth: string;
    readonly gain: string;
    readonly focus: string;
    readonly focusHint: string;
    readonly dynamicRange: string;
    readonly dynamicRangeHint: string;
    readonly speckle: string;
    readonly persistence: string;
    readonly levels: readonly [string, string, string, string];
    readonly tgc: string;
    readonly tgcLabel: string;
    readonly reset: string;
    readonly tgcBand: (band: number) => string;
  };
  readonly doppler: {
    readonly title: string;
    readonly mode: string;
    readonly off: string;
    readonly color: string;
    readonly pw: string;
    readonly colorTitle: string;
    readonly pwTitle: string;
    readonly scale: string;
    readonly scaleHint: string;
    readonly colorGain: string;
    readonly colorGainHint: string;
    readonly invert: string;
    readonly box: string;
    readonly boxSizes: readonly [string, string, string];
    readonly boxHint: string;
    readonly gate: string;
    readonly gateHint: string;
    readonly angle: string;
    readonly angleHint: string;
    readonly matchAngle: string;
    readonly preparing: string;
    readonly spectrum: string;
    readonly noFlow: string;
    readonly shadowed: string;
    readonly angleOff: (vessel: number) => string;
    readonly steep: string;
    readonly sound: string;
    readonly soundTitle: string;
    readonly vessel: (kind: string) => string;
  };
  readonly tools: {
    readonly breathing: string;
    readonly breathe: string;
    readonly breatheTitle: string;
    readonly inspire: string;
    readonly inspireTitle: string;
    readonly expire: string;
    readonly freeze: string;
    readonly unfreeze: string;
    readonly measure: string;
    readonly measureTitle: string;
    readonly clear: string;
    readonly labels: string;
    readonly anatomy: string;
    readonly anatomyTitle: string;
    readonly ct: string;
    readonly ctTitle: string;
    readonly ctBlend: string;
    readonly ctHint: string;
    readonly ctLabel: (moved: boolean) => string;
    readonly perFrame: (ms: number) => string;
    readonly contact: (percent: number) => string;
  };
  readonly context: {
    readonly region: string;
    readonly camera: string;
    readonly layers: string;
    readonly presets: Readonly<Record<"sonographer" | "front" | "left" | "plane", { readonly label: string; readonly title: string }>>;
    readonly layerNames: Readonly<Record<"skin" | "organs" | "bowel" | "bones" | "lungs" | "landmarks", string>>;
    readonly cut: string;
    readonly cutTitle: string;
    readonly hint: string;
  };
  readonly tasks: {
    readonly title: string;
    readonly intro: string;
    readonly back: string;
    readonly achieved: string;
    readonly almost: string;
    readonly close: string;
    readonly searching: string;
    readonly wellDone: string;
    readonly begin: string;
    readonly centred: (organ: string) => string;
    readonly longAxis: string;
    readonly across: string;
    readonly inView: string;
    readonly access: string;
    readonly contact: string;
    readonly mmOff: (mm: number) => string;
    readonly degreesOff: (degrees: number) => string;
    readonly showMe: string;
    readonly how: string;
    readonly freezeStep: string;
    readonly dragStep: (kind: "length" | "diameter") => string;
    readonly freezeMeasure: string;
    readonly check: string;
    readonly youMeasured: string;
    readonly inThisPlane: string;
    readonly trueLength: (length: string) => string;
    readonly foreshortened: string;
    readonly fullLength: string;
    readonly cm: string;
  };
  readonly taskCopy: Readonly<Record<string, TaskCopy>>;
  readonly cases: {
    readonly title: string;
    readonly intro: string;
    readonly mystery: string;
    readonly mysteryText: string;
    readonly load: string;
    readonly back: string;
    readonly history: string;
    readonly look: string;
    readonly teaching: string;
    readonly showFinding: string;
    readonly preparing: string;
    readonly question: string;
    readonly check: string;
    readonly correct: string;
    readonly wrong: (answer: string) => string;
    readonly next: string;
    readonly endQuiz: string;
    readonly shareMystery: string;
    readonly unknown: string;
    readonly nativeNote: string;
    readonly facts: (variant: Variant, facts: Readonly<Record<string, number>>) => string | null;
    readonly findings: Readonly<Record<string, string>>;
    readonly items: Readonly<Record<Variant, CaseCopy>>;
  };
  readonly report: ReportCopy;
  readonly advice: (advice: Advice, organ: string) => string;
  readonly probeCam: {
    readonly title: string;
    readonly status: Readonly<Record<ProbeCamStatus, string>>;
    readonly help: Readonly<Record<ProbeCamStatus, string>>;
    readonly regrip: string;
    readonly print: string;
    readonly privacy: string;
    readonly preview: string;
    readonly close: string;
    readonly steps: readonly string[];
    readonly caption: string;
    readonly printButton: string;
    readonly markerLabel: string;
  };
  readonly dialogs: { readonly about: string; readonly shortcuts: string; readonly marker: string; readonly close: string };
  readonly about: {
    readonly intro: string;
    readonly howTitle: string;
    readonly how: readonly string[];
    readonly limitsTitle: string;
    readonly limits: string;
    readonly dataTitle: string;
    readonly dataBefore: (caseId: string) => string;
    readonly dataAfter: (license: string) => string;
    readonly notDevice: string;
  };
  readonly shortcuts: ReadonlyArray<readonly [string, string]>;
  readonly welcome: {
    readonly title: string;
    readonly steps: ReadonlyArray<{ readonly title: string; readonly text: string }>;
    readonly start: string;
    readonly tasks: string;
    readonly dismiss: string;
  };
}

const EN_DIRECTIONS: Readonly<Record<Direction, string>> = {
  head: "the head",
  feet: "the feet",
  right: "the patient's right",
  left: "the patient's left",
  anterior: "the front (anterior)",
  posterior: "the back (posterior)",
};

const en: Messages = {
  dir: "ltr",
  languageName: "English",
  header: {
    tagline: "Abdominal ultrasound scanning simulator",
    mode: "Mode",
    freeScan: "Free scan",
    guidedTasks: "Guided tasks",
    cases: "Cases",
    report: "Report",
    about: "About Insonate",
    shortcuts: "Keyboard shortcuts",
    lightTheme: "Light theme",
    darkTheme: "Dark theme",
    switchLanguage: "عربي",
    share: "Copy a link to this view, task or case",
    patient: "Patient",
    patientTitle: "Each patient is a different real CT: a different body, with organs of their own size and place",
    patientName: (sex, age) => `${sex === "m" ? "Man" : "Woman"}, ${age}`,
    copied: "Link copied",
    copyFailed: "Copy this link:",
  },
  loading: { preparing: "Preparing the patient: anatomy from a real CT scan…", failed: "Could not load the patient." },
  footer: {
    local: "Insonate · runs entirely in your browser",
    source: "Source on GitHub",
    anatomy: "Anatomy",
    notDevice: "teaching tool, not a medical device",
  },
  organs: {
    liver: "Liver",
    gallbladder: "Gallbladder",
    kidneyRight: "Right kidney",
    kidneyLeft: "Left kidney",
    spleen: "Spleen",
    pancreas: "Pancreas",
    bladder: "Urinary bladder",
    aorta: "Abdominal aorta",
    ivc: "Inferior vena cava",
    portalVein: "Portal vein",
  },
  structures: {
    bone: "Bones (ribs, spine, pelvis)",
    lung: "Lungs",
    skin: "Skin",
    stomach: "Stomach",
    duodenum: "Duodenum",
    smallBowel: "Small intestine",
    colon: "Colon (large intestine)",
    heart: "Heart (above the diaphragm)",
    adrenals: "Adrenal glands",
    psoas: "Psoas muscles",
    iliacArteries: "Common iliac arteries",
    iliacVeins: "Common iliac veins",
    prostate: "Prostate",
  },
  landmarks: {
    costalMargin: "Costal margin",
    xiphoid: "Xiphoid",
    umbilicus: "Umbilicus",
    asisRight: "ASIS",
    asisLeft: "ASIS",
    symphysis: "Pubic symphysis",
  },
  screen: { image: "Simulated ultrasound image", frozen: "FREEZE", contact: "Poor skin contact: move the probe back onto the body" },
  cine: {
    label: "Cine review",
    play: "Play the cine loop",
    pause: "Pause",
    scrub: "Recorded frame (← and → step)",
    position: (frame, frames, seconds) => `${frame} / ${frames} · ${seconds.toFixed(1)} s`,
  },
  pad: {
    region: "Probe controls",
    slide: "Slide",
    rotate: "Rotate",
    fan: "Fan",
    rock: "Rock",
    startFrom: "Start from",
    positionsLabel: "Standard probe positions",
    positionsPlaceholder: "Standard position…",
    probeCam: "Probe Cam",
    webcam: "Webcam",
    on: "On",
    probeCamLabel: "Probe Cam: steer the probe with a printed marker and the webcam",
    probeCamTitle: "Steer the probe with a printed marker and your webcam",
    press: "Press",
    pressLabel: "Press the probe in while held (X): graded compression pushes bowel gas aside",
    mouse: [
      ["Drag the image", "slide: the anatomy follows your hand"],
      ["Shift or right-drag", "rotate and rock"],
      ["Double-click", "centre that point"],
      ["Wheel", "fan"],
    ],
    moves: {
      head: "Slide toward the head (W)",
      feet: "Slide toward the feet (S)",
      aroundRight: "Slide around the body toward the patient's right (A)",
      aroundLeft: "Slide around the body toward the patient's left (D)",
      rotateCcw: "Rotate anticlockwise (Q)",
      rotateCw: "Rotate clockwise (E)",
      fanUp: "Fan the beam one way (R, or scroll on the image)",
      fanDown: "Fan the beam the other way (F, or scroll on the image)",
      rockMarker: "Rock toward the marker (Z)",
      rockAway: "Rock away from the marker (C)",
    },
  },
  positions: {
    epigastric: "Epigastric, transverse",
    ruq: "Right subcostal",
    "right-flank": "Right flank, coronal",
    "left-flank": "Left flank, coronal",
    midline: "Midline, longitudinal",
    suprapubic: "Suprapubic, transverse",
  },
  where: {
    label: "Probe position",
    side: { right: "Right", left: "Left", centre: "" },
    lines: {
      midline: "midline",
      paramedian: "paramedian",
      midclavicular: "mid-clavicular line",
      anteriorAxillary: "anterior axillary line",
      midAxillary: "mid-axillary line",
      posteriorAxillary: "posterior axillary line",
    },
    regions: {
      chest: "Lower chest",
      epigastrium: "Epigastrium",
      periumbilical: "Around the umbilicus",
      suprapubic: "Suprapubic",
      rightUpperQuadrant: "Right upper quadrant",
      leftUpperQuadrant: "Left upper quadrant",
      rightLowerQuadrant: "Right lower quadrant",
      leftLowerQuadrant: "Left lower quadrant",
      rightFlank: "Right flank",
      leftFlank: "Left flank",
    },
    cage: (cage) => {
      switch (cage.kind) {
        case "rib":
          return `On rib ${cage.rib}: expect its shadow`;
        case "cartilage":
          return "On the costal cartilage";
        case "intercostal":
          return `Intercostal, between ribs ${cage.upper} and ${cage.lower}`;
        case "subcostal":
          return cage.belowMm < 40
            ? `Subcostal, ${(cage.belowMm / 10).toFixed(1)} cm below the ribs`
            : `Below the rib cage (${(cage.belowMm / 10).toFixed(0)} cm under its edge)`;
        case "belowXiphoid":
          return `${(cage.belowMm / 10).toFixed(1)} cm below the xiphoid`;
        case "none":
          return "Clear of the ribs";
      }
    },
    level: (level) => `level of ${level}`,
  },
  machine: {
    title: "Scanner controls",
    transducer: "Transducer",
    curvilinear: "Curvilinear",
    linear: "Linear",
    curvilinearTitle: "2–6 MHz, deep abdominal imaging",
    linearTitle: "5–14 MHz, superficial, high resolution",
    frequency: "Frequency",
    frequencyHint: "Higher: sharper but shallower.",
    depth: "Depth",
    gain: "Gain",
    focus: "Focus",
    focusHint: "Put it at the structure you are studying.",
    dynamicRange: "Dynamic range",
    dynamicRangeHint: "Lower: more contrast. Higher: softer, more gray shades.",
    speckle: "Speckle reduction",
    persistence: "Persistence",
    levels: ["Off", "Low", "Med", "High"],
    tgc: "TGC (near → far)",
    tgcLabel: "Time-gain compensation",
    reset: "Reset",
    tgcBand: (band) => `TGC band ${band} of 8`,
  },
  doppler: {
    title: "Doppler",
    mode: "Doppler",
    off: "Off",
    color: "Colour",
    pw: "PW",
    colorTitle: "V: colour flow in a box (red toward the probe, blue away)",
    pwTitle: "P: pulsed-wave spectral Doppler at a sample volume",
    scale: "Velocity scale",
    scaleHint: "The Nyquist limit: flow faster than the scale aliases (wraps to the other colour or side).",
    colorGain: "Colour gain",
    colorGainHint: "Too much paints noise over tissue; too little loses slow flow.",
    invert: "Invert",
    box: "Colour box",
    boxSizes: ["Narrow", "Medium", "Wide"],
    boxHint: "Drag on the image to move the box. A smaller box keeps the frame rate up on real scanners.",
    gate: "Gate length",
    gateHint: "Click or drag on the image to place the sample volume in a vessel.",
    angle: "Angle correction",
    angleHint: "Align with the vessel: speed = Doppler shift ÷ cos θ. Keep θ at 60° or less.",
    matchAngle: "Align with the vessel",
    preparing: "Preparing blood flow…",
    spectrum: "Spectral Doppler",
    noFlow: "No flow in the gate: place it inside a vessel",
    shadowed: "Behind bone or gas: no Doppler signal",
    angleOff: (vessel) => `The vessel is at ${vessel}° to the beam`,
    steep: "Angle over 60°: speeds are unreliable. Rock or move the probe so the beam runs more along the vessel.",
    sound: "Sound",
    soundTitle: "Hear the Doppler shift: flow toward the probe on the left, away on the right",
    vessel: (kind) =>
      (
        ({
          aorta: "Aorta",
          ivc: "IVC",
          portal: "Portal vein",
          hepatic: "Hepatic vein",
          iliacArtery: "Iliac artery",
          iliacVein: "Iliac vein",
        }) as Record<string, string>
      )[kind] ?? kind,
  },
  tools: {
    breathing: "Patient breathing",
    breathe: "Breathe",
    breatheTitle: "Organs move with each breath",
    inspire: "Breathe in & hold",
    inspireTitle: "Organs move toward the feet: often a better kidney view",
    expire: "Breathe out & hold",
    freeze: "Freeze",
    unfreeze: "Unfreeze",
    measure: "Measure",
    measureTitle: "M: drag across the image",
    clear: "Clear",
    labels: "Labels",
    anatomy: "Anatomy",
    anatomyTitle: "N: outline every organ in the image",
    ct: "CT",
    ctTitle: "T: the patient's real CT, cut in the same plane as the image",
    ctBlend: "Ultrasound ⟷ CT",
    ctHint: "The ultrasound is computed from this CT, so every organ sits where the CT puts it. Slide to compare.",
    ctLabel: (moved) => (moved ? "CT · same plane · organs moved with the breath" : "CT · same plane"),
    perFrame: (ms) => `${ms} ms per frame`,
    contact: (percent) => ` · ${percent} % skin contact`,
  },
  context: {
    region: "3D view",
    camera: "Camera",
    layers: "Layers",
    presets: {
      sonographer: { label: "Sonographer", title: "From beside the patient, as you would stand" },
      front: { label: "Front", title: "From above the patient" },
      left: { label: "Left side", title: "From the patient's left" },
      plane: { label: "Scan plane", title: "Face-on to the scan plane, oriented like the image" },
    },
    layerNames: { skin: "Skin", organs: "Organs", bowel: "Bowel", bones: "Bones", lungs: "Chest", landmarks: "Landmarks" },
    cut: "Cut",
    cutTitle: "Cut the body open along the scan plane",
    hint: "Click or drag on the body to place the probe · drag the background to orbit · scroll to zoom",
  },
  tasks: {
    title: "Guided tasks",
    intro: "Pick a standard view. The coach scores your probe position live and suggests the next move.",
    back: "← All tasks",
    achieved: "View achieved",
    almost: "Almost: hold it",
    close: "Getting close",
    searching: "Keep searching",
    wellDone: "Well done. Try the next task, or measure.",
    begin: "Move the probe to begin.",
    centred: (organ) => `${organ} centred in the plane`,
    longAxis: "Long axis in the plane",
    across: "Cutting straight across",
    inView: "Inside the image, not too deep",
    access: "Clear acoustic window (no rib, lung or thick gas)",
    contact: "Probe face fully on the skin",
    mmOff: (mm) => `${mm} mm off`,
    degreesOff: (degrees) => `${degrees}° off`,
    showMe: "Show me",
    how: "How to get this view",
    freezeStep: "Get the view, then freeze (Space).",
    dragStep: (kind) => `Turn on Measure and drag across the organ, ${kind === "diameter" ? "front wall to back wall" : "pole to pole"}.`,
    freezeMeasure: "Freeze & measure",
    check: "Check my measurement",
    youMeasured: "You measured",
    inThisPlane: "In this scan plane it is",
    trueLength: (length) => `True length of the organ in 3D: ${length}.`,
    foreshortened: "Your plane cuts it short (foreshortening): rotate and fan until it is at its longest, then measure again.",
    fullLength: "Your plane shows nearly its full length.",
    cm: "cm",
  },
  taskCopy: {
    "kidney-right-long": {
      title: "Right kidney: long axis",
      goal: "Show the whole right kidney, pole to pole, in its long axis.",
      how: "Start in the right mid-axillary line, longitudinal (marker toward the head), using the liver as an acoustic window. Rotate a little until the kidney is at its longest. If ribs get in the way, slide between them or ask for a breath in.",
      tip: "The bright centre is renal sinus fat; the cortex around it is slightly darker than the liver.",
      measurement: { label: "Kidney length", normal: "Adult kidneys are usually 10–12 cm long." },
    },
    "kidney-right-short": {
      title: "Right kidney: transverse at the hilum",
      goal: "Cut across the right kidney at the level of its hilum.",
      how: "From the long-axis view, rotate 90° so the marker points toward the patient's right (or anteriorly on the flank). Fan up and down until the kidney looks like a “C” with the hilum opening medially.",
      tip: "Fan through the whole kidney in this plane: it is how you check both poles for masses or dilatation.",
    },
    morison: {
      title: "Hepatorenal space (Morison's pouch)",
      goal: "Show the liver and right kidney together, with the interface between them.",
      how: "Right flank, longitudinal, around the anterior to mid-axillary line. Keep both organs in view and centre the interface.",
      tip: "This is the first view of a FAST exam: free fluid collects here as a dark stripe between liver and kidney.",
    },
    "gallbladder-long": {
      title: "Gallbladder: long axis",
      goal: "Show the gallbladder lengthwise, neck to fundus.",
      how: "Ask for a deep breath in and hold: the liver and gallbladder slide down from under the ribs. Right subcostal: start transverse just below the ribs, then rotate the marker toward the patient's right shoulder (oblique) and fan until the gallbladder elongates.",
      tip: "Bile is anechoic, so tissue behind the gallbladder looks brighter: posterior acoustic enhancement.",
    },
    "aorta-transverse": {
      title: "Abdominal aorta: transverse",
      goal: "Show the aorta in cross-section near the kidneys and measure its diameter.",
      how: "Epigastric midline, transverse (marker to the patient's right). Find the vertebral body; the aorta sits just anterior and slightly to the patient's left, the IVC to the right. Fan caudally under the liver.",
      tip: "Bowel gas often hides the aorta. Real sonographers press firmly and slowly to push it aside.",
      measurement: { label: "Aortic AP diameter", normal: "Normal is under 3 cm; 3 cm or more is an aneurysm." },
    },
    "ivc-long": {
      title: "Inferior vena cava: longitudinal",
      goal: "Show the IVC running behind the liver.",
      how: "Right paramedian, longitudinal, through the liver. Fan slightly toward the patient's right until the IVC is a long dark tube.",
      tip: "In a real patient the IVC changes size with breathing, which is used to judge fluid status.",
    },
    "spleen-long": {
      title: "Spleen: long axis",
      goal: "Show the spleen at its longest.",
      how: "Left posterior axillary line, marker toward the head. The spleen lies high and far back, behind ribs 9 to 11: scan between the ribs, or ask for a deep breath in and angle up under the lowest rib.",
      tip: "Aerated lung can slide down over the top of the spleen. If it hides the upper pole, ask the patient to breathe out a little.",
      measurement: { label: "Spleen length", normal: "Adult spleens are usually up to about 12–13 cm long." },
    },
    "kidney-left-long": {
      title: "Left kidney: long axis",
      goal: "Show the whole left kidney in its long axis.",
      how: "Left flank, further back than on the right, with a deep breath in; the spleen is the window to the upper pole. Bowel gas often blocks an anterior approach.",
      tip: "The left kidney is usually higher and harder to see than the right.",
      measurement: { label: "Kidney length", normal: "Adult kidneys are usually 10–12 cm long." },
    },
    "bladder-transverse": {
      title: "Urinary bladder: transverse",
      goal: "Show the filled bladder in cross-section.",
      how: "Suprapubic midline, transverse, angling the beam down into the pelvis.",
      tip: "A full bladder is a window to the pelvis. The bright area behind it is posterior enhancement.",
    },
    pancreas: {
      title: "Pancreas: transverse",
      goal: "Show the pancreas lengthwise across the upper abdomen.",
      how: "Epigastric, transverse, rotated slightly oblique (the tail lies higher on the patient's left). Use the splenic vein running behind the pancreas as the landmark.",
      tip: "The pancreas is often hidden by stomach gas. Fanning caudally under the liver helps.",
    },
  },
  cases: {
    title: "Teaching cases",
    intro:
      "The same patient with one abnormality added, so every sign comes from the same physics as normal anatomy. Read the history, scan, and find it.",
    mystery: "Mystery patient",
    mysteryText: "A random case, perhaps normal. Scan the abdomen and make your diagnosis.",
    load: "Scan this case",
    back: "← All cases",
    history: "History",
    look: "What to look for",
    teaching: "Why it matters",
    showFinding: "Show me the finding",
    preparing: "Preparing the patient…",
    question: "What do you find?",
    check: "Check my answer",
    correct: "Correct.",
    wrong: (answer) => `Not quite: this was ${answer}.`,
    next: "Next mystery patient",
    endQuiz: "End the quiz",
    shareMystery: "Copy a mystery-patient link for students",
    unknown: "Mystery patient",
    nativeNote:
      "This man's own CT shows a real infrarenal aortic aneurysm of about 3.7 cm, found while checking the trainer against it: as scanned, his aorta is aneurysmal, and the AAA case grows it to 5.2 cm.",
    facts: (variant, facts) => {
      switch (variant) {
        case "gallstones":
          return facts.largestMm ? `${facts.stones} stones, the largest about ${(facts.largestMm / 10).toFixed(1)} cm` : null;
        case "freeFluid":
          return facts.morisonMl ? `About ${facts.morisonMl} ml in Morison's pouch alone` : null;
        case "hydronephrosis":
          return facts.pelvisApMm ? `Renal pelvis about ${(facts.pelvisApMm / 10).toFixed(1)} cm across` : null;
        case "aaa":
          return facts.diameterMm
            ? `${(facts.diameterMm / 10).toFixed(1)} cm across, ${(facts.lengthMm / 10).toFixed(0)} cm long; lumen about ${(facts.lumenMm / 10).toFixed(1)} cm`
            : null;
        case "liverCyst":
          return facts.diameterMm ? `About ${(facts.diameterMm / 10).toFixed(1)} cm across` : null;
        default:
          return null;
      }
    },
    findings: {
      stones: "Gallstones",
      fluid: "Free fluid",
      pelvicFluid: "Free fluid (pelvis)",
      pelvis: "Dilated renal pelvis and calyces",
      cyst: "Simple liver cyst",
      aneurysm: "Abdominal aortic aneurysm",
      polyp: "Gallbladder polyp",
      wall: "Thickened gallbladder wall",
      hemangioma: "Haemangioma",
      metastases: "Liver metastases",
      renalStone: "Kidney stone",
      renalCyst: "Renal cyst",
      spleen: "Enlarged spleen",
      effusion: "Pleural effusion",
      fattyLiver: "Fatty liver",
    },
    items: {
      normal: {
        title: "Normal",
        history: "A 35-year-old for a routine abdominal scan.",
        signs:
          "A thin-walled, anechoic gallbladder; no free fluid; kidneys with a normal cortex and sinus; an aorta under 3 cm (except in the man of 67: his CT has a real 3.7 cm aneurysm).",
        teaching: "Knowing normal well is what makes abnormal stand out.",
      },
      gallstones: {
        title: "Gallstones",
        history: "A 45-year-old woman with right upper quadrant pain after fatty meals.",
        signs:
          "Bright, curved echoes in the most dependent part of the gallbladder, each casting a clean, black acoustic shadow. Sweep through the whole gallbladder in two planes: small stones hide in the neck.",
        teaching:
          "In a real patient stones move when the patient turns (the rolling-stone sign), which tells them from a polyp. A thick wall, fluid around the gallbladder or tenderness under the probe suggest cholecystitis.",
      },
      freeFluid: {
        title: "Free fluid (FAST)",
        history: "A 28-year-old after a motorbike crash, with low blood pressure. FAST scan in the emergency room.",
        signs:
          "An anechoic (black) stripe in Morison's pouch, between the liver and the right kidney; fluid around the tip of the liver and the spleen, and behind the bladder.",
        teaching:
          "After trauma, free fluid is presumed to be blood. Morison's pouch is the first and most sensitive FAST view: look at the tip of the liver too.",
      },
      hydronephrosis: {
        title: "Hydronephrosis",
        history: "A 60-year-old man with right flank pain and less urine than usual.",
        signs:
          "The bright central sinus of the right kidney is split by an anechoic, branching collecting system: a dilated renal pelvis with rounded calyces. Compare with the left kidney.",
        teaching:
          "Moderate hydronephrosis means an obstruction downstream: look along the ureter and at the bladder for a stone or a mass. Prolonged obstruction thins the cortex.",
      },
      aaa: {
        title: "Abdominal aortic aneurysm",
        history: "A 72-year-old male smoker with a pulsatile mass in the abdomen.",
        signs:
          "Below the kidneys the aorta widens to over 5 cm, lined with grey, crescent-shaped mural thrombus around a narrower lumen. Measure outer wall to outer wall, at right angles to the aorta.",
        teaching:
          "Over 3 cm is aneurysmal; over 5.5 cm (men) usually needs repair. Colour Doppler shows flow only in the lumen, not in the thrombus.",
      },
      liverCyst: {
        title: "Simple liver cyst",
        history: "A 50-year-old woman. A lesion was seen on another scan: is it worrying?",
        signs: "A round, anechoic lesion in the right lobe with a thin, smooth wall and bright posterior acoustic enhancement.",
        teaching:
          "All three features (anechoic, thin smooth wall, enhancement) make it a benign simple cyst. Echoes inside, septations or a thick wall would need more imaging.",
      },
      fattyLiver: {
        title: "Fatty liver",
        history: "A 55-year-old man with obesity and type 2 diabetes, and slightly raised liver enzymes.",
        signs:
          "The liver is much brighter than the right kidney, the beam fades with depth, and the diaphragm and vessel walls blur: diffuse fatty infiltration (steatosis).",
        teaching:
          "Compare liver and kidney at the same depth. Normally the liver is only a little brighter; a bright liver with poor penetration means fat.",
      },
    },
  },
  report: REPORT_EN,
  advice: (advice, organ) => {
    switch (advice.move) {
      case "slide":
        return `Slide the probe toward ${EN_DIRECTIONS[advice.toward]}`;
      case "rotate":
        return `Rotate the probe: turn the marker toward ${EN_DIRECTIONS[advice.toward]}`;
      case "fan":
        return `Fan the beam toward ${EN_DIRECTIONS[advice.toward]}`;
      case "rock":
        return `Rock the probe (heel–toe) to angle the beam toward the ${advice.toward === "marker" ? "marker" : "non-marker"} side`;
      case "find-height":
        return `Slide toward the ${advice.toward}: the ${organ.toLowerCase()} is ${advice.cm} cm ${advice.toward === "head" ? "higher" : "lower"}`;
      case "find-side":
        return `Slide around the body toward the patient's ${advice.toward} side`;
      case "find-orientation":
        return advice.orientation === "longitudinal"
          ? "Rotate toward a longitudinal plane (marker toward the head)"
          : "Rotate toward a transverse plane (marker toward the patient's right)";
      case "sweep":
        return `Fan the beam slowly through the area to find the ${organ.toLowerCase()}`;
    }
  },
  probeCam: {
    title: "Probe Cam",
    status: {
      starting: "Starting camera…",
      searching: "Looking for the marker",
      tracking: "Tracking",
      denied: "Camera blocked",
      unavailable: "No camera",
    },
    help: {
      starting: "Allow the camera when the browser asks.",
      searching: "Hold the printed marker facing the camera, 30–60 cm away.",
      tracking: "Slide the marker to slide the probe, turn it to rotate, tilt it to fan and rock.",
      denied: "Camera access is blocked. Allow it from the address bar, then reopen Probe Cam.",
      unavailable: "This browser or device has no camera Insonate can use.",
    },
    regrip: "Re-grip",
    print: "Print the marker",
    privacy: "The video is processed on this device and never uploaded.",
    preview: "Camera preview (mirrored)",
    close: "Close Probe Cam",
    steps: [
      "Print this at 100 % (not “fit to page”): the black square should measure 5 cm.",
      "Tape it flat to a small box, a phone case or a TV remote. That is your probe.",
      "Open Probe Cam and hold the marker facing the camera, 30–60 cm away.",
      "Slide it to slide the probe, turn it to rotate, tilt it to fan and rock. Watch the 3D view.",
      "Lost it? Just show it again: the probe carries on from where it was.",
    ],
    caption: "Insonate probe marker · 5 cm · keep the white margin",
    printButton: "Print",
    markerLabel: "Insonate probe marker (ArUco 36h12, id 0)",
  },
  dialogs: { about: "About Insonate", shortcuts: "Keyboard shortcuts", marker: "Print the Probe Cam marker", close: "Close" },
  about: {
    intro:
      "Insonate is a free ultrasound scanning simulator for students. You hold a virtual probe over a patient built from a real abdominal CT scan, and the image is computed live from the physics of sound in tissue.",
    howTitle: "How the image is made",
    how: [
      "Every voxel of the CT is assigned a tissue with an acoustic impedance, attenuation and echogenicity.",
      "Each scanline is traced through the patient: boundaries reflect, every tissue attenuates and scatters, and speckle comes from coherent scatterers fixed in the tissue.",
      "Shadowing behind ribs and gas, enhancement behind the gallbladder and bladder, reverberation and the mirror image beyond the diaphragm are not drawn on. They emerge from those rules, and so do the effects of gain, TGC, focus and frequency.",
    ],
    limitsTitle: "Limitations",
    limits:
      "There are two patients, and the teaching cases are added to them by a model, not taken from patients with those diseases. Doppler flow is modelled from each vessel's shape with typical speeds; vessels CT does not segment carry no flow. Pressing the probe in (X) pushes bowel gas aside and brings the face a little closer, but the organs themselves do not deform. Tissue properties are typical textbook values, not these patients', and the kidneys' cortex, pyramids and sinus are modelled from each kidney's outline rather than segmented. Use Insonate to learn probe handling, anatomy, knobology and the signs of common findings, not to judge real images.",
    dataTitle: "Data",
    dataBefore: (caseId) => `Anatomy: case ${caseId} of the`,
    dataAfter: (license) => `dataset (${license}). Everything runs in your browser; nothing is uploaded.`,
    notDevice: "Insonate is a teaching tool, not a medical device.",
  },
  shortcuts: [
    ["W / S  or  ↑ / ↓", "Slide toward the head / feet"],
    ["A / D  or  ← / →", "Slide toward the patient's right / left"],
    ["Q / E", "Rotate the probe"],
    ["R / F  or  scroll", "Fan the beam"],
    ["Z / C", "Rock heel–toe"],
    ["X  (hold)", "Press the probe in: graded compression pushes bowel gas aside"],
    ["Tap  ·  hold", "One small step  ·  glide smoothly, faster after a second (keys can be combined)"],
    ["Shift + any of these", "Fine, slow movement"],
    ["Drag the image", "Slide the probe: the anatomy under the pointer follows it (up or down sweeps across)"],
    ["Shift + drag  or  right-drag", "Rotate (sideways) and rock (up or down)"],
    ["Double-click the image", "Bring that point to the middle of the image"],
    ["Drag the 3D probe  ·  wheel on it", "Move it from where it is  ·  rotate it"],
    ["Space", "Freeze / unfreeze"],
    ["M", "Measure (drag across the image)"],
    ["L", "Organ labels"],
    ["N", "Anatomy outlines"],
    ["V / P", "Colour Doppler / PW spectral Doppler"],
    ["T", "The patient's CT in the same plane"],
    ["← / →  (frozen)", "Step through the cine loop"],
    ["B", "Breathing: breathe / hold in / hold out"],
    ["[ / ]", "Depth"],
    ["- / =", "Gain"],
  ],
  welcome: {
    title: "Welcome to Insonate",
    steps: [
      {
        title: "Move the probe",
        text: "Drag the image itself and the anatomy follows your hand, or drag the probe on the 3D body. The keys work too: W A S D slide, Q E rotate, R F fan, Z C rock, hold X to press.",
      },
      {
        title: "Read the image",
        text: "Turn on Anatomy (N) to see every organ outlined, and set the 3D view to Scan plane to see where the image comes from.",
      },
      {
        title: "Practise the standard views",
        text: "Guided tasks score your view live and tell you which way to move. Show me demonstrates.",
      },
    ],
    start: "Start scanning",
    tasks: "Guided tasks",
    dismiss: "Close the welcome",
  },
};

const AR_DIRECTIONS: Readonly<Record<Direction, string>> = {
  head: "الرأس",
  feet: "القدمين",
  right: "يمين المريض",
  left: "يسار المريض",
  anterior: "الأمام",
  posterior: "الخلف",
};

const ar: Messages = {
  dir: "rtl",
  languageName: "العربية",
  header: {
    tagline: "محاكي فحص البطن بالموجات فوق الصوتية",
    mode: "الوضع",
    freeScan: "مسح حر",
    guidedTasks: "مهام موجّهة",
    cases: "الحالات",
    report: "التقرير",
    about: "عن Insonate",
    shortcuts: "اختصارات لوحة المفاتيح",
    lightTheme: "الوضع الفاتح",
    darkTheme: "الوضع الداكن",
    switchLanguage: "English",
    share: "انسخ رابطًا لهذا المنظر أو المهمة أو الحالة",
    patient: "المريض",
    patientTitle: "كل مريض أشعة مقطعية حقيقية مختلفة: جسم مختلف، وأعضاء بأحجامها ومواضعها الخاصة",
    patientName: (sex, age) => `${sex === "m" ? "رجل" : "امرأة"}، ${age} سنة`,
    copied: "تم نسخ الرابط",
    copyFailed: "انسخ هذا الرابط:",
  },
  loading: { preparing: "تجهيز المريض: تشريح من أشعة مقطعية حقيقية…", failed: "تعذّر تحميل بيانات المريض." },
  footer: {
    local: "Insonate · يعمل بالكامل في متصفحك",
    source: "الكود على GitHub",
    anatomy: "التشريح",
    notDevice: "أداة تعليمية وليست جهازًا طبيًا",
  },
  organs: {
    liver: "الكبد",
    gallbladder: "المرارة",
    kidneyRight: "الكلية اليمنى",
    kidneyLeft: "الكلية اليسرى",
    spleen: "الطحال",
    pancreas: "البنكرياس",
    bladder: "المثانة البولية",
    aorta: "الأبهر البطني",
    ivc: "الوريد الأجوف السفلي",
    portalVein: "الوريد البابي",
  },
  structures: {
    bone: "العظام (الأضلاع والعمود الفقري والحوض)",
    lung: "الرئتان",
    skin: "الجلد",
    stomach: "المعدة",
    duodenum: "الاثنا عشر",
    smallBowel: "الأمعاء الدقيقة",
    colon: "القولون (الأمعاء الغليظة)",
    heart: "القلب (فوق الحجاب الحاجز)",
    adrenals: "الغدتان الكظريتان",
    psoas: "العضلتان القطنيتان (البسواس)",
    iliacArteries: "الشريانان الحرقفيان الأصليان",
    iliacVeins: "الوريدان الحرقفيان الأصليان",
    prostate: "البروستاتا",
  },
  landmarks: {
    costalMargin: "حافة الأضلاع",
    xiphoid: "الناتئ الرهابي",
    umbilicus: "السُّرّة",
    asisRight: "الشوكة الحرقفية",
    asisLeft: "الشوكة الحرقفية",
    symphysis: "الارتفاق العاني",
  },
  screen: { image: "صورة موجات فوق صوتية محاكاة", frozen: "مُجمَّدة", contact: "تلامس ضعيف مع الجلد: أعِد المسبار إلى الجسم" },
  cine: {
    label: "مراجعة المقطع (سينِه)",
    play: "تشغيل المقطع المسجّل",
    pause: "إيقاف مؤقت",
    scrub: "الإطار المسجّل (← و → للتنقل)",
    position: (frame, frames, seconds) => `${frame} / ${frames} · ${seconds.toFixed(1)} ث`,
  },
  pad: {
    region: "التحكم بالمسبار",
    slide: "انزلاق",
    rotate: "تدوير",
    fan: "إمالة",
    rock: "تأرجح",
    startFrom: "ابدأ من",
    positionsLabel: "أوضاع المسبار القياسية",
    positionsPlaceholder: "وضع قياسي…",
    probeCam: "كاميرا المسبار",
    webcam: "الكاميرا",
    on: "تعمل",
    probeCamLabel: "كاميرا المسبار: وجّه المسبار بعلامة مطبوعة وكاميرا الويب",
    probeCamTitle: "وجّه المسبار بعلامة مطبوعة وكاميرا الويب",
    press: "ضغط",
    pressLabel: "اضغط المسبار للداخل ما دمت ضاغطًا (X): الضغط التدريجي يزيح غازات الأمعاء",
    mouse: [
      ["اسحب الصورة", "انزلاق: التشريح يتبع يدك"],
      ["Shift أو السحب بالزر الأيمن", "تدوير وتأرجح"],
      ["نقرتان", "توسيط تلك النقطة"],
      ["العجلة", "إمالة"],
    ],
    moves: {
      head: "تحريك نحو الرأس (W)",
      feet: "تحريك نحو القدمين (S)",
      aroundRight: "تحريك حول الجسم نحو يمين المريض (A)",
      aroundLeft: "تحريك حول الجسم نحو يسار المريض (D)",
      rotateCcw: "تدوير عكس عقارب الساعة (Q)",
      rotateCw: "تدوير مع عقارب الساعة (E)",
      fanUp: "إمالة الحزمة في اتجاه (R، أو التمرير على الصورة)",
      fanDown: "إمالة الحزمة في الاتجاه الآخر (F، أو التمرير على الصورة)",
      rockMarker: "تأرجح نحو العلامة (Z)",
      rockAway: "تأرجح بعيدًا عن العلامة (C)",
    },
  },
  positions: {
    epigastric: "شرسوفي، عرضي",
    ruq: "تحت الضلع الأيمن",
    "right-flank": "الخاصرة اليمنى، إكليلي",
    "left-flank": "الخاصرة اليسرى، إكليلي",
    midline: "الخط الناصف، طولي",
    suprapubic: "فوق العانة، عرضي",
  },
  where: {
    label: "موضع المسبار",
    side: { right: "يمين", left: "يسار", centre: "" },
    lines: {
      midline: "الخط الناصف",
      paramedian: "بجانب الخط الناصف",
      midclavicular: "خط منتصف الترقوة",
      anteriorAxillary: "الخط الإبطي الأمامي",
      midAxillary: "الخط الإبطي المتوسط",
      posteriorAxillary: "الخط الإبطي الخلفي",
    },
    regions: {
      chest: "أسفل الصدر",
      epigastrium: "الشرسوف (أعلى البطن)",
      periumbilical: "حول السُّرّة",
      suprapubic: "فوق العانة",
      rightUpperQuadrant: "الربع العلوي الأيمن",
      leftUpperQuadrant: "الربع العلوي الأيسر",
      rightLowerQuadrant: "الربع السفلي الأيمن",
      leftLowerQuadrant: "الربع السفلي الأيسر",
      rightFlank: "الخاصرة اليمنى",
      leftFlank: "الخاصرة اليسرى",
    },
    cage: (cage) => {
      switch (cage.kind) {
        case "rib":
          return `فوق الضلع ${cage.rib}: توقّع ظلّه في الصورة`;
        case "cartilage":
          return "فوق الغضروف الضلعي";
        case "intercostal":
          return `بين الأضلاع، بين الضلعين ${cage.upper} و${cage.lower}`;
        case "subcostal":
          return cage.belowMm < 40
            ? `تحت الأضلاع، ${(cage.belowMm / 10).toFixed(1)} سم تحت حافتها`
            : `أسفل القفص الصدري (${(cage.belowMm / 10).toFixed(0)} سم تحت حافته)`;
        case "belowXiphoid":
          return `${(cage.belowMm / 10).toFixed(1)} سم تحت الناتئ الرهابي`;
        case "none":
          return "بعيدًا عن الأضلاع";
      }
    },
    level: (level) => `مستوى ${level}`,
  },
  machine: {
    title: "لوحة التحكم بالجهاز",
    transducer: "المسبار",
    curvilinear: "منحني",
    linear: "خطّي",
    curvilinearTitle: "2–6 MHz، للتصوير البطني العميق",
    linearTitle: "5–14 MHz، للسطحي وبدقة عالية",
    frequency: "التردد",
    frequencyHint: "أعلى: صورة أدق لكن أقل عمقًا.",
    depth: "العمق",
    gain: "الكسب (Gain)",
    focus: "البؤرة",
    focusHint: "ضعها عند البنية التي تفحصها.",
    dynamicRange: "المدى الديناميكي",
    dynamicRangeHint: "أقل: تباين أعلى. أعلى: صورة أنعم بدرجات رمادي أكثر.",
    speckle: "تقليل التبقّع",
    persistence: "الثبات (متوسط الإطارات)",
    levels: ["إيقاف", "منخفض", "متوسط", "عالٍ"],
    tgc: "TGC (من القريب إلى البعيد)",
    tgcLabel: "تعويض الكسب الزمني",
    reset: "إعادة الضبط",
    tgcBand: (band) => `TGC: الشريحة ${band} من 8`,
  },
  doppler: {
    title: "الدوبلر",
    mode: "الدوبلر",
    off: "إيقاف",
    color: "ملوّن",
    pw: "طيفي PW",
    colorTitle: "V: تدفق ملوّن داخل مربع (الأحمر نحو المسبار، والأزرق بعيدًا عنه)",
    pwTitle: "P: دوبلر طيفي نبضي عند حجم العيّنة",
    scale: "مقياس السرعة",
    scaleHint: "حد نايكويست: التدفق الأسرع من المقياس يحدث له تداخل (aliasing) فينقلب لونه أو جهته.",
    colorGain: "كسب اللون",
    colorGainHint: "الزيادة ترسم تشويشًا فوق الأنسجة، والنقص يضيّع التدفق البطيء.",
    invert: "عكس الألوان",
    box: "مربع اللون",
    boxSizes: ["ضيق", "متوسط", "عريض"],
    boxHint: "اسحب على الصورة لتحريك المربع. المربع الأصغر يحافظ على سرعة الإطارات في الأجهزة الحقيقية.",
    gate: "طول البوابة",
    gateHint: "انقر أو اسحب على الصورة لوضع حجم العيّنة داخل وعاء دموي.",
    angle: "تصحيح الزاوية",
    angleHint: "طابق اتجاه الوعاء: السرعة = إزاحة دوبلر ÷ جتا θ. أبقِ θ عند 60° أو أقل.",
    matchAngle: "طابق اتجاه الوعاء",
    preparing: "تجهيز تدفق الدم…",
    spectrum: "الدوبلر الطيفي",
    noFlow: "لا يوجد تدفق في البوابة: ضعها داخل وعاء دموي",
    shadowed: "خلف عظم أو غاز: لا توجد إشارة دوبلر",
    angleOff: (vessel) => `زاوية الوعاء مع الحزمة ${vessel}°`,
    steep: "الزاوية أكبر من 60°: السرعات غير موثوقة. أرجِح المسبار أو حرّكه لتسير الحزمة أكثر على امتداد الوعاء.",
    sound: "الصوت",
    soundTitle: "استمع لإزاحة دوبلر: التدفق نحو المسبار في الأذن اليسرى، والمبتعد في اليمنى",
    vessel: (kind) =>
      (
        ({
          aorta: "الأبهر",
          ivc: "الوريد الأجوف السفلي",
          portal: "الوريد البابي",
          hepatic: "الوريد الكبدي",
          iliacArtery: "الشريان الحرقفي",
          iliacVein: "الوريد الحرقفي",
        }) as Record<string, string>
      )[kind] ?? kind,
  },
  tools: {
    breathing: "تنفّس المريض",
    breathe: "تنفّس طبيعي",
    breatheTitle: "تتحرك الأعضاء مع كل نَفَس",
    inspire: "شهيق وحبس",
    inspireTitle: "تنزل الأعضاء نحو القدمين: غالبًا منظر أفضل للكلية",
    expire: "زفير وحبس",
    freeze: "تجميد",
    unfreeze: "إلغاء التجميد",
    measure: "قياس",
    measureTitle: "M: اسحب عبر الصورة",
    clear: "مسح",
    labels: "التسميات",
    anatomy: "التشريح",
    anatomyTitle: "N: حدّد كل عضو في الصورة بلونه",
    ct: "مقطعية",
    ctTitle: "T: الأشعة المقطعية الحقيقية للمريض، مقطوعة في نفس مستوى الصورة",
    ctBlend: "سونار ⟷ مقطعية",
    ctHint: "صورة السونار محسوبة من هذه الأشعة، فكل عضو في مكانه في الأشعة نفسها. حرّك الشريط للمقارنة.",
    ctLabel: (moved) => (moved ? "CT · نفس المستوى · الأعضاء تحركت مع النفس" : "CT · نفس المستوى"),
    perFrame: (ms) => `${ms} ملّي ثانية لكل إطار`,
    contact: (percent) => ` · تلامس الجلد ${percent}%`,
  },
  context: {
    region: "منظر ثلاثي الأبعاد",
    camera: "الكاميرا",
    layers: "الطبقات",
    presets: {
      sonographer: { label: "منظر الأخصائي", title: "من جانب المريض، كما تقف عادةً" },
      front: { label: "أمامي", title: "من فوق المريض" },
      left: { label: "الجانب الأيسر", title: "من جهة يسار المريض" },
      plane: { label: "مستوى المسح", title: "مواجهة مستوى المسح، بنفس اتجاه الصورة" },
    },
    layerNames: { skin: "الجلد", organs: "الأعضاء", bowel: "الأمعاء", bones: "العظام", lungs: "الصدر", landmarks: "المعالم" },
    cut: "قَطع",
    cutTitle: "اقطع الجسم على امتداد مستوى المسح",
    hint: "انقر أو اسحب على الجسم لوضع المسبار · اسحب الخلفية للتدوير · مرّر للتكبير",
  },
  tasks: {
    title: "المهام الموجّهة",
    intro: "اختر منظرًا قياسيًا. يقيّم المدرّب وضع المسبار لحظيًا ويقترح الحركة التالية.",
    back: "→ كل المهام",
    achieved: "تم الوصول إلى المنظر",
    almost: "اقتربت: اثبت",
    close: "تقترب",
    searching: "واصل البحث",
    wellDone: "أحسنت. جرّب المهمة التالية، أو قِس.",
    begin: "حرّك المسبار للبدء.",
    centred: (organ) => `${organ} في منتصف المستوى`,
    longAxis: "المحور الطويل داخل المستوى",
    across: "القطع عرضيًا تمامًا",
    inView: "داخل الصورة وليس عميقًا جدًا",
    access: "نافذة صوتية واضحة (بلا ضلع أو رئة أو غاز كثيف)",
    contact: "سطح المسبار ملامس للجلد بالكامل",
    mmOff: (mm) => `انحراف ${mm} مم`,
    degreesOff: (degrees) => `انحراف ${degrees}°`,
    showMe: "أرِني",
    how: "كيف تصل إلى هذا المنظر",
    freezeStep: "احصل على المنظر ثم جمّد الصورة (مسافة).",
    dragStep: (kind) =>
      `فعّل القياس واسحب عبر العضو، ${kind === "diameter" ? "من الجدار الأمامي إلى الجدار الخلفي" : "من القطب إلى القطب"}.`,
    freezeMeasure: "تجميد وقياس",
    check: "تحقّق من قياسي",
    youMeasured: "قِستَ",
    inThisPlane: "وفي هذا المستوى يبلغ",
    trueLength: (length) => `الطول الحقيقي للعضو ثلاثي الأبعاد: ${length}.`,
    foreshortened: "مستواك يقطعه أقصر من حقيقته (تقصير ظاهري): دوّر وأمِل حتى يظهر بأطول امتداد، ثم قِس مجددًا.",
    fullLength: "مستواك يُظهر طوله الكامل تقريبًا.",
    cm: "سم",
  },
  taskCopy: {
    "kidney-right-long": {
      title: "الكلية اليمنى: المحور الطويل",
      goal: "أظهر الكلية اليمنى كاملة، من القطب إلى القطب، في محورها الطويل.",
      how: "ابدأ من الخط الإبطي المتوسط الأيمن بوضع طولي (العلامة نحو الرأس)، واستخدم الكبد نافذةً صوتية. دوّر المسبار قليلًا حتى تظهر الكلية بأطول امتداد لها. إذا اعترضت الأضلاع الصورة فحرّك المسبار بينها أو اطلب من المريض أخذ شهيق.",
      tip: "المركز اللامع هو دهون الجيب الكلوي، والقشرة حوله أقل صدىً قليلًا من الكبد.",
      measurement: { label: "طول الكلية", normal: "طول الكلية عند البالغين عادةً 10–12 سم." },
    },
    "kidney-right-short": {
      title: "الكلية اليمنى: مقطع عرضي عند النقير",
      goal: "اقطع الكلية اليمنى عرضيًا عند مستوى النقير الكلوي.",
      how: "من منظر المحور الطويل، دوّر المسبار 90° لتتجه العلامة نحو يمين المريض (أو للأمام على الخاصرة). أمِل الحزمة للأعلى والأسفل حتى تبدو الكلية كحرف C تنفتح فتحته نحو الداخل.",
      tip: "أمِل الحزمة عبر الكلية كلها في هذا المستوى: هكذا تفحص القطبين بحثًا عن كتل أو توسّع.",
    },
    morison: {
      title: "المسافة الكبدية الكلوية (جيب موريسون)",
      goal: "أظهر الكبد والكلية اليمنى معًا، مع السطح الفاصل بينهما.",
      how: "على الخاصرة اليمنى بوضع طولي، بين الخط الإبطي الأمامي والمتوسط. أبقِ العضوين في الصورة واجعل السطح الفاصل في المنتصف.",
      tip: "هذا أول مناظر فحص FAST: السوائل الحرة تتجمع هنا كشريط داكن بين الكبد والكلية.",
    },
    "gallbladder-long": {
      title: "المرارة: المحور الطويل",
      goal: "أظهر المرارة بطولها، من العنق إلى القاع.",
      how: "اطلب من المريض شهيقًا عميقًا وحبس النفس: ينزل الكبد والمرارة من تحت الأضلاع. تحت الضلع الأيمن: ابدأ بوضع عرضي تحت حافة الأضلاع مباشرة، ثم دوّر العلامة نحو كتف المريض الأيمن (وضع مائل) وأمِل الحزمة حتى تستطيل المرارة.",
      tip: "الصفراء خالية من الصدى، لذلك تبدو الأنسجة خلف المرارة أكثر سطوعًا: التعزيز الصوتي الخلفي.",
    },
    "aorta-transverse": {
      title: "الأبهر البطني: مقطع عرضي",
      goal: "أظهر الأبهر بمقطع عرضي قرب مستوى الكليتين، وقِس قطره.",
      how: "في منتصف أعلى البطن بوضع عرضي (العلامة نحو يمين المريض). جِد جسم الفقرة؛ يقع الأبهر أمامها مباشرة ومائلًا قليلًا إلى يسار المريض، والوريد الأجوف السفلي إلى اليمين. أمِل الحزمة نحو الأسفل تحت الكبد.",
      tip: "غازات الأمعاء كثيرًا ما تحجب الأبهر. الأخصائيون يضغطون بثبات وببطء لإزاحتها.",
      measurement: { label: "القطر الأمامي الخلفي للأبهر", normal: "الطبيعي أقل من 3 سم؛ و3 سم فأكثر يعني تمدّدًا (أُمّ دم)." },
    },
    "ivc-long": {
      title: "الوريد الأجوف السفلي: مقطع طولي",
      goal: "أظهر الوريد الأجوف السفلي ممتدًا خلف الكبد.",
      how: "بجانب الخط الناصف الأيمن بوضع طولي، عبر الكبد. أمِل الحزمة قليلًا نحو يمين المريض حتى يظهر الوريد أنبوبًا طويلًا داكنًا.",
      tip: "في المريض الحقيقي يتغير قطر الوريد مع التنفس، ويُستخدم ذلك لتقدير حالة السوائل.",
    },
    "spleen-long": {
      title: "الطحال: المحور الطويل",
      goal: "أظهر الطحال بأطول امتداد له.",
      how: "على الخط الإبطي الخلفي الأيسر، والعلامة نحو الرأس. الطحال مرتفع وخلفي، خلف الأضلاع 9 إلى 11: امسح بين الأضلاع، أو اطلب شهيقًا عميقًا ووجّه الحزمة لأعلى تحت آخر ضلع.",
      tip: "قد تنزلق الرئة المهواة فوق أعلى الطحال. إذا حجبت القطب العلوي فاطلب من المريض زفيرًا خفيفًا.",
      measurement: { label: "طول الطحال", normal: "طول الطحال عند البالغين عادةً حتى 12–13 سم تقريبًا." },
    },
    "kidney-left-long": {
      title: "الكلية اليسرى: المحور الطويل",
      goal: "أظهر الكلية اليسرى كاملة في محورها الطويل.",
      how: "على الخاصرة اليسرى، أبعد للخلف مما في الجهة اليمنى، مع شهيق عميق؛ والطحال نافذة القطب العلوي. غازات الأمعاء كثيرًا ما تحجب المقاربة الأمامية.",
      tip: "الكلية اليسرى عادةً أعلى وأصعب رؤيةً من اليمنى.",
      measurement: { label: "طول الكلية", normal: "طول الكلية عند البالغين عادةً 10–12 سم." },
    },
    "bladder-transverse": {
      title: "المثانة البولية: مقطع عرضي",
      goal: "أظهر المثانة الممتلئة بمقطع عرضي.",
      how: "فوق العانة في الخط الناصف بوضع عرضي، مع توجيه الحزمة نحو الحوض.",
      tip: "المثانة الممتلئة نافذة إلى الحوض. المنطقة اللامعة خلفها هي التعزيز الخلفي.",
    },
    pancreas: {
      title: "البنكرياس: مقطع عرضي",
      goal: "أظهر البنكرياس بامتداده عبر أعلى البطن.",
      how: "في المنطقة الشرسوفية بوضع عرضي مع ميلان قليل (الذيل أعلى في جهة المريض اليسرى). استخدم الوريد الطحالي الممتد خلف البنكرياس علامةً مرشدة.",
      tip: "كثيرًا ما تحجب غازات المعدة البنكرياس. إمالة الحزمة نحو الأسفل تحت الكبد تساعد.",
    },
  },
  cases: {
    title: "حالات تعليمية",
    intro: "نفس المريض مع إضافة علّة واحدة، فتنشأ كل علامة من نفس الفيزياء التي تصنع التشريح الطبيعي. اقرأ القصة، وافحص، واعثر عليها.",
    mystery: "المريض الغامض",
    mysteryText: "حالة عشوائية، وقد تكون طبيعية. افحص البطن وضع تشخيصك.",
    load: "افحص هذه الحالة",
    back: "→ كل الحالات",
    history: "القصة المرضية",
    look: "ما الذي تبحث عنه",
    teaching: "لماذا يهم ذلك",
    showFinding: "أرِني العلامة",
    preparing: "تجهيز المريض…",
    question: "ماذا وجدت؟",
    check: "تحقّق من إجابتي",
    correct: "إجابة صحيحة.",
    wrong: (answer) => `ليس تمامًا: هذه الحالة كانت ${answer}.`,
    next: "مريض غامض آخر",
    endQuiz: "إنهاء الاختبار",
    shareMystery: "انسخ رابط «مريض غامض» لهذه الحالة للطلاب",
    unknown: "مريض غامض",
    nativeNote:
      "الأشعة المقطعية الحقيقية لهذا المريض فيها تمدد حقيقي في الشريان الأبهر تحت الكلوي بحوالي 3.7 سم، اكتشفناه أثناء مطابقة المحاكي مع الأشعة: كما هو، أبهره متمدد، وحالة التمدد تكبّره إلى 5.2 سم.",
    facts: (variant, facts) => {
      switch (variant) {
        case "gallstones":
          return facts.largestMm ? `${facts.stones} حصوات، أكبرها نحو ${(facts.largestMm / 10).toFixed(1)} سم` : null;
        case "freeFluid":
          return facts.morisonMl ? `نحو ${facts.morisonMl} مل في جيب موريسون وحده` : null;
        case "hydronephrosis":
          return facts.pelvisApMm ? `عرض حويضة الكلية نحو ${(facts.pelvisApMm / 10).toFixed(1)} سم` : null;
        case "aaa":
          return facts.diameterMm
            ? `عرضه ${(facts.diameterMm / 10).toFixed(1)} سم وطوله ${(facts.lengthMm / 10).toFixed(0)} سم؛ والتجويف نحو ${(facts.lumenMm / 10).toFixed(1)} سم`
            : null;
        case "liverCyst":
          return facts.diameterMm ? `قطره نحو ${(facts.diameterMm / 10).toFixed(1)} سم` : null;
        default:
          return null;
      }
    },
    findings: {
      stones: "حصوات المرارة",
      polyp: "سليلة المرارة",
      wall: "جدار المرارة المتسمك",
      hemangioma: "ورم وعائي دموي",
      metastases: "نقائل كبدية",
      renalStone: "حصوة كلوية",
      renalCyst: "كيس كلوي",
      spleen: "طحال متضخم",
      effusion: "انصباب جنبي",
      fattyLiver: "الكبد الدهني",
      fluid: "سائل حر",
      pelvicFluid: "سائل حر (الحوض)",
      pelvis: "توسّع حويضة الكلية وكؤوسها",
      cyst: "كيس كبدي بسيط",
      aneurysm: "تمدّد الأبهر البطني",
    },
    items: {
      normal: {
        title: "طبيعي",
        history: "شخص عمره 35 سنة لفحص روتيني للبطن.",
        signs:
          "مرارة رقيقة الجدار خالية من الصدى؛ لا سائل حر؛ كليتان بقشرة وجيب طبيعيين؛ وأبهر أقل من 3 سم (إلا عند الرجل ذي الـ67 عامًا: أشعته فيها تمدد حقيقي 3.7 سم).",
        teaching: "معرفة الطبيعي جيدًا هي ما يجعل غير الطبيعي واضحًا.",
      },
      gallstones: {
        title: "حصوات المرارة",
        history: "امرأة عمرها 45 سنة بألم في الربع العلوي الأيمن بعد الوجبات الدسمة.",
        signs:
          "أصداء ساطعة منحنية في الجزء الأكثر انخفاضًا من المرارة، كلٌّ منها يُلقي ظلًا صوتيًا أسود نظيفًا. امسح المرارة كاملة في مستويين: الحصوات الصغيرة تختبئ في العنق.",
        teaching:
          "في المريض الحقيقي تتحرك الحصوات عند تقليب المريض (علامة الحصاة المتدحرجة)، وهذا يميّزها عن السليلة. سماكة الجدار أو سائل حول المرارة أو ألم تحت المسبار ترجّح التهاب المرارة.",
      },
      freeFluid: {
        title: "سائل حر (فحص FAST)",
        history: "شاب عمره 28 سنة بعد حادث دراجة نارية، وضغط دمه منخفض. فحص FAST في الطوارئ.",
        signs: "شريط خالٍ من الصدى (أسود) في جيب موريسون بين الكبد والكلية اليمنى؛ وسائل حول طرف الكبد وحول الطحال وخلف المثانة.",
        teaching: "بعد الإصابات يُفترض أن السائل الحر دم. جيب موريسون هو أول مناظر FAST وأكثرها حساسية: انظر إلى طرف الكبد أيضًا.",
      },
      hydronephrosis: {
        title: "استسقاء الكلية",
        history: "رجل عمره 60 سنة بألم في الخاصرة اليمنى وبول أقل من المعتاد.",
        signs: "الجيب المركزي الساطع للكلية اليمنى يشقّه جهاز تجميع متفرع خالٍ من الصدى: حويضة متوسعة وكؤوس مستديرة. قارنها بالكلية اليسرى.",
        teaching:
          "الاستسقاء المتوسط يعني انسدادًا في الأسفل: تتبّع الحالب وانظر إلى المثانة بحثًا عن حصاة أو كتلة. الانسداد الطويل يُرقّق القشرة.",
      },
      aaa: {
        title: "تمدّد الأبهر البطني",
        history: "رجل مدخّن عمره 72 سنة بكتلة نابضة في البطن.",
        signs:
          "تحت الكليتين يتسع الأبهر لأكثر من 5 سم، مبطّنًا بخثرة جدارية رمادية هلالية حول تجويف أضيق. قِس من الجدار الخارجي إلى الجدار الخارجي، عموديًا على الأبهر.",
        teaching:
          "أكثر من 3 سم يُعدّ تمدّدًا؛ وأكثر من 5.5 سم (عند الرجال) يحتاج عادةً إلى إصلاح. الدوبلر الملوّن يُظهر التدفق في التجويف فقط لا في الخثرة.",
      },
      liverCyst: {
        title: "كيس كبدي بسيط",
        history: "امرأة عمرها 50 سنة، ظهرت آفة في فحص آخر: هل هي مقلقة؟",
        signs: "آفة مستديرة خالية من الصدى في الفص الأيمن، جدارها رقيق أملس، مع تعزيز صوتي خلفي ساطع.",
        teaching:
          "اجتماع الصفات الثلاث (خلوّ من الصدى، وجدار رقيق أملس، وتعزيز خلفي) يجعلها كيسًا بسيطًا حميدًا. وجود أصداء داخلية أو حواجز أو جدار سميك يستدعي تصويرًا إضافيًا.",
      },
      fattyLiver: {
        title: "الكبد الدهني",
        history: "رجل عمره 55 سنة مصاب بالسمنة وسكري النوع الثاني، وإنزيمات الكبد مرتفعة قليلًا.",
        signs:
          "الكبد أكثر سطوعًا بكثير من الكلية اليمنى، والحزمة تخفت مع العمق، والحجاب الحاجز وجدران الأوعية غير واضحة: ارتشاح دهني منتشر.",
        teaching: "قارن الكبد بالكلية على العمق نفسه. في الطبيعي يكون الكبد أسطع قليلًا فقط؛ أما الكبد الساطع مع ضعف الاختراق فيعني الدهون.",
      },
    },
  },
  report: REPORT_AR,
  advice: (advice, organ) => {
    switch (advice.move) {
      case "slide":
        return `حرّك المسبار نحو ${AR_DIRECTIONS[advice.toward]}`;
      case "rotate":
        return `دوّر المسبار: وجّه العلامة نحو ${AR_DIRECTIONS[advice.toward]}`;
      case "fan":
        return `أمِل الحزمة نحو ${AR_DIRECTIONS[advice.toward]}`;
      case "rock":
        return `أرجِح المسبار (كعب–مقدمة) ليتجه الشعاع نحو ${advice.toward === "marker" ? "جهة العلامة" : "الجهة المقابلة للعلامة"}`;
      case "find-height":
        return `حرّك المسبار نحو ${advice.toward === "head" ? "الرأس" : "القدمين"}: ${organ} ${advice.toward === "head" ? "أعلى" : "أسفل"} بنحو ${advice.cm} سم`;
      case "find-side":
        return `حرّك المسبار حول الجسم نحو ${advice.toward === "right" ? "يمين" : "يسار"} المريض`;
      case "find-orientation":
        return advice.orientation === "longitudinal"
          ? "دوّر المسبار إلى مستوى طولي (العلامة نحو الرأس)"
          : "دوّر المسبار إلى مستوى عرضي (العلامة نحو يمين المريض)";
      case "sweep":
        return `أمِل الحزمة ببطء عبر المنطقة لتجد ${organ}`;
    }
  },
  probeCam: {
    title: "كاميرا المسبار",
    status: {
      starting: "تشغيل الكاميرا…",
      searching: "البحث عن العلامة",
      tracking: "يتتبّع",
      denied: "الكاميرا محظورة",
      unavailable: "لا توجد كاميرا",
    },
    help: {
      starting: "اسمح باستخدام الكاميرا عندما يطلب المتصفح ذلك.",
      searching: "أمسك العلامة المطبوعة مواجِهةً للكاميرا على بعد 30–60 سم.",
      tracking: "حرّك العلامة لتحريك المسبار، ودوّرها للتدوير، وأمِلها للإمالة والتأرجح.",
      denied: "الوصول إلى الكاميرا محظور. اسمح به من شريط العنوان، ثم أعِد فتح كاميرا المسبار.",
      unavailable: "لا يحتوي هذا المتصفح أو الجهاز على كاميرا يمكن لـ Insonate استخدامها.",
    },
    regrip: "إعادة الإمساك",
    print: "اطبع العلامة",
    privacy: "يُعالَج الفيديو على جهازك ولا يُرفع إلى أي مكان.",
    preview: "معاينة الكاميرا (معكوسة)",
    close: "إغلاق كاميرا المسبار",
    steps: [
      "اطبع بحجم 100% (وليس «ملاءمة للصفحة»): يجب أن يكون المربع الأسود 5 سم.",
      "ألصقها مسطّحة على علبة صغيرة أو غطاء جوال أو جهاز تحكم: هذا هو مسبارك.",
      "افتح كاميرا المسبار وأمسك العلامة مواجِهةً للكاميرا على بعد 30–60 سم.",
      "حرّكها لتحريك المسبار، ودوّرها للتدوير، وأمِلها للإمالة والتأرجح. راقب المنظر ثلاثي الأبعاد.",
      "فقدتَها؟ أظهِرها مجددًا فقط: يكمل المسبار من حيث توقّف.",
    ],
    caption: "علامة مسبار Insonate · 5 سم · حافظ على الهامش الأبيض",
    printButton: "طباعة",
    markerLabel: "علامة مسبار Insonate (ArUco 36h12، رقم 0)",
  },
  dialogs: { about: "عن Insonate", shortcuts: "اختصارات لوحة المفاتيح", marker: "اطبع علامة كاميرا المسبار", close: "إغلاق" },
  about: {
    intro:
      "Insonate محاكي مجاني لفحص الموجات فوق الصوتية مخصّص للطلاب. تمسك مسبارًا افتراضيًا فوق مريض مبني من أشعة مقطعية حقيقية للبطن، وتُحسب الصورة لحظيًا من فيزياء انتشار الصوت في الأنسجة.",
    howTitle: "كيف تُصنع الصورة",
    how: [
      "كل فوكسل في الأشعة المقطعية يُنسب إلى نسيج له ممانعة صوتية وتوهين وانعكاسية.",
      "يُتتبَّع كل خط مسح عبر جسم المريض: الحدود تعكس، وكل نسيج يوهن ويبعثر، والتبقّع ينتج من مبعثرات متماسكة ثابتة في النسيج.",
      "الظل خلف الأضلاع والغازات، والتعزيز خلف المرارة والمثانة، والصدى المتكرر، وصورة المرآة خلف الحجاب الحاجز: لا شيء منها مرسوم يدويًا. كلها تنتج من هذه القواعد، وكذلك تأثير الكسب وTGC والبؤرة والتردد.",
    ],
    limitsTitle: "الحدود",
    limits:
      "هناك مريضان، والحالات التعليمية مضافة إليهما بنموذج، لا مأخوذة من مرضى بهذه الأمراض. تدفق الدوبلر مُنمذج من شكل كل وعاء بسرعات نموذجية، والأوعية التي لا تُقسَّم في الأشعة المقطعية لا تدفق فيها. الضغط بالمسبار (X) يزيح غازات الأمعاء ويقرّب سطح المسبار قليلًا، لكن الأعضاء نفسها لا تتشوّه. خصائص الأنسجة قيم نموذجية من المراجع وليست خاصة بهذين المريضين، وقشرة الكلية وأهراماتها وجيبها مُنمذجة من محيط كل كلية لا مُقسَّمة. استخدم Insonate لتعلّم التعامل مع المسبار والتشريح وأزرار الجهاز وعلامات الحالات الشائعة، لا للحكم على صور حقيقية.",
    dataTitle: "البيانات",
    dataBefore: (caseId) => `التشريح: الحالة ${caseId} من مجموعة بيانات`,
    dataAfter: (license) => `(${license}). كل شيء يعمل في متصفحك؛ ولا يُرفع أي شيء.`,
    notDevice: "Insonate أداة تعليمية وليست جهازًا طبيًا.",
  },
  shortcuts: [
    ["W / S  أو  ↑ / ↓", "تحريك نحو الرأس / القدمين"],
    ["A / D  أو  ← / →", "تحريك نحو يمين / يسار المريض"],
    ["Q / E", "تدوير المسبار"],
    ["R / F  أو  التمرير", "إمالة الحزمة"],
    ["Z / C", "التأرجح (كعب–مقدمة)"],
    ["X  (مطوّلًا)", "اضغط المسبار للداخل: الضغط التدريجي يزيح غازات الأمعاء"],
    ["نقرة  ·  ضغط مستمر", "خطوة صغيرة  ·  حركة انسيابية تتسارع بعد ثانية (يمكن الجمع بين الأزرار)"],
    ["Shift مع أيٍّ منها", "حركة دقيقة وبطيئة"],
    ["اسحب الصورة", "حرّك المسبار: التشريح تحت المؤشر يتبعه (أعلى وأسفل يمسح عبر المستوى)"],
    ["Shift + سحب  أو  السحب بالزر الأيمن", "تدوير (جانبيًا) وتأرجح (أعلى وأسفل)"],
    ["نقرتان على الصورة", "انقل تلك النقطة إلى منتصف الصورة"],
    ["اسحب المسبار ثلاثي الأبعاد  ·  العجلة عليه", "حرّكه من مكانه  ·  دوّره"],
    ["مسافة", "تجميد / إلغاء التجميد"],
    ["M", "قياس (اسحب عبر الصورة)"],
    ["L", "تسميات الأعضاء"],
    ["N", "التشريح الملوّن"],
    ["V / P", "دوبلر ملوّن / دوبلر طيفي PW"],
    ["T", "الأشعة المقطعية للمريض في نفس المستوى"],
    ["← / →  (أثناء التجميد)", "التنقل بين إطارات المقطع المسجّل"],
    ["B", "التنفّس: طبيعي / شهيق وحبس / زفير وحبس"],
    ["[ / ]", "العمق"],
    ["- / =", "الكسب"],
  ],
  welcome: {
    title: "مرحبًا بك في Insonate",
    steps: [
      {
        title: "حرّك المسبار",
        text: "اسحب الصورة نفسها فيتبع التشريح يدك، أو اسحب المسبار على الجسم ثلاثي الأبعاد. والمفاتيح تعمل أيضًا: W A S D للتحريك، وQ E للتدوير، وR F للإمالة، وZ C للتأرجح، واضغط X مطوّلًا للضغط.",
      },
      {
        title: "اقرأ الصورة",
        text: "فعّل «التشريح» (N) لترى كل عضو محددًا بلونه، واختر «مستوى المسح» في المنظر ثلاثي الأبعاد لترى من أين تأتي الصورة.",
      },
      {
        title: "تدرّب على المناظر القياسية",
        text: "المهام الموجّهة تقيّم منظرك لحظيًا وتخبرك بالحركة التالية، وزر «أرِني» يوضّح لك.",
      },
    ],
    start: "ابدأ المسح",
    tasks: "المهام الموجّهة",
    dismiss: "إغلاق الترحيب",
  },
};

export const MESSAGES: Readonly<Record<Language, Messages>> = { en, ar };
