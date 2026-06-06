import type { Dataset, Entry, Treatment } from '../types.ts';
import type { Finding } from '../findings.ts';
import { makeFinding } from '../findings.ts';
import { RANGE, formatGlucose } from '../util/glucose.ts';
import { median, round } from '../util/stats.ts';
import { MINUTE_MS } from '../util/time.ts';

/** Carbs at or above this count as a "meal" worth analysing. */
const MEAL_CARB_MIN = 10;
/** Window to pair a bolus with a meal. */
const PAIR_WINDOW_MS = 30 * MINUTE_MS;
/** How far after a meal to look for the post-meal peak. */
const POSTMEAL_MS = 150 * MINUTE_MS;

function nearestEntry(entries: Entry[], ms: number): Entry | null {
  let best: Entry | null = null;
  let bestDelta = Infinity;
  for (const e of entries) {
    const d = Math.abs(e.date - ms);
    if (d < bestDelta) {
      bestDelta = d;
      best = e;
    }
  }
  return best && bestDelta <= 20 * MINUTE_MS ? best : null;
}

interface MealResult {
  /** Positive = bolus delivered before the meal (pre-bolus minutes). */
  preBolusMin: number | null;
  peakRise: number | null;
  peakSgv: number | null;
}

/**
 * Observes meal-bolus *timing* relative to logged carbs and the size of the
 * post-meal glucose excursion that follows. Reports typical pre-bolus lead
 * time and how often meals are followed by a pronounced rise. It does not
 * recommend a carb ratio or a dose — only describes the observed pattern.
 */
export function analyseBolusTiming(ds: Dataset): Finding[] {
  const findings: Finding[] = [];
  const meals = ds.treatments.filter((t) => (t.carbs ?? 0) >= MEAL_CARB_MIN);
  const boluses = ds.treatments.filter((t) => (t.insulin ?? 0) > 0);
  if (meals.length < 3) {
    findings.push(
      makeFinding({
        id: 'bolus.insufficient',
        domain: 'bolus',
        severity: 'info',
        title: 'Not enough logged meals to assess bolus timing',
        detail: `Only ${meals.length} meal(s) of at least ${MEAL_CARB_MIN}g were logged. Meal-timing observations need a larger sample.`,
        metrics: { meals: meals.length },
        window: ds.window,
      }),
    );
    return findings;
  }

  const results: MealResult[] = [];
  for (const meal of meals) {
    // Nearest bolus within the pairing window.
    let pairedBolus: Treatment | null = null;
    let bolusDelta = Infinity;
    for (const b of boluses) {
      const d = Math.abs(b.mills - meal.mills);
      if (d <= PAIR_WINDOW_MS && d < bolusDelta) {
        bolusDelta = d;
        pairedBolus = b;
      }
    }
    const preBolusMin = pairedBolus ? (meal.mills - pairedBolus.mills) / MINUTE_MS : null;

    const atMeal = nearestEntry(ds.entries, meal.mills);
    let peakSgv: number | null = null;
    for (const e of ds.entries) {
      if (e.date >= meal.mills && e.date <= meal.mills + POSTMEAL_MS) {
        if (peakSgv === null || e.sgv > peakSgv) peakSgv = e.sgv;
      }
    }
    const peakRise = atMeal && peakSgv !== null ? peakSgv - atMeal.sgv : null;
    results.push({ preBolusMin, peakRise, peakSgv });
  }

  const preBolusValues = results
    .map((r) => r.preBolusMin)
    .filter((v): v is number => v !== null);
  const pairedCount = preBolusValues.length;

  if (pairedCount >= 3) {
    const medPre = median(preBolusValues);
    findings.push(
      makeFinding({
        id: 'bolus.timing',
        domain: 'bolus',
        severity: 'observation',
        title:
          medPre >= 0
            ? `Boluses were typically delivered about ${round(medPre)} min before meals`
            : `Boluses were typically delivered about ${round(-medPre)} min after meals began`,
        detail: `Across ${pairedCount} meals with a paired bolus, the median lead time was ${round(medPre)} minutes (positive = before the meal). Pre-meal timing influences how high glucose rises afterwards.`,
        metrics: {
          pairedMeals: pairedCount,
          medianPreBolusMin: round(medPre),
        },
        window: ds.window,
      }),
    );
  }

  // Post-meal excursions.
  const rises = results.map((r) => r.peakRise).filter((v): v is number => v !== null);
  const peaks = results.map((r) => r.peakSgv).filter((v): v is number => v !== null);
  if (rises.length >= 3) {
    const highMeals = peaks.filter((p) => p > RANGE.veryHigh).length;
    const highPct = (highMeals / peaks.length) * 100;
    findings.push(
      makeFinding({
        id: 'bolus.postmeal',
        domain: 'bolus',
        severity: highPct >= 40 ? 'attention' : 'observation',
        title: `Meals were followed by a median rise of ${round(median(rises))} mg/dL`,
        detail: `${round(highPct)}% of analysed meals peaked above ${formatGlucose(RANGE.veryHigh, ds.displayUnit)} within ${POSTMEAL_MS / MINUTE_MS} minutes. Larger or more frequent excursions can reflect bolus timing or sizing relative to the meal.`,
        metrics: {
          meals: peaks.length,
          medianRiseMgdl: round(median(rises)),
          peakedAbove250Pct: round(highPct),
        },
        window: ds.window,
      }),
    );
  }

  return findings;
}
