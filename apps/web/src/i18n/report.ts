import type { Grade, Side } from "@insonate/sono-engine";
import type { Diagnosis } from "../exam/impression";
import type { Department, ExamLevel, GradeItem, Reason, SectionKey } from "../exam/types";

/** The words of the reporting exam, in one language. */
export interface ReportCopy {
  readonly tab: string;
  readonly title: string;
  readonly intro: string;
  readonly levels: Readonly<Record<ExamLevel, { readonly name: string; readonly text: string }>>;
  readonly start: string;
  readonly codeLabel: string;
  readonly codePlaceholder: string;
  readonly open: string;
  readonly badCode: string;
  readonly recent: string;
  readonly best: string;
  readonly none: string;
  readonly request: string;
  readonly patient: (sex: "m" | "f", age: number) => string;
  readonly mrn: string;
  readonly from: string;
  readonly examination: string;
  readonly examinationName: string;
  readonly clinical: string;
  readonly departments: Readonly<Record<Department, string>>;
  readonly reasons: Readonly<Record<Reason, (sex: "m" | "f", age: number) => string>>;
  readonly question: string;
  readonly focusQuestion: (section: string) => string;
  readonly preparing: string;
  readonly rules: Readonly<Record<ExamLevel, string>>;
  readonly elapsed: string;
  readonly sections: Readonly<Record<SectionKey, string>>;
  readonly fields: {
    readonly echotexture: string;
    readonly lesion: string;
    readonly lesionSize: string;
    readonly status: string;
    readonly largest: string;
    readonly wall: string;
    readonly murphy: string;
    readonly length: string;
    readonly enlarged: string;
    readonly hydro: string;
    readonly stone: string;
    readonly stoneSize: string;
    readonly cyst: string;
    readonly cystSize: string;
    readonly diameter: string;
    readonly aneurysm: string;
    readonly amount: string;
    readonly effusion: string;
    readonly pancreas: string;
    readonly bladder: string;
  };
  readonly options: {
    readonly fatty: Readonly<Record<0 | Grade, string>>;
    readonly lesions: Readonly<Record<"none" | "cyst" | "hemangioma" | "metastases", string>>;
    readonly gallbladder: Readonly<Record<"normal" | "stones" | "polyp" | "cholecystitis", string>>;
    readonly hydro: Readonly<Record<0 | Grade, string>>;
    readonly fluid: Readonly<Record<0 | Grade, string>>;
    readonly pancreas: Readonly<Record<"normal" | "obscured", string>>;
    readonly yes: string;
    readonly no: string;
    readonly positive: string;
    readonly negative: string;
    readonly right: string;
    readonly left: string;
  };
  readonly mm: string;
  readonly fromCaliper: (mm: number) => string;
  readonly noCaliper: string;
  readonly impression: string;
  readonly impressionHint: Readonly<Record<ExamLevel, string>>;
  readonly impressionPlaceholder: string;
  readonly preview: string;
  readonly submit: string;
  readonly confirmSubmit: string;
  readonly abandon: string;
  readonly confirmAbandon: string;
  readonly score: string;
  readonly passed: string;
  readonly failed: string;
  readonly took: (minutes: number, seconds: number) => string;
  readonly points: (earned: number, max: number) => string;
  readonly marking: string;
  readonly modelReport: string;
  readonly yourReport: string;
  readonly reportLanguage: string;
  readonly findings: string;
  readonly impressionHeading: string;
  readonly showMe: string;
  readonly aiming: string;
  readonly noView: string;
  readonly next: string;
  readonly levels3: string;
  readonly copyCode: string;
  readonly copyReport: string;
  readonly inProgress: string;
  readonly back: string;
  readonly locked: string;
  readonly reaction: string;
  readonly nativeAneurysm: string;
  readonly diagnoses: Readonly<Record<Diagnosis, string>>;
  readonly feedback: (item: GradeItem) => string;
}

const SIDE_EN: Readonly<Record<Side, string>> = { right: "right", left: "left" };
const SIDE_AR: Readonly<Record<Side, string>> = { right: "اليمنى", left: "اليسرى" };
const GRADES_EN = ["none", "mild", "moderate", "severe"];
const GRADES_AR = ["لا يوجد", "خفيف", "متوسط", "شديد"];
const AMOUNTS_EN = ["none", "small", "moderate", "large"];
const AMOUNTS_AR = ["لا يوجد", "قليلة", "متوسطة", "كبيرة"];

const DIAGNOSES_EN: Readonly<Record<Diagnosis, string>> = {
  gallstones: "gallstones",
  cholecystitis: "acute cholecystitis",
  polyp: "gallbladder polyp",
  fattyLiver: "fatty liver",
  liverCyst: "liver cyst",
  hemangioma: "haemangioma",
  metastases: "liver metastases",
  hydronephrosis: "hydronephrosis",
  renalStone: "kidney stone",
  renalCyst: "renal cyst",
  aaa: "aortic aneurysm",
  freeFluid: "free fluid",
  splenomegaly: "splenomegaly",
  pleuralEffusion: "pleural effusion",
};

const DIAGNOSES_AR: Readonly<Record<Diagnosis, string>> = {
  gallstones: "حصوات المرارة",
  cholecystitis: "التهاب المرارة الحاد",
  polyp: "سليلة المرارة",
  fattyLiver: "الكبد الدهني",
  liverCyst: "كيس كبدي",
  hemangioma: "ورم وعائي دموي",
  metastases: "نقائل كبدية",
  hydronephrosis: "استسقاء الكلية",
  renalStone: "حصوة كلوية",
  renalCyst: "كيس كلوي",
  aaa: "تمدد الشريان الأبهر",
  freeFluid: "سوائل حرة",
  splenomegaly: "تضخم الطحال",
  pleuralEffusion: "انصباب جنبي",
};

