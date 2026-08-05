import {
  PRESET_WEIGHTS,
  WEEKDAYS,
  type DailyMetrics,
  type PreferenceProfile,
  type ScheduleClass,
  type ScheduleConflict,
  type ScheduleMetrics,
  type ScoreBreakdown,
  type ScoreWeights,
  type SectionSchedule,
  type Weekday,
} from "./models";

interface Interval {
  start: number;
  end: number;
  classId: string;
}

export function timeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? hour * 60 + minute : null;
}

export function minutesToTime(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const normalized = Math.max(0, Math.round(value));
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function intervalsForDay(classes: ScheduleClass[], day: Weekday): Interval[] {
  return classes.flatMap((item) => {
    if (!item.days.includes(day)) return [];
    const start = timeToMinutes(item.start);
    const end = timeToMinutes(item.end);
    return start !== null && end !== null && end > start
      ? [{ start, end, classId: item.id }]
      : [];
  }).toSorted((a, b) => a.start - b.start || a.end - b.end);
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const merged: Interval[] = [];
  for (const interval of intervals) {
    const current = merged.at(-1);
    if (current && interval.start <= current.end) {
      current.end = Math.max(current.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function calculateDaily(intervals: Interval[]): DailyMetrics {
  if (!intervals.length) {
    return {
      classMinutes: 0,
      campusMinutes: 0,
      freeMinutes: 0,
      start: null,
      end: null,
      gapCount: 0,
      longestGapMinutes: 0,
      longestContinuousMinutes: 0,
    };
  }
  const merged = mergeIntervals(intervals);
  const start = merged[0].start;
  const end = merged.at(-1)?.end ?? start;
  let gapCount = 0;
  let longestGapMinutes = 0;
  for (let index = 1; index < merged.length; index += 1) {
    const gap = merged[index].start - merged[index - 1].end;
    if (gap > 0) {
      gapCount += 1;
      longestGapMinutes = Math.max(longestGapMinutes, gap);
    }
  }
  const occupiedMinutes = merged.reduce((sum, item) => sum + item.end - item.start, 0);
  return {
    classMinutes: intervals.reduce((sum, item) => sum + item.end - item.start, 0),
    campusMinutes: end - start,
    freeMinutes: end - start - occupiedMinutes,
    start,
    end,
    gapCount,
    longestGapMinutes,
    longestContinuousMinutes: merged.reduce((longest, item) => Math.max(longest, item.end - item.start), 0),
  };
}

export function findConflicts(section: SectionSchedule): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  for (const day of WEEKDAYS) {
    const intervals = intervalsForDay(section.classes, day);
    for (let left = 0; left < intervals.length; left += 1) {
      for (let right = left + 1; right < intervals.length; right += 1) {
        if (intervals[right].start >= intervals[left].end) break;
        const overlap = Math.min(intervals[left].end, intervals[right].end) - intervals[right].start;
        if (overlap > 0) {
          conflicts.push({
            sectionId: section.id,
            day,
            firstClassId: intervals[left].classId,
            secondClassId: intervals[right].classId,
            overlapMinutes: overlap,
            crossSection: false,
          });
        }
      }
    }
  }
  return conflicts;
}

export function findOverlayConflicts(first: SectionSchedule, second: SectionSchedule): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  for (const day of WEEKDAYS) {
    for (const left of intervalsForDay(first.classes, day)) {
      for (const right of intervalsForDay(second.classes, day)) {
        const overlap = Math.min(left.end, right.end) - Math.max(left.start, right.start);
        if (overlap > 0) {
          conflicts.push({
            sectionId: `${first.id}:${second.id}`,
            day,
            firstClassId: left.classId,
            secondClassId: right.classId,
            overlapMinutes: overlap,
            crossSection: true,
          });
        }
      }
    }
  }
  return conflicts;
}

export function calculateMetrics(section: SectionSchedule): ScheduleMetrics {
  const daily = Object.fromEntries(
    WEEKDAYS.map((day) => [day, calculateDaily(intervalsForDay(section.classes, day))]),
  ) as Record<Weekday, DailyMetrics>;
  const attended = WEEKDAYS.filter((day) => daily[day].start !== null);
  const starts = attended.map((day) => daily[day].start as number);
  const ends = attended.map((day) => daily[day].end as number);
  const loads = attended.map((day) => daily[day].classMinutes);
  const meanLoad = loads.length ? loads.reduce((sum, value) => sum + value, 0) / loads.length : 0;
  const variance = loads.length
    ? loads.reduce((sum, value) => sum + (value - meanLoad) ** 2, 0) / loads.length
    : 0;
  const units = new Map<string, number>();
  for (const item of section.classes) {
    if (item.units !== null && item.subject && !units.has(item.subject.toUpperCase())) {
      units.set(item.subject.toUpperCase(), item.units);
    }
  }
  const dailyValues = Object.values(daily);
  return {
    sectionId: section.id,
    earliestStart: starts.length ? Math.min(...starts) : null,
    latestEnd: ends.length ? Math.max(...ends) : null,
    schoolDays: attended.length,
    classMinutes: dailyValues.reduce((sum, value) => sum + value.classMinutes, 0),
    campusMinutes: dailyValues.reduce((sum, value) => sum + value.campusMinutes, 0),
    freeMinutes: dailyValues.reduce((sum, value) => sum + value.freeMinutes, 0),
    longestGapMinutes: dailyValues.reduce((max, value) => Math.max(max, value.longestGapMinutes), 0),
    gapCount: dailyValues.reduce((sum, value) => sum + value.gapCount, 0),
    longestContinuousMinutes: dailyValues.reduce((max, value) => Math.max(max, value.longestContinuousMinutes), 0),
    beforeEightCount: section.classes.reduce(
      (count, item) => count + item.days.length * Number((timeToMinutes(item.start) ?? 480) < 480),
      0,
    ),
    afterSixCount: section.classes.reduce(
      (count, item) => count + item.days.length * Number((timeToMinutes(item.end) ?? 0) > 1080),
      0,
    ),
    fridayMinutes: daily.Fri.classMinutes,
    saturdayMinutes: daily.Sat.classMinutes,
    totalUnits: units.size ? [...units.values()].reduce((sum, value) => sum + value, 0) : null,
    averageStart: starts.length ? starts.reduce((sum, value) => sum + value, 0) / starts.length : null,
    averageDismissal: ends.length ? ends.reduce((sum, value) => sum + value, 0) / ends.length : null,
    longestDayMinutes: dailyValues.reduce((max, value) => Math.max(max, value.campusMinutes), 0),
    shortestDayMinutes: attended.length ? Math.min(...attended.map((day) => daily[day].campusMinutes)) : 0,
    daysWithoutClasses: WEEKDAYS.filter((day) => daily[day].start === null),
    peakDailyClassMinutes: loads.length ? Math.max(...loads) : 0,
    balanceVariance: variance,
    conflictCount: findConflicts(section).length,
    daily,
  };
}

function normalize(values: number[], value: number, higherIsBetter: boolean): number {
  if (!values.length) return 0;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) return 100;
  const ratio = (value - minimum) / (maximum - minimum);
  return Math.round((higherIsBetter ? ratio : 1 - ratio) * 100);
}

function filterFailures(metrics: ScheduleMetrics, preferences: PreferenceProfile): string[] {
  const failures: string[] = [];
  if (preferences.noSaturday && metrics.saturdayMinutes > 0) failures.push("Has Saturday classes");
  const before = timeToMinutes(preferences.noClassesBefore);
  const after = timeToMinutes(preferences.noClassesAfter);
  if (before !== null && metrics.earliestStart !== null && metrics.earliestStart < before) {
    failures.push(`Starts before ${preferences.noClassesBefore}`);
  }
  if (after !== null && metrics.latestEnd !== null && metrics.latestEnd > after) {
    failures.push(`Ends after ${preferences.noClassesAfter}`);
  }
  return failures;
}

export function normalizeWeights(weights: ScoreWeights): ScoreWeights {
  const total = Object.values(weights).reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!total) return { ...PRESET_WEIGHTS.balanced };
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, (Math.max(0, value) / total) * 100]),
  ) as unknown as ScoreWeights;
}

