import type { ProbePose, Variant } from "@insonate/sono-engine";

/**
 * Where "Show me the finding" goes for each teaching case: a task's reference view (built for this
 * patient), adjusted where the finding lies elsewhere, with the depth and breath to use.
 */
export const FINDING_VIEWS: Readonly<Record<Variant, { task: string; patch?: Partial<ProbePose>; depthMm: number }>> = {
  normal: { task: "gallbladder-long", depthMm: 140 },
  gallstones: { task: "gallbladder-long", depthMm: 140 },
  freeFluid: { task: "morison", depthMm: 160 },
  hydronephrosis: { task: "kidney-right-long", depthMm: 160 },
  // Transverse at the umbilicus, just left of the midline: the middle of the aneurysm.
  aaa: { task: "aorta-transverse", patch: { zMm: 10, tiltDeg: 0, phiDeg: -12 }, depthMm: 180 },
  liverCyst: { task: "kidney-right-long", depthMm: 160 },
  fattyLiver: { task: "kidney-right-long", depthMm: 160 },
};

/** The cases offered, in teaching order (normal is in the quiz, not the list). */
export const CASE_ORDER: readonly Variant[] = ["gallstones", "freeFluid", "hydronephrosis", "aaa", "liverCyst", "fattyLiver"];

/** A mystery patient: any case, normal included, but not the one just seen. */
export function pickMystery(previous: Variant | null, random = Math.random): Variant {
  const pool = (["normal", ...CASE_ORDER] as Variant[]).filter((v) => v !== previous);
  return pool[Math.floor(random() * pool.length)];
}
