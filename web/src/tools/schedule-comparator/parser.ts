import {
  createId,
  fullConfidence,
  type FieldConfidence,
  type OcrResult,
  type OcrWord,
  type ScheduleClass,
  type Weekday,
} from "./models";

const SUBJECT_PATTERN = /\b([A-Z]{2,8}\s*[-]?\s*\d{2,5}[A-Z]?)\b/i;
const TIME_RANGE_PATTERN = /\b(\d{1,2}(?::|\.)\d{2}\s*(?:[AP]M)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::|\.)\d{2}\s*(?:[AP]M)?)\b/i;
const UNIT_PATTERN = /\b(\d(?:\.\d)?)\s*(?:units?|u)\b/i;
const ROOM_PATTERN = /\b(?:ROOM|RM|LAB|GYM|BLDG|BUILDING)\s*[-:]?\s*[A-Z0-9-]+(?:\s+[A-Z0-9-]+){0,2}\b/i;
const INSTRUCTOR_PATTERN = /(?:INSTRUCTOR|PROF(?:ESSOR)?|FACULTY)\s*[:-]\s*([^|]+)$/i;

const DAY_TOKEN_PATTERN = /\b(?:T(?:UE)?\s*\/\s*TH(?:U)?|TUE\s+THU|M(?:ON)?\s*\/\s*W(?:ED)?|MWF|TTH|MON(?:DAY)?|TUE(?:SDAY)?|WED(?:NESDAY)?|THU(?:RSDAY)?|FRI(?:DAY)?|SAT(?:URDAY)?|M|W|TH|T)\b/i;

interface OcrRow {
  words: OcrWord[];
  text: string;
  confidence: number;
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

export function normalizeTime(raw: string): { value: string; confidence: number } | null {
  const cleaned = raw.trim().toUpperCase().replace(".", ":").replace(/\s+/g, "");
  const match = cleaned.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > 24) return null;
  let confidence = 100;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    if (match[3] === "AM") hour = hour === 12 ? 0 : hour;
    if (match[3] === "PM") hour = hour === 12 ? 12 : hour + 12;
  } else if (hour === 24 && minute === 0) {
    hour = 0;
    confidence = 85;
  }
  return { value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, confidence };
}

export function normalizeDays(raw: string): { days: Weekday[]; confidence: number } {
  const cleaned = raw
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const days: Weekday[] = [];
  const add = (day: Weekday) => {
    if (!days.includes(day)) days.push(day);
  };
  const words = cleaned.split(" ");
  for (const word of words) {
    if (["MON", "MONDAY", "M"].includes(word)) add("Mon");
    else if (["TUE", "TUES", "TUESDAY", "TU", "T"].includes(word)) add("Tue");
    else if (["WED", "WEDNESDAY", "W"].includes(word)) add("Wed");
    else if (["THU", "THUR", "THURS", "THURSDAY", "TH"].includes(word)) add("Thu");
    else if (["FRI", "FRIDAY", "F"].includes(word)) add("Fri");
    else if (["SAT", "SATURDAY", "S"].includes(word)) add("Sat");
    else if (word === "MWF") {
      add("Mon"); add("Wed"); add("Fri");
    } else if (word === "TTH") {
      add("Tue"); add("Thu");
    } else if (word === "MW") {
      add("Mon"); add("Wed");
    }
  }
  return { days, confidence: days.length ? (cleaned.length <= 2 ? 85 : 100) : 0 };
}

