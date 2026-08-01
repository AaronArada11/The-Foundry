import { DownloadSimple, X } from "@phosphor-icons/react";
import type { CSSProperties } from "react";

export type JobStatus =
  | "queued"
  | "downloading"
  | "processing"
  | "ready"
  | "failed"
  | "expired"
  | "cancelled";

export interface JobSummary {
  status: JobStatus;
  progress: number;
  downloadUrl: string | null;
}

const terminalStatuses: JobStatus[] = [
  "ready",
  "failed",
  "expired",
  "cancelled",
];

export function JobProgressPanel<T extends JobSummary>({
  job,
  stages,
  waitingTitle,
  waitingMeta,
  title,
  meta,
  downloadLabel,
  progressLabel,
  accent = "coral",
  onCancel,
}: {
  job: T | null;
  stages: { status: JobStatus; label: string }[];
  waitingTitle: string;
  waitingMeta: string;
  title: (job: T) => string;
  meta: (job: T) => string;
  downloadLabel: (job: T) => string;
  progressLabel: string;
  accent?: "coral" | "forest" | "gold";
  onCancel: () => void;
}) {
  const currentIndex = job
    ? stages.findIndex((stage) => stage.status === job.status)
    : -1;
  const active = job ? !terminalStatuses.includes(job.status) : false;

  return (
    <div className={`job-panel job-panel--${accent}`} aria-live="polite">
      <p className="job-label">{job ? `Job / ${job.status}` : "Job / Waiting"}</p>
      <h2>{job ? title(job) : waitingTitle}</h2>
      <p className="job-meta">{job ? meta(job) : waitingMeta}</p>
      <p className={`job-status job-status--${job?.status || "waiting"}`}>
        {job?.status || "waiting"}
      </p>
      <strong className="progress-number">{Math.round(job?.progress || 0)}%</strong>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(job?.progress || 0)}
      >
        <span style={{ transform: `scaleX(${(job?.progress || 0) / 100})` }} />
      </div>
      <ol
        className="job-stages"
        style={{ "--job-stage-count": stages.length } as CSSProperties}
      >
        {stages.map((stage, index) => {
          const isCurrent = job?.status === stage.status;
          const isComplete = currentIndex > index || job?.status === "ready";
          return (
            <li
              key={stage.status}
              className={`${isCurrent ? "is-current" : ""} ${isComplete ? "is-complete" : ""}`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {stage.label}
            </li>
          );
        })}
      </ol>
      {job?.status === "ready" && job.downloadUrl ? (
        <a className="button button--primary button--wide" href={job.downloadUrl}>
          <DownloadSimple size={22} aria-hidden="true" />
          {downloadLabel(job)}
        </a>
      ) : (
        <button
          className="button button--danger button--wide"
          type="button"
          onClick={onCancel}
          disabled={!active}
        >
          <X size={22} aria-hidden="true" />
          Cancel job
        </button>
      )}
    </div>
  );
}