const LESIONS_EN = { none: "none", cyst: "simple cyst", hemangioma: "haemangioma", metastases: "metastases" } as const;
const LESIONS_AR = { none: "لا يوجد", cyst: "كيس بسيط", hemangioma: "ورم وعائي دموي", metastases: "نقائل" } as const;
const GB_EN = { normal: "normal", stones: "gallstones", polyp: "polyp", cholecystitis: "acute cholecystitis" } as const;
const GB_AR = { normal: "طبيعية", stones: "حصوات", polyp: "سليلة", cholecystitis: "التهاب حاد" } as const;

/** Names of measurements, by item code. */
const MEASURES_EN: Readonly<Record<string, string>> = {
  "lesion.size": "Liver lesion size",
  "gb.polypSize": "Polyp size",
  "gb.stoneSize": "Largest stone",
  "gb.wall": "Gallbladder wall thickness",
  "spleen.length": "Spleen length",
  "kidney.length": "Kidney length",
  "kidney.stone.size": "Kidney stone size",
  "kidney.cyst.size": "Renal cyst size",
  "aorta.diameter": "Aortic diameter",
};
const MEASURES_AR: Readonly<Record<string, string>> = {
  "lesion.size": "حجم الآفة الكبدية",
  "gb.polypSize": "حجم السليلة",
  "gb.stoneSize": "أكبر حصوة",
  "gb.wall": "سماكة جدار المرارة",
  "spleen.length": "طول الطحال",
  "kidney.length": "طول الكلية",
  "kidney.stone.size": "حجم الحصوة الكلوية",
  "kidney.cyst.size": "حجم الكيس الكلوي",
  "aorta.diameter": "قطر الأبهر",
};

function measurement(item: GradeItem, names: Readonly<Record<string, string>>, ar: boolean): string | null {
  const base = item.code.replace(/\.(missing|units)$/, "");
  const name = names[base];
  if (!name) return null;
  const p = item.params;
  const range = `${p.lo}–${p.hi}`;
  if (item.code.endsWith(".missing"))
    return ar ? `${name}: لم يُقس (الحقيقي ${p.truth} مم).` : `${name}: not measured (it is ${p.truth} mm).`;
  if (item.code.endsWith(".units"))
    return ar
      ? `${name}: كتبت ${p.said}، ويبدو أنها بالسنتيمتر؛ الحقل بالمليمتر (الحقيقي ${p.truth} مم).`
      : `${name}: ${p.said} looks like centimetres; the field is in millimetres (it is ${p.truth} mm).`;
  if (item.verdict === "correct")
    return ar ? `${name}: ${p.said} مم ✓ (الحقيقي ${p.truth} مم).` : `${name}: ${p.said} mm ✓ (true ${p.truth} mm).`;
  if (item.verdict === "partial")
    return ar
      ? `${name}: ${p.said} مم، قريب (الحقيقي ${p.truth} مم، المقبول ${range}).`
      : `${name}: ${p.said} mm, close (true ${p.truth} mm, accepted ${range}).`;
  return ar
    ? `${name}: ${p.said} مم بعيد عن الحقيقي ${p.truth} مم (المقبول ${range}).`
    : `${name}: ${p.said} mm is off: the true value is ${p.truth} mm (accepted ${range}).`;
}