export function scoreSections(
  metrics: ScheduleMetrics[],
  preferences: PreferenceProfile,
): ScoreBreakdown[] {
  const weights = normalizeWeights(preferences.weights);
  const eligible = metrics.filter((item) => !filterFailures(item, preferences).length);
  const population = eligible.length ? eligible : metrics;
  const values = {
    start: population.map((item) => item.averageStart ?? 0),
    dismissal: population.map((item) => item.averageDismissal ?? 1440),
    campus: population.map((item) => item.campusMinutes),
    idle: population.map((item) => item.freeMinutes),
    days: population.map((item) => item.schoolDays),
    weekend: population.map((item) => item.saturdayMinutes + item.fridayMinutes * 0.25),
  };
  return metrics.map((item) => {
    const failedFilters = filterFailures(item, preferences);
    const components: Record<keyof ScoreWeights, number> = {
      start: normalize(values.start, item.averageStart ?? 0, true),
      dismissal: normalize(values.dismissal, item.averageDismissal ?? 1440, false),
      campus: normalize(values.campus, item.campusMinutes, false),
      idle: normalize(values.idle, item.freeMinutes, preferences.idleDirection === "maximum"),
      days: normalize(values.days, item.schoolDays, false),
      weekend: normalize(values.weekend, item.saturdayMinutes + item.fridayMinutes * 0.25, false),
    };
    const weighted = (Object.keys(weights) as (keyof ScoreWeights)[]).reduce(
      (sum, key) => sum + components[key] * (weights[key] / 100),
      0,
    );
    const conflictPenalty = Math.min(40, item.conflictCount * 20);
    return {
      sectionId: item.sectionId,
      eligible: !failedFilters.length,
      score: Math.max(0, Math.round(weighted - conflictPenalty)),
      failedFilters,
      conflictPenalty,
      components,
    };
  }).toSorted((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.sectionId.localeCompare(b.sectionId));
}

export function buildInsights(
  sections: SectionSchedule[],
  metrics: ScheduleMetrics[],
): { label: string; sectionId: string; detail: string }[] {
  if (!metrics.length) return [];
  const sectionName = (id: string) => sections.find((item) => item.id === id)?.name ?? "Section";
  const pick = (compare: (left: ScheduleMetrics, right: ScheduleMetrics) => number) =>
    metrics.toSorted(compare)[0];
  const commuter = pick((a, b) => a.schoolDays - b.schoolDays || a.campusMinutes - b.campusMinutes || a.freeMinutes - b.freeMinutes);
  const idle = pick((a, b) => a.freeMinutes - b.freeMinutes || a.gapCount - b.gapCount);
  const dismissal = pick((a, b) => (a.averageDismissal ?? 1440) - (b.averageDismissal ?? 1440));
  const start = pick((a, b) => (b.averageStart ?? 0) - (a.averageStart ?? 0));
  const compact = pick((a, b) => (a.campusMinutes + a.freeMinutes + a.schoolDays * 60) - (b.campusMinutes + b.freeMinutes + b.schoolDays * 60));
  const stressful = pick((a, b) => (a.peakDailyClassMinutes + a.longestContinuousMinutes + a.saturdayMinutes + a.beforeEightCount * 30 + a.afterSixCount * 30) - (b.peakDailyClassMinutes + b.longestContinuousMinutes + b.saturdayMinutes + b.beforeEightCount * 30 + b.afterSixCount * 30));
  const balanced = pick((a, b) => a.balanceVariance - b.balanceVariance || a.peakDailyClassMinutes - b.peakDailyClassMinutes);
  return [
    { label: "Best for commuters", sectionId: commuter.sectionId, detail: `${sectionName(commuter.sectionId)} has ${commuter.schoolDays} campus days and ${formatDuration(commuter.campusMinutes)} on campus.` },
    { label: "Fewest idle hours", sectionId: idle.sectionId, detail: `${sectionName(idle.sectionId)} has ${formatDuration(idle.freeMinutes)} of weekly idle time.` },
    { label: "Earliest dismissal", sectionId: dismissal.sectionId, detail: `${sectionName(dismissal.sectionId)} dismisses at ${minutesToTime(dismissal.averageDismissal)} on average.` },
    { label: "Latest start time", sectionId: start.sectionId, detail: `${sectionName(start.sectionId)} starts at ${minutesToTime(start.averageStart)} on average.` },
    { label: "Most compact", sectionId: compact.sectionId, detail: `${sectionName(compact.sectionId)} minimizes campus span, gaps, and school days.` },
    { label: "Least stressful", sectionId: stressful.sectionId, detail: `${sectionName(stressful.sectionId)} has the lightest peak load and continuous blocks.` },
    { label: "Most balanced week", sectionId: balanced.sectionId, detail: `${sectionName(balanced.sectionId)} distributes class time most evenly.` },
  ];
}

export function validateClass(item: ScheduleClass): string[] {
  const errors: string[] = [];
  if (!item.subject.trim()) errors.push("Subject is required");
  if (!item.name.trim()) errors.push("Course title is required");
  if (!item.days.length) errors.push("Choose at least one day");
  const start = timeToMinutes(item.start);
  const end = timeToMinutes(item.end);
  if (start === null) errors.push("Start time is invalid");
  if (end === null) errors.push("End time is invalid");
  if (start !== null && end !== null && end <= start) errors.push("End time must be later than start time");
  return errors;
}
