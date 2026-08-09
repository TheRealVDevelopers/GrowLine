/**
 * Wellness estimates — the ONLY calculations this app is permitted to perform
 * (CLAUDE.md Section 5.2): BMI with category, estimated body fat % (Deurenberg),
 * BMR, healthy weight range, daily water target, daily calorie guidance.
 *
 * Nothing here may ever estimate cholesterol, blood pressure, muscle mass, blood
 * sugar or any disease risk. Adding such a field is a legal problem, not a
 * feature request.
 *
 * Three deliberate restraints, all documented in DECISIONS.md:
 *  - We REFUSE rather than degrade. A card with blanks gets filled in verbally,
 *    off the record, so a report needs age + height + weight or it isn't made.
 *  - Body fat is a RANGE. The Deurenberg standard error is ~4 percentage points;
 *    a single decimal would claim precision the formula does not have.
 *  - Maintenance calories are NOT produced. Capture collects no activity level,
 *    so any figure would apply an invented multiplier. F3's report does not list
 *    calories either; Section 5.2 permits the metric, it does not require it.
 */

export type Gender = "female" | "male" | "other";

export type WellnessInput = {
  age: number | null;
  gender: Gender | null;
  heightCm: number | null;
  weightKg: number | null;
};

export type MissingInput = "age" | "gender" | "height" | "weight";

/**
 * WHO Asia-Pacific adult classification (WHO/IASO/IOTF 2000): 18.5 / 23 / 25.
 * Lower than the WHO international set because South Asian bodies carry more fat
 * at a given BMI. The card names this standard explicitly — the numbers shown and
 * the standard cited must always match. See DECISIONS.md D12.
 *
 * Note the separate Indian consensus (Misra et al. 2009, JAPI) puts the lower
 * bound of normal at 18.0 rather than 18.5; if you switch to that set, change the
 * citation on the card with it.
 */
export const HEALTHY_BMI_MIN = 18.5;
export const HEALTHY_BMI_MAX = 23;
const BMI_JUST_ABOVE_MAX = 25;

export type BmiBand = {
  key: "below" | "in" | "just_above" | "above";
  /**
   * Describes where the NUMBER sits, never what the person is. No clinical word,
   * and no euphemism either — the number itself is always shown plainly.
   */
  label: string;
};

/** Deurenberg is validated in adults; a separate equation applies to children. */
export const MIN_REPORT_AGE = 18;

/** Deurenberg standard error of estimate, in percentage points. */
const BODY_FAT_SEE = 4;

/**
 * Plausibility guards. Section 5.6 validation already bounds each input on its own
 * (height 60-250cm, weight 10-400kg), but the COMBINATION can still be nonsense: a
 * dropped digit turning 160cm into 60cm yields a BMI over 1000 and a body fat
 * percentage in the hundreds. Publishing that to a prospect would be absurd and
 * alarming, so an implausible result is refused rather than rendered.
 */
const PLAUSIBLE_BMI = { min: 10, max: 60 };
const PLAUSIBLE_BODY_FAT = { min: 3, max: 70 };
const PLAUSIBLE_BMR = { min: 500, max: 5000 };

/**
 * Total daily water, in litres, from EFSA's Adequate Intake (2010) — which agrees
 * with ICMR-NIN's 2024 "about 8 glasses" for Indian adults.
 *
 * Deliberately NOT weight x 30-35 ml. That per-kg rule is a clinical IV-maintenance
 * heuristic for hospitalised patients, descended from a 1945 suggestion of 1 ml per
 * kcal; Valtin (2002) found no evidence for it in healthy adults. Multiplying a
 * prospect's weight by it and calling the product their personal target would be
 * inventing a requirement.
 */
const WATER_LITRES = { female: 2.0, male: 2.5, unknown: { low: 2, high: 2.5 } };