function feedbackEn(item: GradeItem): string {
  const m = measurement(item, MEASURES_EN, false);
  if (m) return m;
  const p = item.params;
  const diagnosis = (key: unknown) => DIAGNOSES_EN[key as Diagnosis] ?? String(key);
  switch (item.code) {
    case "fatty.found":
      return "Fatty liver: found. The liver is brighter than the kidney's cortex at the same depth.";
    case "fatty.grade":
      return item.verdict === "correct"
        ? `Fatty liver grade ${p.truth}: right.`
        : `Grade: you said ${GRADES_EN[Number(p.said)]}, it is ${GRADES_EN[Number(p.truth)]}. Mild: vessels and diaphragm crisp; moderate: their walls blur; severe: the back of the liver fades out.`;
    case "fatty.missed":
      return `Missed: a ${GRADES_EN[Number(p.grade)]} fatty liver. Compare the liver with the right kidney's cortex at the same depth: normally similar, here much brighter.`;
    case "fatty.sparing":
      return "Note: the darker area beside the gallbladder is focal fatty sparing, not a lesion.";
    case "fatty.overcall":
      return "The liver is not fatty: it is about as bright as the kidney's cortex. Too much gain makes any liver look bright.";
    case "lesion.found":
      return `Liver lesion: found, and rightly called ${LESIONS_EN[p.lesion as keyof typeof LESIONS_EN]}.`;
    case "lesion.misread":
      return `You found the liver lesion but called it ${LESIONS_EN[p.said as keyof typeof LESIONS_EN]}: it is ${LESIONS_EN[p.lesion as keyof typeof LESIONS_EN]}. A simple cyst is black with bright enhancement behind it; a haemangioma is uniformly bright; metastases are several, with dark halos (target lesions).`;
    case "lesion.missed":
      return `Missed: ${LESIONS_EN[p.lesion as keyof typeof LESIONS_EN]} in the liver. Sweep the whole liver in two planes, including the left lobe and under the ribs (ask for a deep breath).`;
    case "lesion.overcall":
      return `There is no ${LESIONS_EN[p.said as keyof typeof LESIONS_EN]} in this liver. Vessels cut across look like round lesions: follow them, or check with colour Doppler.`;
    case "gb.stones.found":
      return "Gallstones: found. Bright echoes on the dependent wall with clean shadows.";
    case "gb.polyp.found":
      return "Gallbladder polyp: found. No shadow, stuck to the wall.";
    case "gb.cholecystitis.found":
      return "Acute cholecystitis: found. Thick, layered wall, fluid around it, a stone in the neck.";
    case "gb.cholecystitis.onlyStones":
      return "You saw the stones but missed the inflammation: the wall is thick and layered, there is fluid around the gallbladder, and the patient hurts under the probe (Murphy's sign).";
    case "gb.stones.notInflamed":
      return "Gallstones, yes, but no cholecystitis: the wall is thin, there is no fluid around it, and pressing over it does not hurt.";
    case "gb.polyp.calledStone":
      return "It is a polyp, not a stone: no acoustic shadow, and it stays on the non-dependent wall when the patient turns.";
    case "gb.stones.calledPolyp":
      return "These are stones, not a polyp: each casts a black shadow and they lie on the dependent wall.";
    case "gb.stones.missed":
      return "Missed: gallstones. Look at the most dependent part of the gallbladder and the neck, in two planes; a stone shows by its shadow.";
    case "gb.polyp.missed":
      return "Missed: a small polyp on the gallbladder wall. Echogenic, no shadow, does not move.";
    case "gb.cholecystitis.missed":
      return "Missed: acute cholecystitis. Thick layered wall, fluid around the gallbladder, a stone in the neck, and pain under the probe.";
    case "gb.murphy.found":
      return "Murphy's sign: rightly positive (the patient winced with the probe over the gallbladder).";
    case "gb.murphy.missed":
      return "Murphy's sign was positive: the patient winced when you pressed over the gallbladder.";
    case "gb.overcall":
      return `The gallbladder is normal: no ${GB_EN[p.said as keyof typeof GB_EN]}. Folds and the duodenum next to it can look like stones: look for a clean shadow, in two planes.`;
    case "gb.murphy.overcall":
      return "Murphy's sign is negative in this patient: they did not wince over the gallbladder.";
    case "spleen.found":
      return "Splenomegaly: found.";
    case "spleen.missed":
      return `Missed: the spleen is enlarged (${(Number(p.truth) / 10).toFixed(1)} cm; over 13 cm is enlarged). Measure it pole to pole in the coronal plane.`;
    case "spleen.overcall":
      return `The spleen is normal (${(Number(p.truth) / 10).toFixed(1)} cm).`;
    case "spleen.borderline":
      return `The spleen is at the upper limit of normal (${(Number(p.truth) / 10).toFixed(1)} cm): normal or borderline both accepted.`;
    case "kidney.hydro.found":
      return `Hydronephrosis: found (${GRADES_EN[Number(p.grade)]}).`;
    case "kidney.hydro.grade":
      return item.verdict === "correct"
        ? "Grade of hydronephrosis: right."
        : `Grade: you said ${GRADES_EN[Number(p.said)]}, it is ${GRADES_EN[Number(p.truth)]}. Mild: pelvis only; moderate: pelvis and calyces; severe: ballooned calyces and a thin cortex.`;
    case "kidney.hydro.missed":
      return `Missed: ${GRADES_EN[Number(p.grade)]} hydronephrosis. The bright sinus is split by black, branching fluid.`;
    case "kidney.hydro.wrongSide":
      return "Hydronephrosis is on this side, and you reported it on the other: check the body marker and which flank the probe is on.";
    case "kidney.hydro.overcall":
      return "No hydronephrosis in this kidney. A full bladder, or an extrarenal pelvis, can dilate a normal collecting system a little.";
    case "kidney.stone.found":
      return Number(p.obstructing) ? "Kidney stone: found, obstructing at the pelviureteric junction." : "Kidney stone: found.";
    case "kidney.stone.missed":
      return "Missed: a kidney stone. In the bright sinus a stone is hard to see; look for its shadow (and the twinkle on colour Doppler).";
    case "kidney.stone.overcall":
      return "No stone in this kidney: the sinus fat is bright on its own. A stone shows a clean shadow.";
    case "kidney.cyst.found":
      return "Renal cyst: found.";
    case "kidney.cyst.missed":
      return "Missed: a simple cyst bulging from the kidney. Sweep through both poles in two planes.";
    case "kidney.cyst.overcall":
      return "No cyst in this kidney. Dark pyramids are not cysts: they sit in a row inside the cortex.";
    case "aorta.aneurysm.found":
      return `Aortic aneurysm: found (${(Number(p.truth) / 10).toFixed(1)} cm).`;
    case "aorta.aneurysm.missed":
      return `Missed: an abdominal aortic aneurysm (${(Number(p.truth) / 10).toFixed(1)} cm; 3 cm or more is an aneurysm). Follow the aorta from the diaphragm to the bifurcation.`;
    case "aorta.aneurysm.overcall":
      return `The aorta is not aneurysmal (${(Number(p.truth) / 10).toFixed(1)} cm). Measure outer wall to outer wall, at right angles to the vessel.`;
    case "fluid.found":
      return `Free fluid: found (${AMOUNTS_EN[Number(p.amount)]}).`;
    case "fluid.amount":
      return item.verdict === "correct"
        ? "Amount of free fluid: right."
        : `Amount: you said ${AMOUNTS_EN[Number(p.said)]}, it is ${AMOUNTS_EN[Number(p.truth)]}.`;
    case "fluid.missed":
      return `Missed: ${AMOUNTS_EN[Number(p.amount)]} free fluid. Look first in Morison's pouch (between liver and right kidney), then around the spleen and behind the bladder.`;
    case "fluid.overcall":
      return "There is no free fluid. Fluid in bowel loops, or the IVC, is not free fluid.";
    case "pleura.found":
      return `Pleural effusion (${SIDE_EN[p.side as Side]}): found.`;
    case "pleura.missed":
      return `Missed: a ${SIDE_EN[p.side as Side]} pleural effusion. Above the diaphragm, through the liver or spleen: black fluid, and the spine seen through it.`;
    case "pleura.overcall":
      return `No ${SIDE_EN[p.side as Side]} pleural effusion: the mirror image of the liver above the diaphragm is normal aerated lung.`;
    case "study.normal":
      return "A normal study, reported as normal.";
    case "study.normal.overcalled":
      return "This patient is normal: everything you reported as abnormal is not there.";
    case "impression.empty":
      return "No impression written: at this level the impression is the answer to the clinical question.";
    case "impression.stated":
      return `Impression states ${diagnosis(p.diagnosis)}${p.side ? ` (${p.side})` : ""} ✓`;
    case "impression.onlyStones":
      return "Impression: gallstones, but not the cholecystitis.";
    case "impression.missing":
      return `Impression does not state ${diagnosis(p.diagnosis)}${p.side ? ` (${p.side})` : ""}.`;
    case "impression.wrongSide":
      return `Impression puts ${diagnosis(p.diagnosis)} on the wrong side (it is ${p.side}).`;
    case "impression.noSide":
      return `Impression: ${diagnosis(p.diagnosis)}, but which side? (${p.side})`;
    case "impression.overcall":
      return `Impression states ${diagnosis(p.diagnosis)}, which this patient does not have.`;
    case "impression.normal":
      return "Impression: normal study ✓";
    case "impression.notNormal":
      return 'Impression: say it plainly, "Normal abdominal ultrasound."';
    default:
      return item.code;
  }
}

