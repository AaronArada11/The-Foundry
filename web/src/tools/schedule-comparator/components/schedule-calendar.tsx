import FullCalendar, { type EventDisplayInfo, type EventInput } from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import { useMemo } from "react";

import { findOverlayConflicts } from "../analytics";
import { WEEKDAYS, type SectionSchedule } from "../models";

const DATES = ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-06"];

function EventContent({ event, timeText }: EventDisplayInfo) {
  return (
    <div className="schedule-event-content">
      <strong>{event.extendedProps.subject as string}</strong>
      <span>{timeText}</span>
      <small>{event.extendedProps.room as string}</small>
    </div>
  );
}

export function ScheduleCalendar({
  sections,
}: {
  sections: SectionSchedule[];
}) {
  const events = useMemo(() => {
    const conflictIds = new Set<string>();
    if (sections.length === 2) {
      for (const conflict of findOverlayConflicts(sections[0], sections[1])) {
        conflictIds.add(conflict.firstClassId);
        conflictIds.add(conflict.secondClassId);
      }
    }
    return sections.flatMap((section, sectionIndex) => section.classes.flatMap((item) =>
      item.days.flatMap((day) => {
        const dayIndex = WEEKDAYS.indexOf(day);
        if (dayIndex < 0 || !item.start || !item.end) return [];
        const event: EventInput = {
          id: `${section.id}-${item.id}-${day}`,
          title: `${item.subject} ${item.name}`,
          start: `${DATES[dayIndex]}T${item.start}:00`,
          end: `${DATES[dayIndex]}T${item.end}:00`,
          backgroundColor: section.color,
          borderColor: section.color,
          textColor: "#123022",
          classNames: [
            `schedule-event--${sectionIndex + 1}`,
            conflictIds.has(item.id) ? "schedule-event--conflict" : "",
          ].filter(Boolean),
          extendedProps: { subject: item.subject, room: item.room, section: section.name },
        };
        return [event];
      }),
    ));
  }, [sections]);

  const limits = useMemo(() => {
    const times = sections.flatMap((section) => section.classes.flatMap((item) => [item.start, item.end])).filter(Boolean).toSorted();
    const first = times[0] ?? "07:00";
    const last = times.at(-1) ?? "19:00";
    const minHour = Math.max(5, Number(first.slice(0, 2)) - 1);
    const maxHour = Math.min(24, Number(last.slice(0, 2)) + 2);
    return { min: `${String(minHour).padStart(2, "0")}:00:00`, max: `${String(maxHour).padStart(2, "0")}:00:00` };
  }, [sections]);

  return (
    <div className="schedule-calendar" aria-label="Weekly timetable">
      <FullCalendar
        plugins={[timeGridPlugin]}
        initialView="timeGridWeek"
        initialDate="2024-01-01"
        firstDay={1}
        hiddenDays={[0]}
        headerToolbar={false}
        allDaySlot={false}
        weekends
        events={events}
        eventContent={EventContent}
        dayHeaderFormat={{ weekday: "long" }}
        slotMinTime={limits.min}
        slotMaxTime={limits.max}
        slotDuration="00:30:00"
        expandRows
        height="auto"
        nowIndicator={false}
        editable={false}
        selectable={false}
      />
    </div>
  );
}
