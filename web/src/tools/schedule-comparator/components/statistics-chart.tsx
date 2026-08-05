import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { WEEKDAYS, type ScheduleMetrics, type SectionSchedule } from "../models";

export function StatisticsChart({
  section,
  metrics,
}: {
  section: SectionSchedule;
  metrics: ScheduleMetrics;
}) {
  const data = WEEKDAYS.map((day) => ({
    day,
    "Class hours": Number((metrics.daily[day].classMinutes / 60).toFixed(2)),
    "Campus hours": Number((metrics.daily[day].campusMinutes / 60).toFixed(2)),
  }));
  return (
    <div className="stats-chart" role="img" aria-label={`Daily class and campus hours for ${section.name}`}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgba(58, 58, 56, 0.18)" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: "currentColor", fontSize: 11 }} />
          <YAxis tick={{ fill: "currentColor", fontSize: 11 }} unit="h" />
          <Tooltip cursor={{ fill: "rgba(58, 58, 56, 0.08)" }} />
          <Legend />
          <Bar dataKey="Campus hours" fill="rgba(26, 60, 43, 0.25)" />
          <Bar dataKey="Class hours" fill={section.color} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