function feedbackAr(item: GradeItem): string {
  const m = measurement(item, MEASURES_AR, true);
  if (m) return m;
  const p = item.params;
  const diagnosis = (key: unknown) => DIAGNOSES_AR[key as Diagnosis] ?? String(key);
  const side = (s: unknown) => (s === "right" ? "الأيمن" : s === "left" ? "الأيسر" : "");
  switch (item.code) {
    case "fatty.found":
      return "الكبد الدهني: صحيح. الكبد أسطع من قشرة الكلية على نفس العمق.";
    case "fatty.grade":
      return item.verdict === "correct"
        ? `درجة الكبد الدهني ${p.truth}: صحيحة.`
        : `الدرجة: كتبت ${GRADES_AR[Number(p.said)]}، والصحيح ${GRADES_AR[Number(p.truth)]}. خفيف: الأوعية والحجاب واضحة؛ متوسط: جدرانها تبهت؛ شديد: الجزء الخلفي من الكبد يختفي.`;
    case "fatty.missed":
      return `فاتك: كبد دهني ${GRADES_AR[Number(p.grade)]}. قارن الكبد بقشرة الكلية اليمنى على نفس العمق: الطبيعي متقاربان، وهنا الكبد أسطع بكثير.`;
    case "fatty.sparing":
      return "ملاحظة: المنطقة الأغمق بجوار المرارة منطقة خالية من الدهون (focal fatty sparing) وليست آفة.";
    case "fatty.overcall":
      return "الكبد ليس دهنيًا: سطوعه قريب من قشرة الكلية. زيادة الـ Gain تجعل أي كبد يبدو ساطعًا.";
    case "lesion.found":
      return `آفة الكبد: صحيح، ووصفتها بشكل صحيح (${LESIONS_AR[p.lesion as keyof typeof LESIONS_AR]}).`;
    case "lesion.misread":
      return `وجدت آفة الكبد لكن سميتها ${LESIONS_AR[p.said as keyof typeof LESIONS_AR]}، والصحيح ${LESIONS_AR[p.lesion as keyof typeof LESIONS_AR]}. الكيس البسيط أسود وخلفه تعزيز ساطع؛ الورم الوعائي ساطع ومتجانس؛ النقائل متعددة بهالة غامقة (target).`;
    case "lesion.missed":
      return `فاتك: ${LESIONS_AR[p.lesion as keyof typeof LESIONS_AR]} في الكبد. امسح الكبد كله في مستويين، بما فيه الفص الأيسر وتحت الأضلاع (اطلب نفس عميق).`;
    case "lesion.overcall":
      return `لا يوجد ${LESIONS_AR[p.said as keyof typeof LESIONS_AR]} في هذا الكبد. الأوعية المقطوعة عرضيًا تبدو كآفات دائرية: تتبّعها أو استخدم الدوبلر الملون.`;
    case "gb.stones.found":
      return "حصوات المرارة: صحيح. أصداء ساطعة على الجدار السفلي مع ظل صوتي نظيف.";
    case "gb.polyp.found":
      return "سليلة المرارة: صحيح. بدون ظل ومثبتة على الجدار.";
    case "gb.cholecystitis.found":
      return "التهاب المرارة الحاد: صحيح. جدار سميك متطبق، سوائل حولها، وحصوة في العنق.";
    case "gb.cholecystitis.onlyStones":
      return "شفت الحصوات لكن فاتك الالتهاب: الجدار سميك ومتطبق، فيه سوائل حول المرارة، والمريض يتألم تحت المجس (علامة مورفي).";
    case "gb.stones.notInflamed":
      return "حصوات نعم، لكن بدون التهاب: الجدار رقيق، ولا توجد سوائل حولها، والضغط عليها لا يؤلم.";
    case "gb.polyp.calledStone":
      return "هذه سليلة وليست حصوة: لا يوجد ظل صوتي، وتبقى على الجدار العلوي عند تحريك المريض.";
    case "gb.stones.calledPolyp":
      return "هذه حصوات وليست سليلة: كل واحدة لها ظل أسود وتستقر على الجدار السفلي.";
    case "gb.stones.missed":
      return "فاتتك حصوات المرارة. انظر إلى الجزء الأسفل من المرارة وعنقها في مستويين؛ الحصوة تظهر بظلها.";
    case "gb.polyp.missed":
      return "فاتتك سليلة صغيرة على جدار المرارة: ساطعة، بدون ظل، ولا تتحرك.";
    case "gb.cholecystitis.missed":
      return "فاتك التهاب المرارة الحاد: جدار سميك متطبق، سوائل حول المرارة، حصوة في العنق، وألم تحت المجس.";
    case "gb.murphy.found":
      return "علامة مورفي: إيجابية وهذا صحيح (المريض تألم عند الضغط على المرارة).";
    case "gb.murphy.missed":
      return "علامة مورفي كانت إيجابية: المريض تألم عندما ضغطت فوق المرارة.";
    case "gb.overcall":
      return `المرارة طبيعية: لا يوجد ${GB_AR[p.said as keyof typeof GB_AR]}. الطيّات والاثنا عشر المجاور قد تشبه الحصوات: ابحث عن ظل نظيف وفي مستويين.`;
    case "gb.murphy.overcall":
      return "علامة مورفي سلبية في هذا المريض: لم يتألم فوق المرارة.";
    case "spleen.found":
      return "تضخم الطحال: صحيح.";
    case "spleen.missed":
      return `فاتك: الطحال متضخم (${(Number(p.truth) / 10).toFixed(1)} سم؛ أكثر من 13 سم يعتبر تضخم). قِسه من القطب إلى القطب في المستوى الإكليلي.`;
    case "spleen.overcall":
      return `الطحال طبيعي (${(Number(p.truth) / 10).toFixed(1)} سم).`;
    case "spleen.borderline":
      return `الطحال في الحد الأعلى للطبيعي (${(Number(p.truth) / 10).toFixed(1)} سم): نقبل طبيعي أو حدّي.`;
    case "kidney.hydro.found":
      return `استسقاء الكلية: صحيح (${GRADES_AR[Number(p.grade)]}).`;
    case "kidney.hydro.grade":
      return item.verdict === "correct"
        ? "درجة الاستسقاء: صحيحة."
        : `الدرجة: كتبت ${GRADES_AR[Number(p.said)]}، والصحيح ${GRADES_AR[Number(p.truth)]}. خفيف: الحوض فقط؛ متوسط: الحوض والكؤوس؛ شديد: كؤوس منتفخة وقشرة رقيقة.`;
    case "kidney.hydro.missed":
      return `فاتك: استسقاء ${GRADES_AR[Number(p.grade)]}. الجيب الكلوي الساطع يفصله سائل أسود متفرع.`;
    case "kidney.hydro.wrongSide":
      return "الاستسقاء في هذه الجهة، وأنت كتبته في الجهة الثانية: انتبه لعلامة الجسم وأي خاصرة عليها المجس.";
    case "kidney.hydro.overcall":
      return "لا يوجد استسقاء في هذه الكلية. المثانة الممتلئة أو الحوض خارج الكلية قد يوسّع الجهاز الجامع قليلًا.";
    case "kidney.stone.found":
      return Number(p.obstructing) ? "حصوة الكلية: صحيح، وهي مسدّة عند الوصل الحوضي الحالبي." : "حصوة الكلية: صحيح.";
    case "kidney.stone.missed":
      return "فاتتك حصوة في الكلية. داخل الجيب الساطع يصعب رؤيتها؛ ابحث عن ظلها (ووميضها في الدوبلر الملون).";
    case "kidney.stone.overcall":
      return "لا توجد حصوة في هذه الكلية: دهون الجيب ساطعة بطبيعتها. الحصوة لها ظل نظيف.";
    case "kidney.cyst.found":
      return "كيس الكلية: صحيح.";
    case "kidney.cyst.missed":
      return "فاتك كيس بسيط بارز من الكلية. امسح القطبين في مستويين.";
    case "kidney.cyst.overcall":
      return "لا يوجد كيس في هذه الكلية. الأهرامات الغامقة ليست أكياس: هي صف داخل القشرة.";
    case "aorta.aneurysm.found":
      return `تمدد الأبهر: صحيح (${(Number(p.truth) / 10).toFixed(1)} سم).`;
    case "aorta.aneurysm.missed":
      return `فاتك: تمدد في الشريان الأبهر البطني (${(Number(p.truth) / 10).toFixed(1)} سم؛ 3 سم أو أكثر = تمدد). تتبّع الأبهر من الحجاب الحاجز حتى التفرع.`;
    case "aorta.aneurysm.overcall":
      return `الأبهر غير متمدد (${(Number(p.truth) / 10).toFixed(1)} سم). قِس من الجدار الخارجي إلى الجدار الخارجي، عموديًا على الوعاء.`;
    case "fluid.found":
      return `السوائل الحرة: صحيح (${AMOUNTS_AR[Number(p.amount)]}).`;
    case "fluid.amount":
      return item.verdict === "correct"
        ? "كمية السوائل: صحيحة."
        : `الكمية: كتبت ${AMOUNTS_AR[Number(p.said)]}، والصحيح ${AMOUNTS_AR[Number(p.truth)]}.`;
    case "fluid.missed":
      return `فاتتك سوائل حرة (${AMOUNTS_AR[Number(p.amount)]}). ابدأ بجيب موريسون (بين الكبد والكلية اليمنى)، ثم حول الطحال وخلف المثانة.`;
    case "fluid.overcall":
      return "لا توجد سوائل حرة. السوائل داخل الأمعاء أو الوريد الأجوف ليست سوائل حرة.";
    case "pleura.found":
      return `الانصباب الجنبي (${side(p.side)}): صحيح.`;
    case "pleura.missed":
      return `فاتك انصباب جنبي ${side(p.side)}. فوق الحجاب الحاجز عبر الكبد أو الطحال: سائل أسود، ويظهر العمود الفقري من خلاله.`;
    case "pleura.overcall":
      return `لا يوجد انصباب جنبي ${side(p.side)}: صورة الكبد المنعكسة فوق الحجاب هي رئة طبيعية مملوءة بالهواء.`;
    case "study.normal":
      return "فحص طبيعي وكتبته طبيعي.";
    case "study.normal.overcalled":
      return "هذا المريض طبيعي: كل ما كتبته غير طبيعي ليس موجودًا.";
    case "impression.empty":
      return "لم تكتب الخلاصة (Impression): في هذا المستوى هي جوابك على السؤال السريري.";
    case "impression.stated":
      return `الخلاصة تذكر ${diagnosis(p.diagnosis)}${p.side ? ` (${side(p.side)})` : ""} ✓`;
    case "impression.onlyStones":
      return "الخلاصة: ذكرت الحصوات لكن لم تذكر الالتهاب.";
    case "impression.missing":
      return `الخلاصة لا تذكر ${diagnosis(p.diagnosis)}${p.side ? ` (${side(p.side)})` : ""}.`;
    case "impression.wrongSide":
      return `الخلاصة تضع ${diagnosis(p.diagnosis)} في الجهة الخطأ (الصحيح ${side(p.side)}).`;
    case "impression.noSide":
      return `الخلاصة: ${diagnosis(p.diagnosis)}، لكن في أي جهة؟ (${side(p.side)})`;
    case "impression.overcall":
      return `الخلاصة تذكر ${diagnosis(p.diagnosis)}، وهذا غير موجود عند المريض.`;
    case "impression.normal":
      return "الخلاصة: فحص طبيعي ✓";
    case "impression.notNormal":
      return "الخلاصة: اكتبها بوضوح: «فحص سونار البطن طبيعي».";
    default:
      return item.code;
  }
}

