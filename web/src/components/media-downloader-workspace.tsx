import { SpinnerGap } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { apiRequest } from "../api/client";
import { JobProgressPanel, type JobStatus } from "./job-progress-panel";
import { Field, InlineError, InlineNote, TextInput } from "./form-controls";
import { PageTitle } from "./page-title";
import { Turnstile } from "./turnstile";
import type { ToolPageProps } from "../types";

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

const terminalStatuses: JobStatus[] = ["ready", "failed", "expired", "cancelled"];
const downloadStages = [
  { status: "queued", label: "queued" },
  { status: "downloading", label: "downloading" },
  { status: "processing", label: "processing" },
  { status: "ready", label: "ready" },
] satisfies { status: JobStatus; label: string }[];

function formatDuration(seconds: number | null): string {
  if (!seconds) {
    return "--:--";
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function MediaDownloaderWorkspace({
  manifest,
  platform,
  eyebrow,
  endpoint,
  placeholder,
  accent,
}: ToolPageProps & {
  platform: "YouTube" | "TikTok";
  eyebrow: string;
  endpoint: string;
  placeholder: string;
  accent: "coral" | "gold";
}) {
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
    const source = new EventSource(nextJob.eventsUrl || `${endpoint}/${nextJob.id}/events`);
    eventsRef.current = source;
    source.onmessage = (event) => {
      const update = JSON.parse(event.data) as DownloadJob;
      setJob(update);
      setError(null);
      if (terminalStatuses.includes(update.status)) {
        source.close();
        if (update.error) {
          setError(update.error);
        }
      }
    };
    source.onerror = () => {
      setError("Live progress is reconnecting…");
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await apiRequest<DownloadJob>(endpoint, {
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
          : `The ${platform} download could not be started. Check the URL and try again.`,
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
      const updated = await apiRequest<DownloadJob>(`${endpoint}/${job.id}`, {
        method: "DELETE",
      });
      setJob(updated);
      if (updated.status === "cancelled") {
        eventsRef.current?.close();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The job could not be cancelled.");
    }
  }

  const active = job ? !terminalStatuses.includes(job.status) : false;

  return (
    <>
      <PageTitle eyebrow={eyebrow} title={manifest.name} description={manifest.description} />
      <section className="tool-workspace download-workspace">
        <form className="workspace-form" onSubmit={submit} noValidate>
          <Field label={`${platform} URL`} htmlFor={`${manifest.slug}-url`}>
            <TextInput
              id={`${manifest.slug}-url`}
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={placeholder}
              autoComplete="url"
              disabled={active}
            />
          </Field>
          <fieldset className="format-fieldset" disabled={active}>
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
              disabled={active}
            />
            <span>I have permission to download this media.</span>
          </label>
          <InlineNote>Individual public videos only. Public limits apply.</InlineNote>
          <Turnstile onToken={setTurnstileToken} />
          {error ? <InlineError>{error}</InlineError> : null}
          <button
            className="button button--primary button--wide"
            disabled={submitting || active || !permissionConfirmed || !turnstileToken}
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
        <JobProgressPanel
          job={job}
          stages={downloadStages}
          waitingTitle="No active job"
          waitingMeta={`Submit a permitted ${platform} video URL to begin.`}
          title={(current) => current.title || `Preparing ${platform} video…`}
          meta={(current) =>
            `${current.format.toUpperCase()} · ${formatDuration(current.durationSeconds)}`
          }
          downloadLabel={(current) => `Download ${current.format.toUpperCase()}`}
          progressLabel={`${platform} download progress`}
          accent={accent}
          onCancel={cancel}
        />
      </section>
    </>
  );
}
