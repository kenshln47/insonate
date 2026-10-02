import type { Side } from "@insonate/sono-engine";
import type { Language } from "../i18n/messages";
import type { KidneyFacts, ReportFacts, SectionKey } from "./types";

/**
 * Report text, written the way a department writes it: findings organ by organ in the usual order,
 * then a numbered impression with the recommendations that follow from it (AAA surveillance
 * intervals, polyp follow-up). The same writer writes the model report from the truth and the
 * student's report from the draft; numbers the student left out are simply not written.
 */

export interface WrittenReport {
  readonly findings: ReadonlyArray<{ readonly section: SectionKey; readonly organ: string; readonly text: string }>;
  readonly impression: readonly string[];
}

export interface ReportContext {
  /** Free fluid after injury is blood until shown otherwise. */
  readonly trauma: boolean;
}

const cm = (mm: number | null) => (mm === null ? "" : (mm / 10).toFixed(1));
const mmText = (mm: number | null) => (mm === null ? "" : String(Math.round(mm)));

const GRADE_EN = ["", "mild", "moderate", "severe"] as const;
const GRADE_AR = ["", "خفيف", "متوسط", "شديد"] as const;
const POLE_EN = { upper: "upper pole", mid: "interpolar region", lower: "lower pole" } as const;
const POLE_AR = { upper: "القطب العلوي", mid: "المنطقة الوسطى", lower: "القطب السفلي" } as const;

export function writeReport(facts: ReportFacts, language: Language, context: ReportContext): WrittenReport {
  return language === "ar" ? arabic(facts, context) : english(facts, context);
}

// ---------------------------------------------------------------------------------------------
// English