export const REPORT_EN: ReportCopy = {
  tab: "Report",
  title: "Reporting exam",
  intro:
    "A patient arrives with a request form. Scan the abdomen, measure, and write the report the way a department does. The case is drawn at random (sizes, sides, grades, an incidental finding now and then), and your report is marked against what the patient really has.",
  levels: {
    1: {
      name: "Level 1 · Focused",
      text: "One clear finding in the organ the request asks about. Report that organ. Organ labels allowed.",
    },
    2: {
      name: "Level 2 · Full survey",
      text: "A full abdominal report: every organ, routine measurements. Zero to two findings; some patients are normal.",
    },
    3: {
      name: "Level 3 · Consultant",
      text: "Subtle findings, grades, tight measurements, incidental findings, and a written impression marked like an examiner would.",
    },
  },
  start: "Start a case",
  codeLabel: "Exam code (from your teacher)",
  codePlaceholder: "e.g. 4f9k2a",
  open: "Open",
  badCode: "That code is not valid.",
  recent: "Your recent results",
  best: "Best",
  none: "No attempts yet.",
  request: "Request form",
  patient: (sex, age) => `${sex === "m" ? "Male" : "Female"}, ${age} years`,
  mrn: "MRN",
  from: "Referred by",
  examination: "Examination",
  examinationName: "Ultrasound abdomen",
  clinical: "Clinical details",
  departments: {
    emergency: "Emergency department",
    surgery: "General surgery clinic",
    medicine: "Internal medicine",
    urology: "Urology clinic",
    oncology: "Oncology",
    familyMedicine: "Family medicine",
    vascular: "Vascular surgery",
  },
  reasons: {
    biliaryColic: () => "Recurrent right upper quadrant pain after fatty meals for 3 months. Afebrile. ?Gallstones.",
    cholecystitis: () => "Constant right upper quadrant pain for 2 days, fever 38.6 °C, WBC 15.2. Tender in the RUQ.",
    dyspepsia: () => "Dyspepsia and bloating. Normal bloods. ?Gallbladder pathology.",
    metabolic: () => "Raised ALT on routine bloods. BMI 33, type 2 diabetes.",
    liverLesion: () => "Liver lesion reported on outside imaging. Please characterise.",
    staging: () => "Known adenocarcinoma of the sigmoid colon. Weight loss 6 kg. Staging.",
    renalColic: () => "Sudden severe loin pain radiating to the groin since this morning. Microscopic haematuria.",
    haematuria: () => "Painless microscopic haematuria on two occasions.",
    hypertension: () => "Newly diagnosed hypertension. Renal assessment.",
    pulsatileMass: () => "Pulsatile epigastric mass on examination. Ex-smoker.",
    aaaScreening: () => "Abdominal aortic aneurysm screening. Ex-smoker, hypertensive.",
    trauma: () => "Road traffic collision. Abdominal pain, BP 95/60, HR 118. FAST.",
    distension: () => "Progressive abdominal distension over 3 weeks.",
    feverLuq: () => "Fever, sore throat and fatigue for 2 weeks. Left upper quadrant fullness.",
    nightSweats: () => "Night sweats and weight loss. Left upper quadrant discomfort. ?Lymphoma.",
    dyspnoea: () => "Shortness of breath. Reduced air entry at the lung base.",
    vaguePain: () => "Vague abdominal pain for 6 weeks. Normal bloods.",
    rightUpperPain: () => "Right-sided abdominal pain. ?Cause.",
  },
  question: "Clinical question",
  focusQuestion: (section) => `Assess the ${section.toLowerCase()} and report your findings.`,
  preparing: "Preparing the patient…",
  rules: {
    1: "Calipers, Doppler and organ labels are allowed; outlines and CT are off. Hold X to press the probe in: it pushes bowel gas aside, and shows whether the patient hurts there.",
    2: "Calipers and Doppler are allowed; labels, outlines and CT are off. Hold X to press the probe in: it pushes bowel gas aside, and shows whether the patient hurts there.",
    3: "Calipers and Doppler are allowed; labels, outlines and CT are off. Measurements are marked tightly. Hold X to press the probe in.",
  },
  elapsed: "Time",
  sections: {
    liver: "Liver",
    gallbladder: "Gallbladder",
    pancreas: "Pancreas",
    spleen: "Spleen",
    kidneyRight: "Right kidney",
    kidneyLeft: "Left kidney",
    aorta: "Aorta",
    bladder: "Urinary bladder",
    fluid: "Free fluid",
    pleura: "Pleural spaces",
  },
  fields: {
    echotexture: "Echotexture",
    lesion: "Focal lesion",
    lesionSize: "Lesion size (largest)",
    status: "Findings",
    largest: "Largest stone / polyp",
    wall: "Wall thickness",
    murphy: "Sonographic Murphy's sign",
    length: "Length (pole to pole)",
    enlarged: "Enlarged",
    hydro: "Hydronephrosis",
    stone: "Stone",
    stoneSize: "Stone size",
    cyst: "Cyst",
    cystSize: "Cyst size",
    diameter: "Maximum diameter (outer to outer)",
    aneurysm: "Aneurysm",
    amount: "Amount",
    effusion: "Pleural effusion",
    pancreas: "Pancreas",
    bladder: "Urinary bladder",
  },
  options: {
    fatty: { 0: "Normal", 1: "Fatty, mild", 2: "Fatty, moderate", 3: "Fatty, severe" },
    lesions: { none: "None", cyst: "Simple cyst", hemangioma: "Haemangioma", metastases: "Metastases" },
    gallbladder: { normal: "Normal", stones: "Gallstones", polyp: "Polyp", cholecystitis: "Acute cholecystitis" },
    hydro: { 0: "None", 1: "Mild", 2: "Moderate", 3: "Severe" },
    fluid: { 0: "None", 1: "Small", 2: "Moderate", 3: "Large" },
    pancreas: { normal: "Unremarkable", obscured: "Obscured by gas" },
    yes: "Yes",
    no: "No",
    positive: "Positive",
    negative: "Negative",
    right: "Right",
    left: "Left",
  },
  mm: "mm",
  fromCaliper: (mm) => `Use caliper: ${mm} mm`,
  noCaliper: "Freeze and measure with the calipers to fill this in.",
  impression: "Impression",
  impressionHint: {
    1: "Optional at this level.",
    2: "Optional at this level: written from your findings if left empty.",
    3: "Marked: state each finding (and its side), no more. English or Arabic.",
  },
  impressionPlaceholder: "1. …\n2. …",
  preview: "Your report so far",
  submit: "Hand in the report",
  confirmSubmit: "Hand in? You cannot change the report afterwards.",
  abandon: "Leave this case",
  confirmAbandon: "Leave this case without marking?",
  score: "Score",
  passed: "Pass",
  failed: "Not yet a pass",
  took: (minutes, seconds) => `${minutes} min ${String(seconds).padStart(2, "0")} s`,
  points: (earned, max) => `${earned} / ${max}`,
  marking: "Marking",
  modelReport: "Consultant's report",
  yourReport: "Your report",
  reportLanguage: "Report language",
  findings: "Findings",
  impressionHeading: "Impression",
  showMe: "Show me",
  aiming: "Finding a view…",
  noView: "No clear view found",
  next: "Next case",
  levels3: "Change level",
  copyCode: "Copy the exam code",
  copyReport: "Copy the report",
  inProgress: "Report in progress",
  back: "Back to the report",
  locked: "Off during the exam",
  reaction: "The patient winces and catches their breath as you press here.",
  nativeAneurysm:
    "This man's own CT shows a real infrarenal aortic aneurysm of about 3.7 cm: in this case it was left as it is, an incidental finding the request never mentions. Always look at the aorta in men over 65.",
  diagnoses: DIAGNOSES_EN,
  feedback: feedbackEn,
};

