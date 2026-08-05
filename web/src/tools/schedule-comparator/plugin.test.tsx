import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { toolFixture } from "../../test/fixtures";
import ScheduleComparator from "./plugin";

vi.mock("./ocr", () => ({
  inspectImage: vi.fn().mockResolvedValue({ width: 1200, height: 800 }),
  recognizeSchedule: vi.fn().mockImplementation((file: File) => Promise.resolve({
    text: `Section ${file.name.includes("3a") ? "CS3A" : "CS3B"}\nCS101 Mobile Programming MWF 08:00-09:30 ROOM LAB203 3 units`,
    confidence: 94,
    words: [],
  })),
  terminateOcr: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./storage", () => ({
  loadProject: vi.fn().mockResolvedValue(null),
  loadScreenshot: vi.fn().mockResolvedValue(null),
  saveProject: vi.fn().mockResolvedValue("indexeddb"),
  saveScreenshot: vi.fn().mockResolvedValue("indexeddb"),
  deleteScreenshot: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./components/schedule-calendar", () => ({
  ScheduleCalendar: () => <div aria-label="Weekly timetable">Calendar</div>,
}));

vi.mock("./components/statistics-chart", () => ({
  StatisticsChart: () => <div>Statistics chart</div>,
}));

describe("schedule comparator workflow", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:schedule"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("scrollTo", vi.fn());
  });

  it("moves from multiple screenshots through review to a recommendation", async () => {
    render(<ScheduleComparator manifest={{ ...toolFixture(6), name: "Schedule Comparator", description: "Compare schedules." }} />);
    const input = screen.getByLabelText("Schedule screenshots");
    await userEvent.upload(input, [
      new File(["a"], "block-cs3a.png", { type: "image/png" }),
      new File(["b"], "block-cs3b.png", { type: "image/png" }),
    ]);

    const review = await screen.findByRole("button", { name: /review extracted classes/i });
    expect(review).toBeEnabled();
    await userEvent.click(review);
    expect(await screen.findByLabelText("Section name")).toHaveValue("CS3A");

    const compare = screen.getByRole("button", { name: /compare 2 sections/i });
    expect(compare).toBeEnabled();
    await userEvent.click(compare);
    expect(await screen.findByRole("heading", { name: /best matches your preferences/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Weekly timetable")).toBeInTheDocument();
  });
});
