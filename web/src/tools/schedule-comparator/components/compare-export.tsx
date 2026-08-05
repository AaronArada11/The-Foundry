import {
  ArrowLeft,
  CalendarBlank,
  CheckCircle,
  DownloadSimple,
  FileCsv,
  FilePdf,
  Printer,
  SlidersHorizontal,
  Sparkle,
  Trophy,
  Warning,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import {
  buildInsights,
  calculateMetrics,
  findOverlayConflicts,
  formatDuration,
  minutesToTime,
  normalizeWeights,
  scoreSections,
} from "../analytics";
import { exportComparisonPdf, exportCsv, exportIcs } from "../exports";
import {
  PRESET_WEIGHTS,
  type PreferenceProfile,
  type PresetName,
  type ScheduleMetrics,
  type ScoreWeights,
  type SectionSchedule,
} from "../models";
import { ComparisonTable } from "./comparison-table";
import { ScheduleCalendar } from "./schedule-calendar";
import { StatisticsChart } from "./statistics-chart";

const WEIGHT_LABELS: Record<keyof ScoreWeights, string> = {
  start: "Latest start",
  dismissal: "Earliest dismissal",
  campus: "Fewer campus hours",
  idle: "Idle time",
  days: "Fewer school days",
  weekend: "Lighter weekend",
};

function PreferencesPanel({
  preferences,
  onChange,
  onRecommend,
}: {
  preferences: PreferenceProfile;
  onChange: (value: PreferenceProfile) => void;
  onRecommend: () => void;
}) {
  const normalized = normalizeWeights(preferences.weights);
  const setPreset = (preset: PresetName) => onChange({ ...preferences, preset, weights: { ...PRESET_WEIGHTS[preset] } });
  return (
    <div className="preferences-panel">
      <div className="panel-heading"><SlidersHorizontal size={19} /><span>Preferences</span></div>
      <label className="schedule-control">Preset
        <select value={preferences.preset} onChange={(event) => setPreset(event.target.value as PresetName)}>
          <option value="balanced">Balanced</option>
          <option value="commuter">Commuter</option>
          <option value="earliest-finish">Earliest finish</option>
          <option value="latest-start">Latest start</option>
          <option value="compact">Compact</option>
        </select>
      </label>
      <div className="weight-controls">
        {(Object.keys(WEIGHT_LABELS) as (keyof ScoreWeights)[]).map((key) => (
          <label key={key}>
            <span>{WEIGHT_LABELS[key]} <strong>{Math.round(normalized[key])}%</strong></span>
            <input
              type="range"
              min="0"
              max="60"
              value={preferences.weights[key]}
              onChange={(event) => onChange({ ...preferences, preset: "balanced", weights: { ...preferences.weights, [key]: Number(event.target.value) } })}
            />
          </label>
        ))}
      </div>
      <fieldset className="filter-controls">
        <legend>Filters</legend>
        <label><input type="checkbox" checked={preferences.noSaturday} onChange={(event) => onChange({ ...preferences, noSaturday: event.target.checked })} /> No Saturday classes</label>
        <label>No classes before<input type="time" value={preferences.noClassesBefore} onChange={(event) => onChange({ ...preferences, noClassesBefore: event.target.value })} /></label>
        <label>No classes after<input type="time" value={preferences.noClassesAfter} onChange={(event) => onChange({ ...preferences, noClassesAfter: event.target.value })} /></label>
        <label>Free-time objective
          <select value={preferences.idleDirection} onChange={(event) => onChange({ ...preferences, idleDirection: event.target.value as "minimum" | "maximum" })}>
            <option value="minimum">Minimum idle gaps</option>
            <option value="maximum">Maximum free time</option>
          </select>
        </label>
      </fieldset>
      <button className="button button--primary button--wide" type="button" onClick={onRecommend}>
        <Sparkle size={19} /> Recommend best
      </button>
    </div>
  );
}

function StatCards({ metrics }: { metrics: ScheduleMetrics }) {
  const cards = [
    ["Total class hours", formatDuration(metrics.classMinutes)],
    ["Free hours", formatDuration(metrics.freeMinutes)],
    ["Average start", minutesToTime(metrics.averageStart)],
    ["Average dismissal", minutesToTime(metrics.averageDismissal)],
    ["Longest day", formatDuration(metrics.longestDayMinutes)],
    ["Shortest day", formatDuration(metrics.shortestDayMinutes)],
    ["Days without classes", metrics.daysWithoutClasses.join(", ") || "None"],
  ];
  return <div className="stats-cards">{cards.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

export function CompareView({
  sections,
  preferences,
  activeSectionId,
  overlayIds,
  onPreferences,
  onActiveSection,
  onOverlay,
  onBack,
  onExport,
}: {
  sections: SectionSchedule[];
  preferences: PreferenceProfile;
  activeSectionId: string;
  overlayIds: string[];
  onPreferences: (value: PreferenceProfile) => void;
  onActiveSection: (id: string) => void;
  onOverlay: (ids: string[]) => void;
  onBack: () => void;
  onExport: () => void;
}) {
  const [recommendationPulse, setRecommendationPulse] = useState(0);
  const metrics = useMemo(() => sections.map(calculateMetrics), [sections]);
  const scores = useMemo(() => scoreSections(metrics, preferences), [metrics, preferences]);
  const bestScore = scores.find((item) => item.eligible) ?? scores[0];
  const best = sections.find((item) => item.id === bestScore?.sectionId) ?? sections[0];
  const active = sections.find((item) => item.id === activeSectionId) ?? best;
  const activeMetrics = metrics.find((item) => item.sectionId === active.id)!;
  const shownSections = overlayIds.length === 2
    ? overlayIds.map((id) => sections.find((section) => section.id === id)).filter((value): value is SectionSchedule => Boolean(value))
    : [active];
  const overlayConflicts = shownSections.length === 2 ? findOverlayConflicts(shownSections[0], shownSections[1]) : [];
  const insights = buildInsights(sections, metrics);
  const failedAll = scores.every((score) => !score.eligible);

  function toggleOverlay(id: string) {
    if (overlayIds.includes(id)) onOverlay(overlayIds.filter((value) => value !== id));
    else if (overlayIds.length < 2) onOverlay([...overlayIds, id]);
    else onOverlay([overlayIds[1], id]);
  }

  return (
    <section className="schedule-compare-view">
      <aside className="compare-rail">
        <div className="section-switcher">
          <div className="panel-heading"><span>Sections ({sections.length})</span></div>
          {sections.map((section) => {
            const metric = metrics.find((item) => item.sectionId === section.id)!;
            return (
              <button className={section.id === active.id ? "is-active" : ""} key={section.id} type="button" onClick={() => { onActiveSection(section.id); onOverlay([]); }}>
                <span className="section-color" style={{ background: section.color }} />
                <strong>{section.name}</strong>
                {metric.conflictCount ? <Warning size={16} aria-label={`${metric.conflictCount} conflicts`} /> : <span>{section.classes.length}</span>}
              </button>
            );
          })}
        </div>
        <PreferencesPanel preferences={preferences} onChange={onPreferences} onRecommend={() => setRecommendationPulse((value) => value + 1)} />
      </aside>

      <div className="compare-canvas">
        <div className={`recommendation-banner ${recommendationPulse ? "is-refreshed" : ""}`} key={recommendationPulse}>
          <Trophy size={38} aria-hidden="true" />
          <div>
            <h2>{failedAll ? "No section passes every filter" : `${best.name} best matches your preferences`}</h2>
            <p>{failedAll ? "Showing the nearest match. Relax one of the highlighted filters to widen the result." : `Best overall balance across ${bestScore ? Object.keys(bestScore.components).length : 0} weighted schedule factors.`}</p>
          </div>
          <strong className="recommendation-score">{bestScore?.score ?? 0}<span>/100</span><small>Match score</small></strong>
        </div>

        <div className="calendar-toolbar">
          <div><strong>Weekly timetable</strong><span>30 minute grid</span></div>
          <div className="section-tabs" aria-label="Active section">
            {sections.map((section) => <button type="button" key={section.id} className={active.id === section.id && !overlayIds.length ? "is-active" : ""} style={{ "--section-color": section.color } as React.CSSProperties} onClick={() => { onActiveSection(section.id); onOverlay([]); }}>{section.name}</button>)}
          </div>
          <div className="overlay-control">
            <span>Overlay two</span>
            {sections.map((section) => <label key={section.id}><input type="checkbox" checked={overlayIds.includes(section.id)} onChange={() => toggleOverlay(section.id)} /><span style={{ borderColor: section.color }}>{section.name}</span></label>)}
          </div>
        </div>
        {overlayConflicts.length ? <div className="conflict-notice" role="status"><Warning size={18} /> {overlayConflicts.length} overlapping class {overlayConflicts.length === 1 ? "meeting" : "meetings"} in this overlay.</div> : null}
        <ScheduleCalendar sections={shownSections} />

        <div className="comparison-summary-grid">
          <div>
            <h3>Comparison table</h3>
            <ComparisonTable sections={sections} metrics={metrics} scores={scores} />
          </div>
          <div>
            <h3>{active.name} statistics</h3>
            <StatCards metrics={activeMetrics} />
          </div>
        </div>

        <div className="analysis-grid">
          <div>
            <h3>Smart analysis</h3>
            <div className="insight-list">
              {insights.map((insight) => {
                const section = sections.find((item) => item.id === insight.sectionId)!;
                return <article key={insight.label}><span className="section-color" style={{ background: section.color }} /><div><strong>{insight.label} · {section.name}</strong><p>{insight.detail}</p></div></article>;
              })}
            </div>
          </div>
          <div>
            <h3>Daily load · {active.name}</h3>
            <StatisticsChart section={active} metrics={activeMetrics} />
          </div>
        </div>

        <div className="workflow-actions compare-actions">
          <button className="button button--outline" type="button" onClick={onBack}><ArrowLeft size={19} /> Review data</button>
          <button className="button button--primary" type="button" onClick={onExport}>Export comparison <DownloadSimple size={19} /></button>
        </div>
      </div>
    </section>
  );
}

export function ExportView({
  sections,
  preferences,
  activeSectionId,
  onActiveSection,
  onBack,
}: {
  sections: SectionSchedule[];
  preferences: PreferenceProfile;
  activeSectionId: string;
  onActiveSection: (id: string) => void;
  onBack: () => void;
}) {
  const now = new Date();
  const semesterEnd = new Date(now);
  semesterEnd.setMonth(now.getMonth() + 4);
  const [startDate, setStartDate] = useState(now.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(semesterEnd.toISOString().slice(0, 10));
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila");
  const [pdfWorking, setPdfWorking] = useState(false);
  const active = sections.find((section) => section.id === activeSectionId) ?? sections[0];
  const metrics = useMemo(() => sections.map(calculateMetrics), [sections]);
  const scores = useMemo(() => scoreSections(metrics, preferences), [metrics, preferences]);
  const validDates = Boolean(startDate && endDate && endDate >= startDate);

  async function pdf() {
    setPdfWorking(true);
    try { await exportComparisonPdf(sections, metrics, scores); } finally { setPdfWorking(false); }
  }

  return (
    <section className="schedule-export-view">
      <div className="export-heading"><CheckCircle size={38} /><div><h2>Your comparison is ready.</h2><p>Download the full analysis or add one section to your calendar.</p></div></div>
      <div className="export-grid">
        <article><FilePdf size={34} /><div><h3>PDF comparison</h3><p>Recommendation, metrics, scores, and structured class tables.</p></div><button className="button button--primary" type="button" disabled={pdfWorking} onClick={pdf}>{pdfWorking ? "Building PDF…" : "Download PDF"}</button></article>
        <article><FileCsv size={34} /><div><h3>CSV data</h3><p>Every extracted class in a spreadsheet-ready format.</p></div><button className="button button--outline" type="button" onClick={() => exportCsv(sections)}>Download CSV</button></article>
        <article><Printer size={34} /><div><h3>Printable timetable</h3><p>Print the selected section using the optimized landscape layout.</p></div><button className="button button--outline" type="button" onClick={() => window.print()}>Print timetable</button></article>
      </div>
      <div className="calendar-export-panel">
        <div><CalendarBlank size={34} /><h3>Calendar (.ics)</h3><p>Creates weekly events through the selected semester dates.</p></div>
        <div className="calendar-export-fields">
          <label>Section<select value={active.id} onChange={(event) => onActiveSection(event.target.value)}>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
          <label>Semester starts<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label>Semester ends<input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <label>Timezone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label>
        </div>
        <button className="button button--primary" type="button" disabled={!validDates || !timezone} onClick={() => exportIcs(active, startDate, endDate, timezone)}>Download {active.name}.ics</button>
      </div>
      <div className="print-timetable" aria-hidden="true">
        <h1>{active.name} · Weekly timetable</h1>
        <p>Monday–Saturday · generated by Aaron Toolkit</p>
        <ScheduleCalendar sections={[active]} />
      </div>
      <div className="workflow-actions"><button className="button button--outline" type="button" onClick={onBack}><ArrowLeft size={19} /> Back to comparison</button></div>
    </section>
  );
}
