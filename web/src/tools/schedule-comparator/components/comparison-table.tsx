import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useMemo } from "react";

import { formatDuration, minutesToTime } from "../analytics";
import type { ScheduleMetrics, ScoreBreakdown, SectionSchedule } from "../models";

interface ComparisonRow {
  metric: string;
  values: Record<string, string>;
}

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, ComparisonRow>();

export function ComparisonTable({
  sections,
  metrics,
  scores,
}: {
  sections: SectionSchedule[];
  metrics: ScheduleMetrics[];
  scores: ScoreBreakdown[];
}) {
  const rows = useMemo(() => {
    const metricMap = new Map(metrics.map((item) => [item.sectionId, item]));
    const scoreMap = new Map(scores.map((item) => [item.sectionId, item]));
    const formatters: Array<[string, (item: ScheduleMetrics) => string]> = [
      ["Schedule score", (item) => `${scoreMap.get(item.sectionId)?.score ?? 0}/100`],
      ["Earliest class", (item) => minutesToTime(item.earliestStart)],
      ["Latest class", (item) => minutesToTime(item.latestEnd)],
      ["School days", (item) => String(item.schoolDays)],
      ["Total class hours", (item) => formatDuration(item.classMinutes)],
      ["Campus hours", (item) => formatDuration(item.campusMinutes)],
      ["Free hours", (item) => formatDuration(item.freeMinutes)],
      ["Longest gap", (item) => formatDuration(item.longestGapMinutes)],
      ["Number of gaps", (item) => String(item.gapCount)],
      ["Longest continuous", (item) => formatDuration(item.longestContinuousMinutes)],
      ["Before 8 AM", (item) => String(item.beforeEightCount)],
      ["After 6 PM", (item) => String(item.afterSixCount)],
      ["Friday load", (item) => formatDuration(item.fridayMinutes)],
      ["Saturday load", (item) => formatDuration(item.saturdayMinutes)],
      ["Total units", (item) => item.totalUnits === null ? "—" : String(item.totalUnits)],
    ];
    return formatters.map(([metric, formatter]) => ({
      metric,
      values: Object.fromEntries(sections.map((section) => [section.id, formatter(metricMap.get(section.id)!)])),
    }));
  }, [metrics, scores, sections]);

  const columns = useMemo(() => helper.columns([
    helper.accessor("metric", { header: "Metric" }),
    ...sections.map((section) => helper.display({
      id: section.id,
      header: section.name,
      cell: ({ row }) => row.original.values[section.id],
    })),
  ]), [sections]);
  const table = useTable({ features, data: rows, columns });

  return (
    <div className="comparison-table-scroll">
      <table className="comparison-table">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => <th key={header.id}><table.FlexRender header={header} /></th>)}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getAllCells().map((cell) => <td key={cell.id}><table.FlexRender cell={cell} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
