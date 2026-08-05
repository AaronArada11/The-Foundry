import { type ScheduleMetrics, type ScoreBreakdown, type SectionSchedule, type Weekday } from "./models";
import { formatDuration, minutesToTime } from "./analytics";

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function safeFilename(value: string): string {
  return value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "schedule";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportCsv(sections: SectionSchedule[]): void {
  const rows = [["section", "subject", "name", "days", "start", "end", "room", "instructor", "units"]];
  for (const section of sections) {
    for (const item of section.classes) {
      rows.push([section.name, item.subject, item.name, item.days.join(";"), item.start, item.end, item.room, item.instructor, item.units?.toString() ?? ""]);
    }
  }
  downloadBlob(new Blob([rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }), "schedule-comparison.csv");
}

const ICS_DAY: Record<Weekday, string> = { Mon: "MO", Tue: "TU", Wed: "WE", Thu: "TH", Fri: "FR", Sat: "SA" };

function escapeIcs(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n");
}

function compactDate(value: string): string {
  return value.replaceAll("-", "");
}

function firstDayOnOrAfter(startDate: string, days: Weekday[]): string {
  const date = new Date(`${startDate}T12:00:00`);
  const weekdayByJs: Array<Weekday | null> = [null, "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = new Date(date);
    candidate.setDate(date.getDate() + offset);
    const weekday = weekdayByJs[candidate.getDay()];
    if (weekday && days.includes(weekday)) return candidate.toISOString().slice(0, 10);
  }
  return startDate;
}

function foldIcsLine(line: string): string {
  if (line.length <= 73) return line;
  const chunks: string[] = [];
  for (let index = 0; index < line.length; index += 73) chunks.push(`${index ? " " : ""}${line.slice(index, index + 73)}`);
  return chunks.join("\r\n");
}

export function buildIcs(section: SectionSchedule, startDate: string, endDate: string, timezone: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Aaron Toolkit//Schedule Comparator//EN", `X-WR-CALNAME:${escapeIcs(section.name)}`, `X-WR-TIMEZONE:${escapeIcs(timezone)}`];
  for (const item of section.classes) {
    if (!item.days.length || !item.start || !item.end) continue;
    const firstDate = compactDate(firstDayOnOrAfter(startDate, item.days));
    const start = item.start.replace(":", "") + "00";
    const end = item.end.replace(":", "") + "00";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@aaron-toolkit.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${timezone}:${firstDate}T${start}`,
      `DTEND;TZID=${timezone}:${firstDate}T${end}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${item.days.map((day) => ICS_DAY[day]).join(",")};UNTIL=${compactDate(endDate)}T235959Z`,
      `SUMMARY:${escapeIcs(`${item.subject} ${item.name}`.trim())}`,
      `LOCATION:${escapeIcs(item.room)}`,
      `DESCRIPTION:${escapeIcs(item.instructor ? `Instructor: ${item.instructor}` : "")}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function exportIcs(section: SectionSchedule, startDate: string, endDate: string, timezone: string): void {
  downloadBlob(new Blob([buildIcs(section, startDate, endDate, timezone)], { type: "text/calendar;charset=utf-8" }), `${safeFilename(section.name)}.ics`);
}

export async function exportComparisonPdf(
  sections: SectionSchedule[],
  metrics: ScheduleMetrics[],
  scores: ScoreBreakdown[],
): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;
  const document = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  document.setTextColor(26, 60, 43);
  document.setFontSize(22);
  document.text("Schedule comparison", 40, 48);
  document.setFontSize(10);
  document.text(`Generated ${new Date().toLocaleString()}`, 40, 66);
  const best = scores.find((score) => score.eligible) ?? scores[0];
  const bestSection = sections.find((section) => section.id === best?.sectionId);
  if (best && bestSection) {
    document.setFontSize(14);
    document.text(`${bestSection.name} best matches your preferences — ${best.score}/100`, 40, 96);
  }
  const headings = sections.map((section) => section.name);
  const byId = new Map(metrics.map((item) => [item.sectionId, item]));
  const scoreById = new Map(scores.map((item) => [item.sectionId, item]));
  const metricRows: Array<[string, (metric: ScheduleMetrics) => string]> = [
    ["Match score", (metric) => `${scoreById.get(metric.sectionId)?.score ?? 0}/100`],
    ["Earliest class", (metric) => minutesToTime(metric.earliestStart)],
    ["Latest class", (metric) => minutesToTime(metric.latestEnd)],
    ["School days", (metric) => String(metric.schoolDays)],
    ["Class hours", (metric) => formatDuration(metric.classMinutes)],
    ["Campus hours", (metric) => formatDuration(metric.campusMinutes)],
    ["Free hours", (metric) => formatDuration(metric.freeMinutes)],
    ["Longest gap", (metric) => formatDuration(metric.longestGapMinutes)],
    ["Conflicts", (metric) => String(metric.conflictCount)],
  ];
  autoTable(document, {
    startY: 116,
    head: [["Metric", ...headings]],
    body: metricRows.map(([label, formatter]) => [label, ...sections.map((section) => formatter(byId.get(section.id)!))]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, lineColor: [180, 190, 184], textColor: [26, 60, 43] },
    headStyles: { fillColor: [26, 60, 43], textColor: [255, 255, 255] },
  });
  let y = (document as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  for (const section of sections) {
    if (y > 510) {
      document.addPage("a4", "landscape");
      y = 44;
    }
    document.setFontSize(13);
    document.text(section.name, 40, y);
    y += 10;
    autoTable(document, {
      startY: y,
      head: [["Subject", "Course", "Days", "Time", "Room", "Instructor", "Units"]],
      body: section.classes.map((item) => [item.subject, item.name, item.days.join(", "), `${item.start}–${item.end}`, item.room, item.instructor, item.units ?? ""]),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 4, textColor: [26, 60, 43] },
      headStyles: { fillColor: [59, 203, 117], textColor: [26, 60, 43] },
    });
    y = (document as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  }
  document.save("schedule-comparison.pdf");
}
