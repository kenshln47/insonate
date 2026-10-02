/** The patients Insonate ships with: TotalSegmentator cases built by scripts/build-case.ts. */
export interface Patient {
  readonly id: string;
  readonly age: number;
  readonly sex: "m" | "f";
  /**
   * The patient really has an infrarenal aortic aneurysm (about 3.7 cm): in the source CT, found
   * while checking the case against it. Scanned as he is, he has it; exam cases may narrow it.
   */
  readonly nativeAneurysm?: boolean;
}

export const PATIENTS: readonly Patient[] = [
  { id: "s0319", age: 67, sex: "m", nativeAneurysm: true },
  { id: "s0139", age: 30, sex: "f" },
];

export const DEFAULT_PATIENT = PATIENTS[0].id;
