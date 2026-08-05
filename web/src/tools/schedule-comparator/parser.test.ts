import { inferSectionName, normalizeDays, normalizeTime, parseOcrResult } from "./parser";

describe("schedule parser", () => {
  it("normalizes portal day and time variants", () => {
    expect(normalizeDays("M/W").days).toEqual(["Mon", "Wed"]);
    expect(normalizeDays("TTh").days).toEqual(["Tue", "Thu"]);
    expect(normalizeDays("T/Th").days).toEqual(["Tue", "Thu"]);
    expect(normalizeDays("Tue Thu").days).toEqual(["Tue", "Thu"]);
    expect(normalizeDays("MWF").days).toEqual(["Mon", "Wed", "Fri"]);
    expect(normalizeTime("7:30 PM")?.value).toBe("19:30");
    expect(normalizeTime("08.15")?.value).toBe("08:15");
  });

  it("extracts a structured row from OCR text", () => {
    const classes = parseOcrResult({
      text: "CS101 Mobile Programming MWF 08:00-09:30 ROOM LAB203 3 units",
      confidence: 92,
      words: [],
    }, "source-1");

    expect(classes).toHaveLength(1);
    expect(classes[0]).toMatchObject({
      subject: "CS101",
      days: ["Mon", "Wed", "Fri"],
      start: "08:00",
      end: "09:30",
      units: 3,
      sourceImageId: "source-1",
    });
  });

  it("infers section names from headings and filenames", () => {
    expect(inferSectionName("Student schedule — Section CS3A", "capture.png", 0)).toBe("CS3A");
    expect(inferSectionName("Schedule", "block-cs3b.png", 1)).toBe("CS3B");
    expect(inferSectionName("Schedule", "capture.png", 2)).toBe("SECTION 3");
  });
});
