export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type WorkflowStep = "upload" | "review" | "compare" | "export";
export type OcrStatus = "queued" | "processing" | "ready" | "error";
export type PresetName =
  | "balanced"
  | "commuter"
  | "earliest-finish"
  | "latest-start"
  | "compact";

export interface SourceBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FieldConfidence {
  subject: number;
  name: number;
  days: number;
  start: number;
  end: number;
  room: number;
  instructor: number;
  units: number;
  overall: number;
}

export interface ScheduleClass {
  id: string;
  subject: string;
  name: string;
  days: Weekday[];
  start: string;
  end: string;
  room: string;
  instructor: string;
  units: number | null;
  confidence: FieldConfidence;
  sourceImageId: string;
  sourceBounds?: SourceBounds;
  rawText?: string;
}

export interface SourceScreenshot {
  id: string;
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
  previewUrl: string;
  status: OcrStatus;
  progress: number;
  error: string | null;
  averageConfidence: number | null;
}

export interface SectionSchedule {
  id: string;
  name: string;
  color: string;
  screenshotId: string;
  classes: ScheduleClass[];
}

export interface ScheduleProject {
  version: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  screenshots: SourceScreenshot[];
  sections: SectionSchedule[];
  preferences: PreferenceProfile;
}

export interface ScheduleConflict {
  sectionId: string;
  day: Weekday;
  firstClassId: string;
  secondClassId: string;
  overlapMinutes: number;
  crossSection: boolean;
}

export interface ScheduleMetrics {
  sectionId: string;
  earliestStart: number | null;
  latestEnd: number | null;
  schoolDays: number;
  classMinutes: number;
  campusMinutes: number;
  freeMinutes: number;
  longestGapMinutes: number;
  gapCount: number;
  longestContinuousMinutes: number;
  beforeEightCount: number;
  afterSixCount: number;
  fridayMinutes: number;
  saturdayMinutes: number;
  totalUnits: number | null;
  averageStart: number | null;
  averageDismissal: number | null;
  longestDayMinutes: number;
  shortestDayMinutes: number;
  daysWithoutClasses: Weekday[];
  peakDailyClassMinutes: number;
  balanceVariance: number;
  conflictCount: number;
  daily: Record<Weekday, DailyMetrics>;
}

export interface DailyMetrics {
  classMinutes: number;
  campusMinutes: number;
  freeMinutes: number;
  start: number | null;
  end: number | null;
  gapCount: number;
  longestGapMinutes: number;
  longestContinuousMinutes: number;
}

export interface ScoreWeights {
  start: number;
  dismissal: number;
  campus: number;
  idle: number;
  days: number;
  weekend: number;
}

export interface PreferenceProfile {
  preset: PresetName;
  weights: ScoreWeights;
  noSaturday: boolean;
  noClassesBefore: string;
  noClassesAfter: string;
  idleDirection: "minimum" | "maximum";
}

export interface ScoreBreakdown {
  sectionId: string;
  eligible: boolean;
  score: number;
  failedFilters: string[];
  conflictPenalty: number;
  components: Record<keyof ScoreWeights, number>;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: SourceBounds;
}

export interface OcrResult {
  text: string;
  confidence: number;
  words: OcrWord[];
}

export const SECTION_COLORS = ["#3BCB75", "#2784C7", "#FF6948", "#C79600", "#8B5CF6", "#D9468B", "#0F8B8D", "#6B7280"];

export const PRESET_WEIGHTS: Record<PresetName, ScoreWeights> = {
  balanced: { start: 15, dismissal: 20, campus: 20, idle: 20, days: 10, weekend: 15 },
  commuter: { start: 5, dismissal: 10, campus: 25, idle: 25, days: 25, weekend: 10 },
  "earliest-finish": { start: 5, dismissal: 50, campus: 15, idle: 10, days: 5, weekend: 15 },
  "latest-start": { start: 50, dismissal: 10, campus: 15, idle: 10, days: 5, weekend: 10 },
  compact: { start: 10, dismissal: 10, campus: 30, idle: 30, days: 15, weekend: 5 },
};

export const DEFAULT_PREFERENCES: PreferenceProfile = {
  preset: "balanced",
  weights: { ...PRESET_WEIGHTS.balanced },
  noSaturday: false,
  noClassesBefore: "",
  noClassesAfter: "",
  idleDirection: "minimum",
};

export function createId(prefix: string): string {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

export function fullConfidence(value = 100): FieldConfidence {
  return {
    subject: value,
    name: value,
    days: value,
    start: value,
    end: value,
    room: value,
    instructor: value,
    units: value,
    overall: value,
  };
}

export function createEmptyClass(sourceImageId: string): ScheduleClass {
  return {
    id: createId("class"),
    subject: "",
    name: "",
    days: [],
    start: "",
    end: "",
    room: "",
    instructor: "",
    units: null,
    confidence: fullConfidence(100),
    sourceImageId,
  };
}

export function createProject(): ScheduleProject {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: createId("project"),
    title: "Schedule comparison",
    createdAt: now,
    updatedAt: now,
    screenshots: [],
    sections: [],
    preferences: { ...DEFAULT_PREFERENCES, weights: { ...DEFAULT_PREFERENCES.weights } },
  };
}