function english(f: ReportFacts, context: ReportContext): WrittenReport {
  const findings: Array<{ section: SectionKey; organ: string; text: string }> = [];
  const size = (mm: number | null, unit: "mm" | "cm" = "mm") => (mm === null ? "" : unit === "cm" ? ` ${cm(mm)} cm` : ` ${mmText(mm)} mm`);

  // Liver
  const liver: string[] = [];
  if (f.liver.fatty > 0) {
    const detail = [
      "",
      "with preserved visualisation of the portal vein walls and diaphragm",
      "with slightly impaired visualisation of the intrahepatic vessels and diaphragm",
      "with poor visualisation of the posterior right lobe and diaphragm",
    ][f.liver.fatty];
    liver.push(
      `Diffusely increased echogenicity ${detail}, in keeping with ${GRADE_EN[f.liver.fatty]} (grade ${f.liver.fatty}) hepatic steatosis.`,
    );
    if (f.liver.sparing) liver.push("A geographic hypoechoic area beside the gallbladder fossa represents focal fatty sparing.");
  } else {
    liver.push("Normal size and homogeneous echotexture.");
  }
  const lobe = f.liver.lobe ? ` in the ${f.liver.lobe} lobe` : "";
  if (f.liver.lesion === "cyst") {
    liver.push(
      `A well-defined anechoic lesion${lobe} with an imperceptible wall and posterior acoustic enhancement,${size(f.liver.lesionMm)}, in keeping with a simple cyst.`,
    );
  } else if (f.liver.lesion === "hemangioma") {
    liver.push(`A well-defined, homogeneous hyperechoic lesion${lobe},${size(f.liver.lesionMm)}, most likely a haemangioma.`);
  } else if (f.liver.lesion === "metastases") {
    const count = f.liver.lesionCount > 1 ? `Multiple (${f.liver.lesionCount})` : "Multiple";
    liver.push(
      `${count} target lesions with hypoechoic halos scattered through the liver${f.liver.lesionMm ? `, the largest${size(f.liver.lesionMm)}` : ""}, in keeping with metastases.`,
    );
  } else {
    liver.push("No focal lesion.");
  }
  findings.push({ section: "liver", organ: "Liver", text: liver.join(" ") });

  // Gallbladder and bile ducts
  const g = f.gallbladder;
  const gb: string[] = [];
  if (g.status === "stones") {
    const many = g.count !== 1;
    gb.push(
      `${many ? "Multiple mobile echogenic calculi" : "A mobile echogenic calculus"} with posterior acoustic shadowing${g.sizeMm ? `, ${many ? "the largest " : ""}${mmText(g.sizeMm)} mm` : ""}. Wall not thickened. No pericholecystic fluid. Sonographic Murphy's sign ${g.murphy ? "positive" : "negative"}.`,
    );
  } else if (g.status === "polyp") {
    gb.push(`A non-shadowing, non-mobile echogenic polyp${g.sizeMm ? `, ${mmText(g.sizeMm)} mm,` : ""} arising from the wall. No calculi.`);
  } else if (g.status === "cholecystitis") {
    gb.push(
      `Distended, with a thickened${g.wallMm ? ` (${mmText(g.wallMm)} mm)` : ""}, layered, oedematous wall and pericholecystic fluid. Calculus impacted in the neck${g.sizeMm ? ` (${mmText(g.sizeMm)} mm)` : ""}. Sonographic Murphy's sign ${g.murphy ? "positive" : "negative"}.`,
    );
  } else {
    gb.push(`Well distended and thin-walled, with no calculi or sludge. Sonographic Murphy's sign ${g.murphy ? "positive" : "negative"}.`);
  }
  gb.push("The common bile duct is not dilated.");
  findings.push({ section: "gallbladder", organ: "Gallbladder and bile ducts", text: gb.join(" ") });

  findings.push({
    section: "pancreas",
    organ: "Pancreas",
    text:
      f.pancreas === "obscured"
        ? "Obscured by bowel gas."
        : "The visualised head and body are unremarkable; the tail is obscured by bowel gas.",
  });

  const spleenLength = f.spleen.lengthMm ? ` (${cm(f.spleen.lengthMm)} cm)` : "";
  findings.push({
    section: "spleen",
    organ: "Spleen",
    text:
      f.spleen.status === "enlarged"
        ? `Enlarged${spleenLength}, with homogeneous echotexture.`
        : f.spleen.status === "borderline"
          ? `Upper limit of normal size${spleenLength}, homogeneous.`
          : `Normal size${spleenLength} and echotexture.`,
  });

  for (const side of ["right", "left"] as const) {
    findings.push({
      section: side === "right" ? "kidneyRight" : "kidneyLeft",
      organ: side === "right" ? "Right kidney" : "Left kidney",
      text: kidneyEnglish(f.kidneys[side]),
    });
  }

  const a = f.aorta;
  findings.push({
    section: "aorta",
    organ: "Aorta and IVC",
    text: a.aneurysm
      ? `Infrarenal abdominal aortic aneurysm, maximum outer diameter${a.diameterMm ? ` ${cm(a.diameterMm)} cm` : " not measured"}${a.thrombus ? ", with crescentic mural thrombus around the lumen" : ""}. The IVC is unremarkable.`
      : `Normal calibre${a.diameterMm ? `, maximum diameter ${cm(a.diameterMm)} cm` : ""}. The IVC is unremarkable.`,
  });
  findings.push({
    section: "bladder",
    organ: "Urinary bladder",
    text: "Adequately distended, with a normal wall and no intraluminal abnormality.",
  });
  findings.push({
    section: "fluid",
    organ: "Free fluid",
    text: [
      "No free fluid.",
      "A small amount of free fluid in Morison's pouch.",
      "A moderate amount of free fluid in Morison's pouch, around the liver tip and the spleen, and in the pelvis.",
      "A large amount of free fluid (ascites) throughout the abdomen and pelvis, with bowel loops floating within it.",
    ][f.fluid],
  });
  const effusions = (["right", "left"] as const).filter((s) => f.effusion[s]);
  findings.push({
    section: "pleura",
    organ: "Pleural spaces",
    text:
      effusions.length === 0
        ? "No pleural effusion."
        : effusions.length === 2
          ? "Bilateral pleural effusions."
          : `${effusions[0] === "right" ? "Right" : "Left"} pleural effusion, anechoic, above the diaphragm.`,
  });

  return { findings, impression: impressionEnglish(f, context) };
}

