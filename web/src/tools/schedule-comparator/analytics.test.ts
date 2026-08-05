import { calculateMetrics, findConflicts, findOverlayConflicts, scoreSections } from "./analytics";
import { DEFAULT_PREFERENCES, fullConfidence, type ScheduleClass, type SectionSchedule } from "./models";

function classItem(id: string, days: ScheduleClass["days"], start: string, end: string, units = 3): ScheduleClass {
  return {
    id,
    subject: id.toUpperCase(),
    name: `Course ${id}`,
    days,
    start,
    end,
    room: "LAB 1",
    instructor: "",
    units,
    confidence: fullConfidence(),
    sourceImageId: "image",
  };
}

function section(id: string, classes: ScheduleClass[]): SectionSchedule {
  return { id, name: id.toUpperCase(), color: "#3BCB75", screenshotId: "image", classes };
}

describe("schedule analytics", () => {
  it("calculates campus time, merged gaps, units, and continuous classes", () => {
    const metrics = calculateMetrics(section("a", [
      classItem("cs101", ["Mon", "Wed"], "08:00", "09:00"),
      classItem("ma101", ["Mon"], "09:00", "10:00"),
      classItem("ph101", ["Mon"], "11:00", "12:30", 2),
    ]));

    expect(metrics.classMinutes).toBe(270);
    expect(metrics.campusMinutes).toBe(330);
    expect(metrics.freeMinutes).toBe(60);
    expect(metrics.gapCount).toBe(1);
    expect(metrics.longestContinuousMinutes).toBe(120);
    expect(metrics.totalUnits).toBe(8);
    expect(metrics.schoolDays).toBe(2);
  });

  it("detects positive overlaps but permits back-to-back classes", () => {
    const first = section("a", [
      classItem("a1", ["Tue"], "08:00", "09:00"),
      classItem("a2", ["Tue"], "09:00", "10:00"),
      classItem("a3", ["Tue"], "09:30", "10:30"),
    ]);
    const second = section("b", [classItem("b1", ["Tue"], "08:30", "09:15")]);

    expect(findConflicts(first)).toHaveLength(1);
    expect(findOverlayConflicts(first, second)).toHaveLength(2);
  });

  it("applies hard filters and conflict penalties deterministically", () => {
    const weekday = section("weekday", [classItem("w1", ["Mon"], "09:00", "10:00")]);
    const saturday = section("saturday", [
      classItem("s1", ["Sat"], "09:00", "11:00"),
      classItem("s2", ["Sat"], "10:00", "12:00"),
    ]);
    const scores = scoreSections(
      [calculateMetrics(weekday), calculateMetrics(saturday)],
      { ...DEFAULT_PREFERENCES, noSaturday: true },
    );

    expect(scores[0]).toMatchObject({ sectionId: "weekday", eligible: true });
    expect(scores[1].eligible).toBe(false);
    expect(scores[1].conflictPenalty).toBe(20);
    expect(scores[1].failedFilters).toContain("Has Saturday classes");
  });
});
