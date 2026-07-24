import {
  DownloadSimple,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { apiRequest } from "../../api/client";
import { Field, InlineError, InlineNote, TextInput } from "../../components/form-controls";
import { PageTitle } from "../../components/page-title";
import type { ToolPageProps } from "../../types";

type JobStatus =
  | "queued"
  | "downloading"
  | "processing"
  | "ready"
  | "failed"
  | "expired"
  | "cancelled";

interface DownloadJob {
  id: string;
  format: "mp4" | "mp3" | "mov";
  status: JobStatus;
  progress: number;
  title: string | null;
  durationSeconds: number | null;
  filename: string | null;
  downloadUrl: string | null;
  artifactExpiresAt: number | null;
  error: string | null;
  eventsUrl?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          theme: "light";
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}

function Turnstile({
  onToken,
}: {
  onToken: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      onToken("dev-bypass");
      return;
    }
    const scriptId = "turnstile-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    let widgetId: string | null = null;
    const render = () => {
      if (window.turnstile && containerRef.current && !widgetId) {
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          theme: "light",
        });
      }
    };
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render);
      document.head.append(script);
    } else if (window.turnstile) {
      render();
    } else {
      script.addEventListener("load", render);
    }
    return () => {
      script?.removeEventListener("load", render);
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [onToken, siteKey]);

  return siteKey ? <div className="turnstile" ref={containerRef} /> : null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) {
    return "--:--";
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

const stageStatus: JobStatus[] = ["queued", "downloading", "processing", "ready"];

function JobPanel({
  job,
  onCancel,
}: {
  job: DownloadJob | null;
  onCancel: () => void;
}) {
  const currentIndex = job ? stageStatus.indexOf(job.status) : -1;
  const active = job && !["ready", "failed", "expired", "cancelled"].includes(job.status);

  return (
    <div className="job-panel" aria-live="polite">
      <p className="job-label">{job ? `Job / ${job.status}` : "Job / Waiting"}</p>
      <h2>{job?.title || (job ? "Preparing media…" : "No active job")}</h2>
      <p className="job-meta">
        {job ? `${job.format.toUpperCase()} · ${formatDuration(job.durationSeconds)}` : "Submit a permitted video URL to begin."}
      </p>
      <p className={`job-status job-status--${job?.status || "waiting"}`}>
        {job?.status || "waiting"}
      </p>
      <strong className="progress-number">{Math.round(job?.progress || 0)}%</strong>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Download progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(job?.progress || 0)}
      >
        <span style={{ transform: `scaleX(${(job?.progress || 0) / 100})` }} />
      </div>
      <ol className="job-stages">
        {stageStatus.map((stage, index) => {
          const isCurrent = job?.status === stage;
          const isComplete = currentIndex > index || job?.status === "ready";
          return (
            <li
              key={stage}
              className={`${isCurrent ? "is-current" : ""} ${isComplete ? "is-complete" : ""}`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {stage}
            </li>
          );
        })}
      </ol>
      {job?.status === "ready" && job.downloadUrl ? (
        <a className="button button--primary button--wide" href={job.downloadUrl}>
          <DownloadSimple size={22} aria-hidden="true" />
          Download {job.format.toUpperCase()}
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

export default function YouTubeDownloaderTool({ manifest }: ToolPageProps) {
  const [url, setUrl] = useState("");
  const [outputFormat, setOutputFormat] = useState<"mp4" | "mp3" | "mov">("mp4");
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [job, setJob] = useState<DownloadJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventsRef = useRef<EventSource | null>(null);

  useEffect(
    () => () => {
      eventsRef.current?.close();
    },
    [],
  );

  function watchJob(nextJob: DownloadJob) {
    eventsRef.current?.close();
    const source = new EventSource(
      nextJob.eventsUrl || `/api/download-jobs/${nextJob.id}/events`,
    );
    eventsRef.current = source;
    source.onmessage = (event) => {
      const update = JSON.parse(event.data) as DownloadJob;
      setJob(update);
      if (["ready", "failed", "expired", "cancelled"].includes(update.status)) {
        source.close();
        if (update.error) {
          setError(update.error);
        }
      }
    };
    source.onerror = () => {
      source.close();
      setError("Live progress disconnected. Refresh the page to check the job.");
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await apiRequest<DownloadJob>("/api/download-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          format: outputFormat,
          turnstileToken,
          permissionConfirmed,
        }),
      });
      setJob(created);
      watchJob(created);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The media job could not be started.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!job) {
      return;
    }
    try {
      const updated = await apiRequest<DownloadJob>(
        `/api/download-jobs/${job.id}`,
        { method: "DELETE" },
      );
      setJob(updated);
      if (updated.status === "cancelled") {
        eventsRef.current?.close();
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The job could not be cancelled.",
      );
    }
  }

  const active = job && !["ready", "failed", "expired", "cancelled"].includes(job.status);

  return (
    <>
      <PageTitle
        eyebrow="Tools / 01"
        title={manifest.name}
        description={manifest.description}
      />
      <section className="tool-workspace download-workspace">
        <form className="workspace-form" onSubmit={submit} noValidate>
          <Field label="YouTube URL" htmlFor="media-url">
            <TextInput
              id="media-url"
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              autoComplete="url"
              disabled={Boolean(active)}
            />
          </Field>
          <fieldset className="format-fieldset" disabled={Boolean(active)}>
            <legend>Format</legend>
            <div className="format-options">
              {(["mp4", "mp3", "mov"] as const).map((format) => (
                <label key={format}>
                  <input
                    type="radio"
                    name="format"
                    value={format}
                    checked={outputFormat === format}
                    onChange={() => setOutputFormat(format)}
                  />
                  <span>{format.toUpperCase()}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="permission-check">
            <input
              type="checkbox"
              checked={permissionConfirmed}
              onChange={(event) => setPermissionConfirmed(event.target.checked)}
              disabled={Boolean(active)}
            />
            <span>I have permission to download this media.</span>
          </label>
          <InlineNote>Single videos only. Public limits apply.</InlineNote>
          <Turnstile onToken={setTurnstileToken} />
          {error ? <InlineError>{error}</InlineError> : null}
          <button
            className="button button--primary button--wide"
            disabled={
              submitting ||
              Boolean(active) ||
              !permissionConfirmed ||
              !turnstileToken
            }
          >
            {submitting || active ? (
              <SpinnerGap className="spin" size={22} aria-hidden="true" />
            ) : null}
            {submitting || active ? "Processing" : "Start download"}
          </button>
          <p className="quota-note">
            One active job per visitor. Generated files expire after 15 minutes.
          </p>
        </form>
        <JobPanel job={job} onCancel={cancel} />
      </section>
    </>
  );
}