function buildRows(words: OcrWord[]): OcrRow[] {
  const sorted = words.toSorted((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const rows: OcrWord[][] = [];
  for (const word of sorted) {
    const height = Math.max(1, word.bbox.y1 - word.bbox.y0);
    const center = (word.bbox.y0 + word.bbox.y1) / 2;
    const existing = rows.find((row) => {
      const sample = row[0];
      const sampleCenter = (sample.bbox.y0 + sample.bbox.y1) / 2;
      return Math.abs(sampleCenter - center) <= Math.max(height, sample.bbox.y1 - sample.bbox.y0) * 0.65;
    });
    (existing ?? rows[rows.push([]) - 1]).push(word);
  }
  return rows.map((row) => {
    const ordered = row.toSorted((a, b) => a.bbox.x0 - b.bbox.x0);
    return {
      words: ordered,
      text: ordered.map((word) => word.text).join(" ").replace(/\s+/g, " ").trim(),
      confidence: ordered.reduce((sum, word) => sum + word.confidence, 0) / Math.max(1, ordered.length),
      bounds: {
        x0: Math.min(...ordered.map((word) => word.bbox.x0)),
        y0: Math.min(...ordered.map((word) => word.bbox.y0)),
        x1: Math.max(...ordered.map((word) => word.bbox.x1)),
        y1: Math.max(...ordered.map((word) => word.bbox.y1)),
      },
    };
  }).filter((row) => row.text);
}

function cleanTitle(text: string): string {
  return text
    .replace(SUBJECT_PATTERN, " ")
    .replace(TIME_RANGE_PATTERN, " ")
    .replace(UNIT_PATTERN, " ")
    .replace(ROOM_PATTERN, " ")
    .replace(INSTRUCTOR_PATTERN, " ")
    .replace(DAY_TOKEN_PATTERN, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-:]+|[-:]+$/g, "")
    .trim();
}

function parseRow(row: OcrRow, sourceImageId: string): ScheduleClass | null {
  const subjectMatch = row.text.match(SUBJECT_PATTERN);
  const timeMatch = row.text.match(TIME_RANGE_PATTERN);
  const dayMatch = row.text.match(DAY_TOKEN_PATTERN);
  if (!timeMatch || (!subjectMatch && !dayMatch)) return null;
  const start = normalizeTime(timeMatch[1]);
  const end = normalizeTime(timeMatch[2]);
  const parsedDays = normalizeDays(dayMatch?.[0] ?? "");
  const roomMatch = row.text.match(ROOM_PATTERN);
  const instructorMatch = row.text.match(INSTRUCTOR_PATTERN);
  const unitsMatch = row.text.match(UNIT_PATTERN);
  const base = Math.round(row.confidence);
  const subject = subjectMatch?.[1].replace(/\s+/g, "").replace(/-/, "-").toUpperCase() ?? "";
  const name = cleanTitle(row.text);
  const confidence: FieldConfidence = {
    ...fullConfidence(base),
    subject: subject ? base : 45,
    name: name ? Math.min(base, name.length < 3 ? 60 : 100) : 35,
    days: Math.min(base, parsedDays.confidence),
    start: start ? Math.min(base, start.confidence) : 0,
    end: end ? Math.min(base, end.confidence) : 0,
    room: roomMatch ? base : 100,
    instructor: instructorMatch ? base : 100,
    units: unitsMatch ? base : 100,
    overall: 0,
  };
  confidence.overall = Math.min(confidence.subject, confidence.name, confidence.days, confidence.start, confidence.end);
  return {
    id: createId("class"),
    subject,
    name,
    days: parsedDays.days,
    start: start?.value ?? "",
    end: end?.value ?? "",
    room: roomMatch?.[0].replace(UNIT_PATTERN, "").replace(/^(?:ROOM|RM)\s*[-:]?\s*/i, "").trim() ?? "",
    instructor: instructorMatch?.[1]?.trim() ?? "",
    units: unitsMatch ? Number(unitsMatch[1]) : null,
    confidence,
    sourceImageId,
    sourceBounds: row.bounds,
    rawText: row.text,
  };
}

export function parseOcrResult(result: OcrResult, sourceImageId: string): ScheduleClass[] {
  const rows = buildRows(result.words);
  const parsed = rows.flatMap((row) => {
    const item = parseRow(row, sourceImageId);
    return item ? [item] : [];
  });
  if (parsed.length) return parsed;

  return result.text.split(/\n+/).flatMap((text, index) => {
    const row: OcrRow = {
      words: [],
      text: text.trim(),
      confidence: result.confidence,
      bounds: { x0: 0, y0: index * 24, x1: 0, y1: index * 24 + 20 },
    };
    const item = parseRow(row, sourceImageId);
    return item ? [item] : [];
  });
}

export function inferSectionName(text: string, filename: string, index: number): string {
  const candidates = [
    /\b(?:SECTION|BLOCK)\s*[:-]?\s*([A-Z]{1,6}\d{0,3}[A-Z]?)\b/i,
    /\b((?:BS)?(?:CS|IT|IS|ENG|BA|HM)\s*\d{1,2}[A-Z])\b/i,
  ];
  for (const pattern of candidates) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, "").toUpperCase();
  }
  const stem = filename.replace(/\.[^.]+$/, "");
  const fileMatch = stem.match(/(?:section|block|schedule)[-_\s]*([a-z0-9-]+)/i);
  return fileMatch?.[1]?.toUpperCase() ?? `SECTION ${index + 1}`;
}