function kidneyEnglish(k: KidneyFacts): string {
  const parts: string[] = [];
  parts.push(k.lengthMm ? `${cm(k.lengthMm)} cm.` : "Normal size.");
  if (k.hydro > 0) {
    const extent = ["", "renal pelvis", "renal pelvis and calyces", "pelvis and ballooned calyces, with cortical thinning"][k.hydro];
    parts.push(
      `${cap(GRADE_EN[k.hydro])} hydronephrosis, with dilatation of the ${extent}${k.pelvisApMm ? ` (AP pelvic diameter ${mmText(k.pelvisApMm)} mm)` : ""}.`,
    );
  } else {
    parts.push("Normal cortical thickness and corticomedullary differentiation. No hydronephrosis.");
  }
  if (k.stoneMm !== null) {
    const where = k.stoneSite === "pelvis" ? " at the pelviureteric junction" : k.stoneSite === "lowerPole" ? " in the lower pole" : "";
    parts.push(`An echogenic calculus with posterior acoustic shadowing${where}${k.stoneMm ? `, ${mmText(k.stoneMm)} mm` : ""}.`);
  } else if (k.hydro === 0) {
    parts.push("No calculi.");
  }
  if (k.cystMm !== null) {
    parts.push(
      `A simple cortical cyst${k.cystPole ? ` at the ${POLE_EN[k.cystPole]}` : ""}${k.cystMm ? `, ${mmText(k.cystMm)} mm` : ""}: anechoic, thin-walled, with posterior enhancement.`,
    );
  } else {
    parts.push("No focal lesion.");
  }
  return parts.join(" ");
}