export const REPORT_AR: ReportCopy = {
  tab: "التقرير",
  title: "امتحان كتابة التقرير",
  intro:
    "يصلك مريض مع طلب فحص. امسح البطن، خذ القياسات، واكتب التقرير مثل ما يكتبه القسم. الحالة عشوائية (الأحجام والجهة والدرجة، وأحيانًا موجودة عرضية)، وتقريرك يُصحَّح على ما عند المريض فعلًا.",
  levels: {
    1: { name: "المستوى 1 · مركّز", text: "موجودة واحدة واضحة في العضو المطلوب. اكتب تقرير هذا العضو. مسموح بأسماء الأعضاء." },
    2: { name: "المستوى 2 · فحص كامل", text: "تقرير بطن كامل: كل الأعضاء والقياسات الروتينية. من صفر إلى موجودتين؛ وبعض المرضى طبيعيين." },
    3: { name: "المستوى 3 · استشاري", text: "موجودات دقيقة، درجات، قياسات بتصحيح صارم، موجودات عرضية، وخلاصة مكتوبة تُصحَّح مثل الممتحن." },
  },
  start: "ابدأ حالة",
  codeLabel: "رمز الامتحان (من الدكتور)",
  codePlaceholder: "مثال: 4f9k2a",
  open: "افتح",
  badCode: "الرمز غير صحيح.",
  recent: "نتائجك الأخيرة",
  best: "الأفضل",
  none: "لا توجد محاولات بعد.",
  request: "طلب الفحص",
  patient: (sex, age) => `${sex === "m" ? "ذكر" : "أنثى"}، ${age} سنة`,
  mrn: "رقم الملف",
  from: "الجهة المحوِّلة",
  examination: "الفحص",
  examinationName: "سونار البطن",
  clinical: "المعلومات السريرية",
  departments: {
    emergency: "الطوارئ",
    surgery: "عيادة الجراحة العامة",
    medicine: "الباطنية",
    urology: "عيادة المسالك البولية",
    oncology: "الأورام",
    familyMedicine: "طب الأسرة",
    vascular: "جراحة الأوعية الدموية",
  },
  reasons: {
    biliaryColic: () => "ألم متكرر في الربع العلوي الأيمن بعد الوجبات الدسمة منذ 3 أشهر. بدون حرارة. ؟حصوات المرارة.",
    cholecystitis: () => "ألم مستمر في الربع العلوي الأيمن منذ يومين، حرارة 38.6، كريات بيضاء 15.2. ألم عند الجس في الربع العلوي الأيمن.",
    dyspepsia: () => "عسر هضم وانتفاخ. التحاليل طبيعية. ؟مشكلة في المرارة.",
    metabolic: () => "ارتفاع إنزيم ALT في التحاليل الروتينية. مؤشر كتلة الجسم 33، سكري نوع 2.",
    liverLesion: () => "آفة في الكبد في فحص خارجي. الرجاء توصيفها.",
    staging: () => "سرطان غدي معروف في القولون السيني. نقص وزن 6 كغ. للتصنيف (staging).",
    renalColic: () => "ألم شديد مفاجئ في الخاصرة ينتشر إلى أسفل البطن منذ الصباح. دم مجهري في البول.",
    haematuria: () => "دم مجهري في البول بدون ألم في مرتين.",
    hypertension: () => "ارتفاع ضغط مشخّص حديثًا. تقييم الكلى.",
    pulsatileMass: () => "كتلة نابضة في أعلى البطن عند الفحص. مدخن سابق.",
    aaaScreening: () => "فحص مسحي لتمدد الشريان الأبهر البطني. مدخن سابق، ضغط مرتفع.",
    trauma: () => "حادث سير. ألم في البطن، الضغط 95/60، النبض 118. FAST.",
    distension: () => "انتفاخ متزايد في البطن منذ 3 أسابيع.",
    feverLuq: () => "حرارة والتهاب حلق وإرهاق منذ أسبوعين. امتلاء في الربع العلوي الأيسر.",
    nightSweats: () => "تعرق ليلي ونقص وزن. انزعاج في الربع العلوي الأيسر. ؟ليمفوما.",
    dyspnoea: () => "ضيق تنفس. نقص دخول الهواء في قاعدة الرئة.",
    vaguePain: () => "ألم غير محدد في البطن منذ 6 أسابيع. التحاليل طبيعية.",
    rightUpperPain: () => "ألم في الجهة اليمنى من البطن. ؟السبب.",
  },
  question: "السؤال السريري",
  focusQuestion: (section) => `قيّم ${section} واكتب موجوداتك.`,
  preparing: "جاري تجهيز المريض…",
  rules: {
    1: "مسموح: المساطر (Calipers) والدوبلر وأسماء الأعضاء؛ التحديد والأشعة المقطعية مقفلة. اضغط مطوّلًا على X لتضغط بالمجس: يبعد غازات الأمعاء، ويبين إذا المريض يتألم في المكان.",
    2: "مسموح: المساطر والدوبلر؛ الأسماء والتحديد والأشعة المقطعية مقفلة. اضغط مطوّلًا على X لتضغط بالمجس: يبعد غازات الأمعاء، ويبين إذا المريض يتألم في المكان.",
    3: "مسموح: المساطر والدوبلر؛ الأسماء والتحديد والأشعة المقطعية مقفلة. القياسات تُصحَّح بدقة. اضغط مطوّلًا على X لتضغط بالمجس.",
  },
  elapsed: "الوقت",
  sections: {
    liver: "الكبد",
    gallbladder: "المرارة",
    pancreas: "البنكرياس",
    spleen: "الطحال",
    kidneyRight: "الكلية اليمنى",
    kidneyLeft: "الكلية اليسرى",
    aorta: "الأبهر",
    bladder: "المثانة",
    fluid: "السوائل الحرة",
    pleura: "الغشاء الجنبي",
  },
  fields: {
    echotexture: "النسيج والصدى",
    lesion: "آفة بؤرية",
    lesionSize: "حجم الآفة (الأكبر)",
    status: "الموجودات",
    largest: "أكبر حصوة / سليلة",
    wall: "سماكة الجدار",
    murphy: "علامة مورفي بالسونار",
    length: "الطول (من قطب لقطب)",
    enlarged: "متضخم",
    hydro: "استسقاء",
    stone: "حصوة",
    stoneSize: "حجم الحصوة",
    cyst: "كيس",
    cystSize: "حجم الكيس",
    diameter: "أقصى قطر (خارجي لخارجي)",
    aneurysm: "تمدد",
    amount: "الكمية",
    effusion: "انصباب جنبي",
    pancreas: "البنكرياس",
    bladder: "المثانة",
  },
  options: {
    fatty: { 0: "طبيعي", 1: "دهني خفيف", 2: "دهني متوسط", 3: "دهني شديد" },
    lesions: { none: "لا يوجد", cyst: "كيس بسيط", hemangioma: "ورم وعائي دموي", metastases: "نقائل" },
    gallbladder: { normal: "طبيعية", stones: "حصوات", polyp: "سليلة", cholecystitis: "التهاب حاد" },
    hydro: { 0: "لا يوجد", 1: "خفيف", 2: "متوسط", 3: "شديد" },
    fluid: { 0: "لا يوجد", 1: "قليلة", 2: "متوسطة", 3: "كبيرة" },
    pancreas: { normal: "طبيعي", obscured: "محجوب بالغازات" },
    yes: "نعم",
    no: "لا",
    positive: "إيجابية",
    negative: "سلبية",
    right: "أيمن",
    left: "أيسر",
  },
  mm: "مم",
  fromCaliper: (mm) => `استخدم القياس: ${mm} مم`,
  noCaliper: "جمّد الصورة وقِس بالمسطرة لتعبئة هذا الحقل.",
  impression: "الخلاصة (Impression)",
  impressionHint: {
    1: "اختيارية في هذا المستوى.",
    2: "اختيارية في هذا المستوى: تُكتب من موجوداتك إذا تركتها فارغة.",
    3: "تُصحَّح: اذكر كل موجودة (وجهتها) فقط. بالعربي أو بالإنجليزي.",
  },
  impressionPlaceholder: "1. …\n2. …",
  preview: "تقريرك حتى الآن",
  submit: "سلّم التقرير",
  confirmSubmit: "تسليم؟ لا يمكنك تعديل التقرير بعد ذلك.",
  abandon: "اترك الحالة",
  confirmAbandon: "ترك الحالة بدون تصحيح؟",
  score: "الدرجة",
  passed: "ناجح",
  failed: "لم تنجح بعد",
  took: (minutes, seconds) => `${minutes} د ${String(seconds).padStart(2, "0")} ث`,
  points: (earned, max) => `${earned} / ${max}`,
  marking: "التصحيح",
  modelReport: "تقرير الاستشاري",
  yourReport: "تقريرك",
  reportLanguage: "لغة التقرير",
  findings: "الموجودات",
  impressionHeading: "الخلاصة",
  showMe: "أرني",
  aiming: "جاري إيجاد المقطع…",
  noView: "لم أجد مقطعًا واضحًا",
  next: "الحالة التالية",
  levels3: "غيّر المستوى",
  copyCode: "انسخ رمز الامتحان",
  copyReport: "انسخ التقرير",
  inProgress: "تقرير قيد الكتابة",
  back: "ارجع للتقرير",
  locked: "مقفل أثناء الامتحان",
  reaction: "المريض يتألم ويحبس نفسه عندما تضغط هنا.",
  nativeAneurysm:
    "الأشعة المقطعية الحقيقية لهذا المريض فيها تمدد حقيقي في الشريان الأبهر تحت الكلوي بحوالي 3.7 سم: تُرك كما هو في هذه الحالة، موجودة عرضية لم يذكرها الطلب. افحص الأبهر دائمًا عند الرجال فوق 65.",
  diagnoses: DIAGNOSES_AR,
  feedback: feedbackAr,
};

export const SIDES = { en: SIDE_EN, ar: SIDE_AR };