const round = (n: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export type WellnessMetrics = {
  bmi: { value: number; band: BmiBand } | null;
  /** Range, not a point value — the formula cannot support a single figure. */
  bodyFatPct: { low: number; high: number } | null;
  bmrKcal: number | null;
  healthyWeightKg: { min: number; max: number } | null;
  /** Guidance figure, shown as a span when sex is unknown. Never weight-derived. */
  waterLitres: { low: number; high: number } | null;
  missing: MissingInput[];
};

export function computeWellness(input: WellnessInput): WellnessMetrics {
  const { age, gender, heightCm, weightKg } = input;
  const heightM = heightCm !== null && heightCm > 0 ? heightCm / 100 : null;

  // kg * 10000 / cm^2 rather than kg / (cm/100)^2: one fewer rounding step on the
  // way to a value whose band boundaries are exact decimals.
  const bmiExact =
    heightCm !== null && heightCm > 0 && weightKg !== null
      ? (weightKg * 10000) / (heightCm * heightCm)
      : null;

  /**
   * The band is derived from the ROUNDED figure, which is the one on the card.
   * Banding the unrounded value would print "23.0 · In the general range" for a
   * BMI of 22.96 — a card contradicting its own scale.
   */
  const bmiValue = bmiExact !== null ? round(bmiExact, 1) : null;

  // Deurenberg (1991): BF% = 1.20*BMI + 0.23*age - 10.8*sex - 5.4, male=1 female=0.
  // The equation needs a binary sex term, so it is omitted for "other" rather
  // than guessed at.
  const binarySex = gender === "male" ? 1 : gender === "female" ? 0 : null;

  // Uses the UNROUNDED BMI: rounding is a presentation concern, and the band label
  // has to match the printed figure, but the estimate itself should not inherit
  // display precision.
  const bodyFatPoint =
    bmiExact !== null && age !== null && binarySex !== null && age >= MIN_REPORT_AGE
      ? 1.2 * bmiExact + 0.23 * age - 10.8 * binarySex - 5.4
      : null;

  // Mifflin-St Jeor, also requiring a binary sex term.
  const bmrValue =
    weightKg !== null && heightCm !== null && age !== null && binarySex !== null
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + (binarySex === 1 ? 5 : -161)
      : null;

  const missing: MissingInput[] = [];
  if (heightCm === null) missing.push("height");
  if (weightKg === null) missing.push("weight");
  if (age === null) missing.push("age");
  if (gender === null) missing.push("gender");

  const bmiPlausible =
    bmiValue !== null &&
    bmiValue >= PLAUSIBLE_BMI.min &&
    bmiValue <= PLAUSIBLE_BMI.max;
  const bodyFatPlausible =
    bodyFatPoint !== null &&
    bodyFatPoint >= PLAUSIBLE_BODY_FAT.min &&
    bodyFatPoint <= PLAUSIBLE_BODY_FAT.max;
  const bmrPlausible =
    bmrValue !== null &&
    bmrValue >= PLAUSIBLE_BMR.min &&
    bmrValue <= PLAUSIBLE_BMR.max;

  return {
    bmi:
      bmiValue !== null && bmiPlausible
        ? { value: bmiValue, band: bmiBand(bmiValue) }
        : null,
    bodyFatPct:
      bodyFatPoint !== null && bmiPlausible && bodyFatPlausible
        ? {
            low: Math.max(0, Math.round(bodyFatPoint - BODY_FAT_SEE)),
            high: Math.round(bodyFatPoint + BODY_FAT_SEE),
          }
        : null,
    // Rounded to the nearest 10: predictive equations carry roughly +/-10% of
    // individual error, so a to-the-kilocalorie figure claims precision the
    // formula does not have — the same argument that makes body fat a range.
    bmrKcal:
      bmrValue !== null && bmrPlausible ? Math.round(bmrValue / 10) * 10 : null,
    healthyWeightKg:
      heightM !== null
        ? {
            min: round(HEALTHY_BMI_MIN * heightM * heightM, 1),
            max: round(HEALTHY_BMI_MAX * heightM * heightM, 1),
          }
        : null,
    waterLitres:
      gender === "female"
        ? { low: WATER_LITRES.female, high: WATER_LITRES.female }
        : gender === "male"
          ? { low: WATER_LITRES.male, high: WATER_LITRES.male }
          : WATER_LITRES.unknown,
    missing,
  };
}

function bmiBand(bmi: number): BmiBand {
  if (bmi < HEALTHY_BMI_MIN) return { key: "below", label: "Below the general range" };
  if (bmi < HEALTHY_BMI_MAX) return { key: "in", label: "In the general range" };
  if (bmi < BMI_JUST_ABOVE_MAX) {
    return { key: "just_above", label: "Just above the general range" };
  }
  return { key: "above", label: "Above the general range" };
}

export type Eligibility =
  | { ok: true }
  | { ok: false; reason: "incomplete"; missing: MissingInput[] }
  | { ok: false; reason: "under_age" }
  | { ok: false; reason: "implausible" };

/**
 * Whether a report may be produced at all. Age is required (both Deurenberg and
 * Mifflin-St Jeor need it) and under-18s are refused outright: producing body
 * composition estimates for a child would need verifiable parental consent under
 * the DPDP Rules 2025, which a roadside conversation cannot deliver.
 */
export function reportEligibility(input: WellnessInput): Eligibility {
  const needed: MissingInput[] = [];
  if (input.heightCm === null) needed.push("height");
  if (input.weightKg === null) needed.push("weight");
  if (input.age === null) needed.push("age");
  if (needed.length > 0) return { ok: false, reason: "incomplete", missing: needed };
  if (input.age !== null && input.age < MIN_REPORT_AGE) {
    return { ok: false, reason: "under_age" };
  }
  // A height and weight that are each individually valid can still combine into
  // nonsense; better to ask the coach to check them than to publish it.
  if (computeWellness(input).bmi === null) {
    return { ok: false, reason: "implausible" };
  }
  return { ok: true };
}
