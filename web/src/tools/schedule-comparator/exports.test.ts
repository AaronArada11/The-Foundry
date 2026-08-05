import { buildIcs } from "./exports";
import { fullConfidence, type SectionSchedule } from "./models";

describe("calendar export", () => {
  it("builds weekly timezone-aware recurring events", () => {
    const section: SectionSchedule = {
      id: "cs3a",
      name: "CS3A",
      color: "#3BCB75",
      screenshotId: "image",
      classes: [{
        id: "mobile-programming",
        subject: "CS101",
        name: "Mobile Programming",
        days: ["Mon", "Wed"],
        start: "08:00",
        end: "09:30",
        room: "LAB203",
        instructor: "Prof. Santos",
        units: 3,
        confidence: fullConfidence(),
        sourceImageId: "image",
      }],
    };

    const result = buildIcs(section, "2026-08-10", "2026-12-12", "Asia/Manila");
    expect(result).toContain("DTSTART;TZID=Asia/Manila:20260810T080000");
    expect(result).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261212T235959Z");
    expect(result).toContain("SUMMARY:CS101 Mobile Programming");
    expect(result.endsWith("\r\n")).toBe(true);
  });
});