function impressionEnglish(f: ReportFacts, context: ReportContext): string[] {
  const lines: string[] = [];
  const sideName = (s: Side) => (s === "right" ? "Right" : "Left");
  if (f.aorta.aneurysm) {
    const d = f.aorta.diameterMm;
    const advice =
      d === null
        ? "Vascular surgery referral."
        : d >= 55
          ? "Urgent vascular surgery referral (≥ 5.5 cm)."
          : d >= 45
            ? "Vascular surgery referral; ultrasound surveillance every 3 months."
            : "Ultrasound surveillance every 12 months.";
    lines.push(
      `Infrarenal abdominal aortic aneurysm${d ? `, ${cm(d)} cm` : ""}${f.aorta.thrombus ? ", with mural thrombus" : ""}. ${advice}`,
    );
  }
  if (f.fluid > 0 && context.trauma) {
    // After injury, the positive FAST answers the question asked: it comes first.
    lines.unshift(
      "Free intraperitoneal fluid (positive FAST): in the setting of trauma, presumed haemoperitoneum. Urgent surgical review.",
    );
  } else if (f.fluid > 0) {
    lines.push(`${["", "Small amount of", "Moderate", "Large-volume"][f.fluid]} free fluid${f.fluid === 3 ? " (ascites)" : ""}.`);
  }
  if (f.gallbladder.status === "cholecystitis") lines.push("Acute calculous cholecystitis.");
  for (const side of ["right", "left"] as const) {
    const k = f.kidneys[side];
    if (k.hydro > 0) {
      const cause =
        k.stoneMm !== null && k.stoneSite === "pelvis"
          ? ` secondary to an obstructing${k.stoneMm ? ` ${mmText(k.stoneMm)} mm` : ""} calculus at the pelviureteric junction`
          : "";
      lines.push(`${sideName(side)} ${GRADE_EN[k.hydro]} hydronephrosis${cause}.`);
    }
    if (k.stoneMm !== null && !(k.hydro > 0 && k.stoneSite === "pelvis")) {
      lines.push(
        `${k.hydro > 0 ? "" : "Non-obstructing "}${k.stoneMm ? `${mmText(k.stoneMm)} mm ` : ""}calculus in the ${side} kidney.`.replace(
          /^./,
          (c) => c.toUpperCase(),
        ),
      );
    }
  }
  if (f.liver.lesion === "metastases") lines.push("Multiple liver lesions in keeping with metastases; correlate with staging CT.");
  const effusions = (["right", "left"] as const).filter((s) => f.effusion[s]);
  if (effusions.length === 2) lines.push("Bilateral pleural effusions.");
  else if (effusions.length === 1) lines.push(`${sideName(effusions[0])} pleural effusion.`);
  if (f.spleen.status === "enlarged") lines.push(`Splenomegaly${f.spleen.lengthMm ? ` (${cm(f.spleen.lengthMm)} cm)` : ""}.`);
  if (f.gallbladder.status === "stones") lines.push("Cholelithiasis, without sonographic features of acute cholecystitis.");
  if (f.gallbladder.status === "polyp") {
    const s = f.gallbladder.sizeMm;
    const advice =
      s === null ? "" : s >= 10 ? " Surgical opinion advised." : s >= 6 ? " Follow-up ultrasound in 12 months." : " No follow-up needed.";
    lines.push(`Gallbladder polyp${s ? `, ${mmText(s)} mm` : ""}.${advice}`);
  }
  if (f.liver.fatty > 0)
    lines.push(
      `${cap(GRADE_EN[f.liver.fatty])} hepatic steatosis (grade ${f.liver.fatty})${f.liver.sparing ? ", with focal fatty sparing beside the gallbladder" : ""}.`,
    );
  if (f.liver.lesion === "hemangioma")
    lines.push(`${f.liver.lesionMm ? `${mmText(f.liver.lesionMm)} mm h` : "H"}yperechoic liver lesion, most likely a haemangioma.`);
  if (f.liver.lesion === "cyst")
    lines.push(`Simple hepatic cyst${f.liver.lesionMm ? ` (${mmText(f.liver.lesionMm)} mm)` : ""}: benign, no follow-up required.`);
  for (const side of ["right", "left"] as const) {
    const k = f.kidneys[side];
    if (k.cystMm !== null) lines.push(`Simple (Bosniak I) ${side} renal cyst${k.cystMm ? `, ${mmText(k.cystMm)} mm` : ""}: benign.`);
  }
  if (f.spleen.status === "borderline") lines.push(`Borderline splenic size${f.spleen.lengthMm ? ` (${cm(f.spleen.lengthMm)} cm)` : ""}.`);
  if (lines.length === 0) return ["Normal abdominal ultrasound."];
  return lines;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------------------------
// Arabic

function arabic(f: ReportFacts, context: ReportContext): WrittenReport {
  const findings: Array<{ section: SectionKey; organ: string; text: string }> = [];
  const size = (mm: number | null) => (mm === null ? "" : ` ${mmText(mm)} مم`);

  const liver: string[] = [];
  if (f.liver.fatty > 0) {
    const detail = [
      "",
      "مع وضوح جدران الوريد البابي والحجاب الحاجز",
      "مع ضعف بسيط في وضوح الأوعية داخل الكبد والحجاب الحاجز",
      "مع ضعف وضوح الجزء الخلفي من الفص الأيمن والحجاب الحاجز",
    ][f.liver.fatty];
    liver.push(`زيادة منتشرة في صدى الكبد ${detail}، تتوافق مع تشحم كبدي ${GRADE_AR[f.liver.fatty]} (الدرجة ${f.liver.fatty}).`);
    if (f.liver.sparing) liver.push("منطقة ناقصة الصدى غير منتظمة بجوار حفرة المرارة تمثل منطقة خالية من الدهون (focal fatty sparing).");
  } else {
    liver.push("حجم طبيعي ونسيج متجانس.");
  }
  const lobe = f.liver.lobe ? ` في الفص ${f.liver.lobe === "right" ? "الأيمن" : "الأيسر"}` : "";
  if (f.liver.lesion === "cyst") {
    liver.push(`آفة عديمة الصدى واضحة الحدود${lobe} بجدار رقيق جدًا وتعزيز صوتي خلفي،${size(f.liver.lesionMm)}، تتوافق مع كيس بسيط.`);
  } else if (f.liver.lesion === "hemangioma") {
    liver.push(`آفة مفرطة الصدى متجانسة واضحة الحدود${lobe}،${size(f.liver.lesionMm)}، الأرجح ورم وعائي دموي (haemangioma).`);
  } else if (f.liver.lesion === "metastases") {
    const count = f.liver.lesionCount > 1 ? `آفات متعددة (${f.liver.lesionCount})` : "آفات متعددة";
    liver.push(
      `${count} على شكل هدف بهالة ناقصة الصدى منتشرة في الكبد${f.liver.lesionMm ? `، أكبرها${size(f.liver.lesionMm)}` : ""}، تتوافق مع نقائل (metastases).`,
    );
  } else {
    liver.push("لا توجد آفات بؤرية.");
  }
  findings.push({ section: "liver", organ: "الكبد", text: liver.join(" ") });

  const g = f.gallbladder;
  const gb: string[] = [];
  const murphy = `علامة مورفي بالسونار ${g.murphy ? "إيجابية" : "سلبية"}.`;
  if (g.status === "stones") {
    const many = g.count !== 1;
    gb.push(
      `${many ? "حصوات متعددة متحركة مفرطة الصدى" : "حصوة متحركة مفرطة الصدى"} مع ظل صوتي خلفي${g.sizeMm ? `، ${many ? "أكبرها" : "قطرها"}${size(g.sizeMm)}` : ""}. الجدار غير متسمك ولا توجد سوائل حول المرارة. ${murphy}`,
    );
  } else if (g.status === "polyp") {
    gb.push(`سليلة (polyp) مفرطة الصدى ثابتة بدون ظل صوتي${g.sizeMm ? `،${size(g.sizeMm)}،` : ""} على جدار المرارة. لا توجد حصوات.`);
  } else if (g.status === "cholecystitis") {
    gb.push(
      `مرارة متمددة مع تسمك الجدار${g.wallMm ? ` (${mmText(g.wallMm)} مم)` : ""} وتطبّقه بسبب الوذمة، وسوائل حول المرارة. حصوة منحشرة في عنق المرارة${g.sizeMm ? ` (${mmText(g.sizeMm)} مم)` : ""}. ${murphy}`,
    );
  } else {
    gb.push(`متمددة بشكل جيد بجدار رقيق، بدون حصوات أو رواسب. ${murphy}`);
  }
  gb.push("القناة الصفراوية المشتركة غير متوسعة.");
  findings.push({ section: "gallbladder", organ: "المرارة والقنوات الصفراوية", text: gb.join(" ") });

  findings.push({
    section: "pancreas",
    organ: "البنكرياس",
    text: f.pancreas === "obscured" ? "محجوب بغازات الأمعاء." : "الرأس والجسم المرئيان طبيعيان؛ الذيل محجوب بغازات الأمعاء.",
  });

  const spleenLength = f.spleen.lengthMm ? ` (${cm(f.spleen.lengthMm)} سم)` : "";
  findings.push({
    section: "spleen",
    organ: "الطحال",
    text:
      f.spleen.status === "enlarged"
        ? `متضخم${spleenLength}، نسيجه متجانس.`
        : f.spleen.status === "borderline"
          ? `في الحد الأعلى للحجم الطبيعي${spleenLength}، نسيجه متجانس.`
          : `حجم طبيعي${spleenLength} ونسيج متجانس.`,
  });

  for (const side of ["right", "left"] as const) {
    findings.push({
      section: side === "right" ? "kidneyRight" : "kidneyLeft",
      organ: side === "right" ? "الكلية اليمنى" : "الكلية اليسرى",
      text: kidneyArabic(f.kidneys[side]),
    });
  }

  const a = f.aorta;
  findings.push({
    section: "aorta",
    organ: "الأبهر والوريد الأجوف السفلي",
    text: a.aneurysm
      ? `تمدد في الشريان الأبهر البطني تحت الكلوي، أقصى قطر خارجي${a.diameterMm ? ` ${cm(a.diameterMm)} سم` : " لم يُقس"}${a.thrombus ? "، مع خثرة جدارية هلالية حول التجويف" : ""}. الوريد الأجوف السفلي طبيعي.`
      : `قطر طبيعي${a.diameterMm ? `، أقصى قطر ${cm(a.diameterMm)} سم` : ""}. الوريد الأجوف السفلي طبيعي.`,
  });
  findings.push({ section: "bladder", organ: "المثانة", text: "ممتلئة بشكل كافٍ، جدارها طبيعي، ولا توجد محتويات غير طبيعية." });
  findings.push({
    section: "fluid",
    organ: "السوائل الحرة",
    text: [
      "لا توجد سوائل حرة.",
      "كمية قليلة من السوائل الحرة في جيب موريسون.",
      "كمية متوسطة من السوائل الحرة في جيب موريسون وحول طرف الكبد والطحال وفي الحوض.",
      "كمية كبيرة من السوائل الحرة (استسقاء بطني) في البطن والحوض، تطفو فيها الأمعاء.",
    ][f.fluid],
  });
  const effusions = (["right", "left"] as const).filter((s) => f.effusion[s]);
  findings.push({
    section: "pleura",
    organ: "الغشاء الجنبي",
    text:
      effusions.length === 0
        ? "لا يوجد انصباب جنبي."
        : effusions.length === 2
          ? "انصباب جنبي في الجهتين."
          : `انصباب جنبي ${effusions[0] === "right" ? "أيمن" : "أيسر"} عديم الصدى فوق الحجاب الحاجز.`,
  });
  return { findings, impression: impressionArabic(f, context) };
}

function kidneyArabic(k: KidneyFacts): string {
  const parts: string[] = [];
  parts.push(k.lengthMm ? `${cm(k.lengthMm)} سم.` : "حجم طبيعي.");
  if (k.hydro > 0) {
    const extent = ["", "حوض الكلية", "حوض الكلية والكؤوس", "الحوض والكؤوس بشكل كبير مع ترقق القشرة"][k.hydro];
    parts.push(
      `استسقاء كلوي ${GRADE_AR[k.hydro]} مع توسع ${extent}${k.pelvisApMm ? ` (القطر الأمامي الخلفي للحوض ${mmText(k.pelvisApMm)} مم)` : ""}.`,
    );
  } else {
    parts.push("سماكة القشرة والتمايز القشري اللبي طبيعيان. لا يوجد استسقاء.");
  }
  if (k.stoneMm !== null) {
    const where = k.stoneSite === "pelvis" ? " عند الوصل الحوضي الحالبي" : k.stoneSite === "lowerPole" ? " في القطب السفلي" : "";
    parts.push(`حصوة مفرطة الصدى مع ظل صوتي خلفي${where}${k.stoneMm ? `، ${mmText(k.stoneMm)} مم` : ""}.`);
  } else if (k.hydro === 0) {
    parts.push("لا توجد حصوات.");
  }
  if (k.cystMm !== null) {
    parts.push(
      `كيس قشري بسيط${k.cystPole ? ` في ${POLE_AR[k.cystPole]}` : ""}${k.cystMm ? `، ${mmText(k.cystMm)} مم` : ""}: عديم الصدى بجدار رقيق وتعزيز خلفي.`,
    );
  } else {
    parts.push("لا توجد آفات بؤرية.");
  }
  return parts.join(" ");
}

function impressionArabic(f: ReportFacts, context: ReportContext): string[] {
  const lines: string[] = [];
  const sideName = (s: Side) => (s === "right" ? "اليمنى" : "اليسرى");
  if (f.aorta.aneurysm) {
    const d = f.aorta.diameterMm;
    const advice =
      d === null
        ? "تحويل إلى جراحة الأوعية."
        : d >= 55
          ? "تحويل عاجل إلى جراحة الأوعية (5.5 سم أو أكثر)."
          : d >= 45
            ? "تحويل إلى جراحة الأوعية ومتابعة بالسونار كل 3 أشهر."
            : "متابعة بالسونار كل 12 شهرًا.";
    lines.push(`تمدد الشريان الأبهر البطني تحت الكلوي${d ? `، ${cm(d)} سم` : ""}${f.aorta.thrombus ? "، مع خثرة جدارية" : ""}. ${advice}`);
  }
  if (f.fluid > 0 && context.trauma) {
    // بعد الإصابة، FAST الإيجابي هو جواب السؤال: يأتي أولًا.
    lines.unshift("سوائل حرة داخل البطن (FAST إيجابي): في سياق الإصابة يُفترض أنها نزيف داخلي. مراجعة جراحية عاجلة.");
  } else if (f.fluid > 0) {
    lines.push(
      `${["", "كمية قليلة من", "كمية متوسطة من", "كمية كبيرة من"][f.fluid]} السوائل الحرة${f.fluid === 3 ? " (استسقاء بطني)" : ""}.`,
    );
  }
  if (f.gallbladder.status === "cholecystitis") lines.push("التهاب المرارة الحاد الحصوي.");
  for (const side of ["right", "left"] as const) {
    const k = f.kidneys[side];
    if (k.hydro > 0) {
      const cause =
        k.stoneMm !== null && k.stoneSite === "pelvis"
          ? ` بسبب حصوة مسدّة${k.stoneMm ? ` ${mmText(k.stoneMm)} مم` : ""} عند الوصل الحوضي الحالبي`
          : "";
      lines.push(`استسقاء ${GRADE_AR[k.hydro]} في الكلية ${sideName(side)}${cause}.`);
    }
    if (k.stoneMm !== null && !(k.hydro > 0 && k.stoneSite === "pelvis")) {
      lines.push(
        `حصوة${k.stoneMm ? ` ${mmText(k.stoneMm)} مم` : ""} ${k.hydro > 0 ? "" : "غير مسدّة "}في الكلية ${sideName(side)}.`.replace(
          "  ",
          " ",
        ),
      );
    }
  }
  if (f.liver.lesion === "metastases") lines.push("آفات كبدية متعددة تتوافق مع نقائل؛ يُنصح بالمقارنة مع الأشعة المقطعية للتصنيف.");
  const effusions = (["right", "left"] as const).filter((s) => f.effusion[s]);
  if (effusions.length === 2) lines.push("انصباب جنبي في الجهتين.");
  else if (effusions.length === 1) lines.push(`انصباب جنبي ${effusions[0] === "right" ? "أيمن" : "أيسر"}.`);
  if (f.spleen.status === "enlarged") lines.push(`تضخم الطحال${f.spleen.lengthMm ? ` (${cm(f.spleen.lengthMm)} سم)` : ""}.`);
  if (f.gallbladder.status === "stones") lines.push("حصوات المرارة، بدون علامات التهاب حاد.");
  if (f.gallbladder.status === "polyp") {
    const s = f.gallbladder.sizeMm;
    const advice = s === null ? "" : s >= 10 ? " يُنصح برأي جراحي." : s >= 6 ? " متابعة بالسونار بعد 12 شهرًا." : " لا يحتاج متابعة.";
    lines.push(`سليلة في المرارة${s ? `، ${mmText(s)} مم` : ""}.${advice}`);
  }
  if (f.liver.fatty > 0)
    lines.push(
      `تشحم كبدي ${GRADE_AR[f.liver.fatty]} (الدرجة ${f.liver.fatty})${f.liver.sparing ? "، مع منطقة خالية من الدهون بجوار المرارة" : ""}.`,
    );
  if (f.liver.lesion === "hemangioma")
    lines.push(`آفة كبدية مفرطة الصدى${f.liver.lesionMm ? ` ${mmText(f.liver.lesionMm)} مم` : ""}، الأرجح ورم وعائي دموي.`);
  if (f.liver.lesion === "cyst")
    lines.push(`كيس كبدي بسيط${f.liver.lesionMm ? ` (${mmText(f.liver.lesionMm)} مم)` : ""}: حميد ولا يحتاج متابعة.`);
  for (const side of ["right", "left"] as const) {
    const k = f.kidneys[side];
    if (k.cystMm !== null)
      lines.push(`كيس بسيط (Bosniak I) في الكلية ${sideName(side)}${k.cystMm ? `، ${mmText(k.cystMm)} مم` : ""}: حميد.`);
  }
  if (f.spleen.status === "borderline")
    lines.push(`حجم الطحال في الحد الأعلى للطبيعي${f.spleen.lengthMm ? ` (${cm(f.spleen.lengthMm)} سم)` : ""}.`);
  if (lines.length === 0) return ["فحص سونار البطن طبيعي."];
  return lines;
}
