import { Transaction } from "../types";
import { allocateCents } from "./money";
import { isGiftCardProduct, transactionCostCents } from "./financial";
import { productRootCategoryLabel } from "../catalog/categoryTaxonomy";
import {
  calendarDayDifference,
  getZonedDateParts,
  zonedDateTimeToTimestamp,
} from "./time";

export type RetailSeason = "winter" | "spring" | "summer" | "autumn";
export type SeasonalConfidence = "low" | "medium" | "high";

export interface SeasonalCategoryRow {
  category: string;
  revenueCents: number;
  units: number;
  share: number;
}

export interface SeasonalProfile {
  season: RetailSeason;
  label: string;
  averageRevenueCents: number;
  averageGrossProfitCents: number;
  averageUnits: number;
  transactionCount: number;
  completedOccurrences: number;
  categories: SeasonalCategoryRow[];
}

export interface SeasonalRetailSnapshot {
  currentSeason: RetailSeason;
  currentSeasonLabel: string;
  currentRevenueCents: number;
  currentUnits: number;
  currentPaceChange: number | null;
  nextSeason: RetailSeason;
  nextSeasonLabel: string;
  daysUntilNextSeason: number;
  upcomingProfile: SeasonalProfile;
  profiles: SeasonalProfile[];
  confidence: SeasonalConfidence;
  sourceYears: number[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SEASON_ORDER: RetailSeason[] = ["winter", "spring", "summer", "autumn"];

export const retailSeasonLabel: Record<RetailSeason, string> = {
  winter: "Winter",
  spring: "Lente",
  summer: "Zomer",
  autumn: "Herfst",
};

const getSeason = (month: number): RetailSeason => {
  if (month === 11 || month <= 1) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
};

const seasonBounds = (timestamp: number) => {
  const parts = getZonedDateParts(timestamp);
  const year = parts.year;
  const month = parts.month - 1;
  const season = getSeason(month);
  if (season === "winter") {
    const startsInPreviousYear = month <= 1;
    const startYear = startsInPreviousYear ? year - 1 : year;
    return {
      season,
      seasonYear: startYear + 1,
      start: zonedDateTimeToTimestamp(startYear, 12, 1),
      end: zonedDateTimeToTimestamp(startYear + 1, 3, 1),
    };
  }
  if (season === "spring")
    return {
      season,
      seasonYear: year,
      start: zonedDateTimeToTimestamp(year, 3, 1),
      end: zonedDateTimeToTimestamp(year, 6, 1),
    };
  if (season === "summer")
    return {
      season,
      seasonYear: year,
      start: zonedDateTimeToTimestamp(year, 6, 1),
      end: zonedDateTimeToTimestamp(year, 9, 1),
    };
  return {
    season,
    seasonYear: year,
    start: zonedDateTimeToTimestamp(year, 9, 1),
    end: zonedDateTimeToTimestamp(year, 12, 1),
  };
};

interface SeasonOccurrence {
  season: RetailSeason;
  seasonYear: number;
  start: number;
  end: number;
  revenueCents: number;
  grossProfitCents: number;
  units: number;
  transactionCount: number;
  categories: Map<string, { revenueCents: number; units: number }>;
  dailyRevenueCents: Map<number, number>;
}

export const buildSeasonalRetailSnapshot = (
  transactions: Transaction[],
  now = Date.now(),
): SeasonalRetailSnapshot => {
  const finalized = transactions.filter(
    (transaction) => transaction.isFinalized,
  );
  const occurrences = new Map<string, SeasonOccurrence>();

  for (const transaction of finalized) {
    const bounds = seasonBounds(transaction.timestamp);
    const key = `${bounds.season}-${bounds.seasonYear}`;
    const occurrence = occurrences.get(key) ?? {
      ...bounds,
      revenueCents: 0,
      grossProfitCents: 0,
      units: 0,
      transactionCount: 0,
      categories: new Map<string, { revenueCents: number; units: number }>(),
      dailyRevenueCents: new Map<number, number>(),
    };
    const grossLines = transaction.items.map(
      (item) =>
        (item.product.priceCents +
          (item.modifiers ?? []).reduce(
            (sum, modifier) => sum + modifier.deltaCents,
            0,
          )) *
        item.quantity,
    );
    const allocatedRevenue = allocateCents(transaction.totalCents, grossLines);
    const revenueCents = allocatedRevenue.reduce(
      (sum, revenue, index) =>
        sum +
        (isGiftCardProduct(transaction.items[index].product) ? 0 : revenue),
      0,
    );
    occurrence.revenueCents += revenueCents;
    occurrence.grossProfitCents +=
      revenueCents - transactionCostCents(transaction);
    occurrence.transactionCount += 1;
    const dayIndex = Math.max(
      0,
      calendarDayDifference(transaction.timestamp, bounds.start),
    );
    occurrence.dailyRevenueCents.set(
      dayIndex,
      (occurrence.dailyRevenueCents.get(dayIndex) ?? 0) + revenueCents,
    );
    for (const [index, item] of transaction.items.entries()) {
      if (isGiftCardProduct(item.product)) continue;
      occurrence.units += item.quantity;
      const category = productRootCategoryLabel(item.product) || "Overig";
      const categoryRow = occurrence.categories.get(category) ?? {
        revenueCents: 0,
        units: 0,
      };
      categoryRow.revenueCents += allocatedRevenue[index] ?? 0;
      categoryRow.units += item.quantity;
      occurrence.categories.set(category, categoryRow);
    }
    occurrences.set(key, occurrence);
  }

  const currentBounds = seasonBounds(now);
  const currentOccurrence = occurrences.get(
    `${currentBounds.season}-${currentBounds.seasonYear}`,
  );
  const completed = [...occurrences.values()].filter(
    (occurrence) => occurrence.end <= now,
  );

  const profiles = SEASON_ORDER.map((season): SeasonalProfile => {
    const rows = completed.filter((occurrence) => occurrence.season === season);
    const count = rows.length;
    const revenueCents = rows.reduce((sum, row) => sum + row.revenueCents, 0);
    const categoryTotals = new Map<
      string,
      { revenueCents: number; units: number }
    >();
    for (const row of rows) {
      row.categories.forEach((value, category) => {
        const total = categoryTotals.get(category) ?? {
          revenueCents: 0,
          units: 0,
        };
        total.revenueCents += value.revenueCents;
        total.units += value.units;
        categoryTotals.set(category, total);
      });
    }
    const categories = [...categoryTotals.entries()]
      .map(([category, value]) => ({
        category,
        revenueCents: count > 0 ? Math.round(value.revenueCents / count) : 0,
        units: count > 0 ? Math.round(value.units / count) : 0,
        share: revenueCents > 0 ? value.revenueCents / revenueCents : 0,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents);
    return {
      season,
      label: retailSeasonLabel[season],
      averageRevenueCents: count > 0 ? Math.round(revenueCents / count) : 0,
      averageGrossProfitCents:
        count > 0
          ? Math.round(
              rows.reduce((sum, row) => sum + row.grossProfitCents, 0) / count,
            )
          : 0,
      averageUnits:
        count > 0
          ? Math.round(rows.reduce((sum, row) => sum + row.units, 0) / count)
          : 0,
      transactionCount: rows.reduce(
        (sum, row) => sum + row.transactionCount,
        0,
      ),
      completedOccurrences: count,
      categories,
    };
  });

  const nextSeason =
    SEASON_ORDER[
      (SEASON_ORDER.indexOf(currentBounds.season) + 1) % SEASON_ORDER.length
    ];
  const nextStart = currentBounds.end;
  const upcomingProfile = profiles.find(
    (profile) => profile.season === nextSeason,
  )!;
  const elapsedDayIndex = Math.max(
    0,
    calendarDayDifference(now, currentBounds.start),
  );
  const comparableRows = completed.filter(
    (occurrence) => occurrence.season === currentBounds.season,
  );
  const historicalElapsedTotals = comparableRows.map((occurrence) =>
    [...occurrence.dailyRevenueCents.entries()]
      .filter(([day]) => day <= elapsedDayIndex)
      .reduce((sum, [, revenue]) => sum + revenue, 0),
  );
  const historicalElapsedAverage =
    historicalElapsedTotals.length > 0
      ? historicalElapsedTotals.reduce((sum, revenue) => sum + revenue, 0) /
        historicalElapsedTotals.length
      : 0;
  const currentPaceChange =
    historicalElapsedAverage > 0
      ? (((currentOccurrence?.revenueCents ?? 0) - historicalElapsedAverage) /
          historicalElapsedAverage) *
        100
      : null;
  const upcomingOccurrences = completed.filter(
    (occurrence) => occurrence.season === nextSeason,
  );
  const sourceYears = [
    ...new Set(upcomingOccurrences.map((occurrence) => occurrence.seasonYear)),
  ].sort();
  const completedTransactionCount = upcomingOccurrences.reduce(
    (sum, occurrence) => sum + occurrence.transactionCount,
    0,
  );
  const confidence: SeasonalConfidence =
    sourceYears.length >= 2 && completedTransactionCount >= 60
      ? "high"
      : sourceYears.length >= 1 && completedTransactionCount >= 15
        ? "medium"
        : "low";

  return {
    currentSeason: currentBounds.season,
    currentSeasonLabel: retailSeasonLabel[currentBounds.season],
    currentRevenueCents: currentOccurrence?.revenueCents ?? 0,
    currentUnits: currentOccurrence?.units ?? 0,
    currentPaceChange,
    nextSeason,
    nextSeasonLabel: retailSeasonLabel[nextSeason],
    daysUntilNextSeason: Math.max(0, Math.ceil((nextStart - now) / DAY_MS)),
    upcomingProfile,
    profiles,
    confidence,
    sourceYears,
  };
};
