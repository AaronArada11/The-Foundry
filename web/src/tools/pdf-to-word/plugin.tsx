import { ArrowRight, SpinnerGap } from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { apiRequest, uploadFormWithProgress } from "../../api/client";
import { FileDropzone } from "../../components/file-dropzone";
import {
  JobProgressPanel,
  type JobStatus,
} from "../../components/job-progress-panel";
import { InlineError, InlineNote } from "../../components/form-controls";
import { PageTitle } from "../../components/page-title";
import { Turnstile } from "../../components/turnstile";
import type { ToolPageProps } from "../../types";
import { formatBytes } from "../../utils/files";

interface PDFJob {
  id: string;
  kind: "pdf-to-word";
  status: JobStatus;
  progress: number;
  sourceFilename: string;
  filename: string | null;
  downloadUrl: string | null;
  artifactExpiresAt: number | null;
  error: string | null;
  eventsUrl?: string;
}

const pdfStages = [
  { status: "queued", label: "queued" },
  { status: "processing", label: "converting" },
  { status: "ready", label: "ready" },
] satisfies { status: JobStatus; label: string }[];

export default function PDFToWordTool({ manifest }: ToolPageProps) {
  const [file, setFile] = useState<File | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [job, setJob] = useState<PDFJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventsRef = useRef<EventSource | null>(null);

  useEffect(
    () => () => {
      eventsRef.current?.close();
    },
    [],
  );

  function watchJob(nextJob: PDFJob) {
    eventsRef.current?.close();
    const source = new EventSource(
      nextJob.eventsUrl || `/api/pdf-to-word-jobs/${nextJob.id}/events`,
    );
    eventsRef.current = source;
    source.onmessage = (event) => {
      const update = JSON.parse(event.data) as PDFJob;
      setJob(update);
      if (["ready", "failed", "expired", "cancelled"].includes(update.status)) {
        source.close();
        if (update.error) setError(update.error);
      }
    };
    source.onerror = () => {
      source.close();
      setError("Live progress disconnected. Refresh the page to check the job.");
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a PDF before starting the conversion.");
      return;
    }
    setSubmitting(true);
    setUploadProgress(0);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    body.append("turnstileToken", turnstileToken || "");
    try {
      const created = await uploadFormWithProgress<PDFJob>(
        "/api/pdf-to-word-jobs",
        body,
        setUploadProgress,
      );
      setJob(created);
      watchJob(created);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The PDF conversion could not be started.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!job) return;
    try {
      const updated = await apiRequest<PDFJob>(
        `/api/pdf-to-word-jobs/${job.id}`,
        { method: "DELETE" },
      );
      setJob(updated);
      if (updated.status === "cancelled") eventsRef.current?.close();
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
        eyebrow="Tools / 04"
        title={manifest.name}
        description={manifest.description}
      />
      <section className="tool-workspace pdf-workspace">
        <form className="workspace-form" onSubmit={submit} noValidate>
          <FileDropzone
            label="Source PDF"
            accept=".pdf,application/pdf"
            file={file}
            helper="Text-based PDF · 25 MB and 100 pages max"
            disabled={submitting || Boolean(active)}
            onFileChange={(next) => {
              setFile(next);
              setJob(null);
              setUploadProgress(0);
              setError(null);
            }}
          />
          <InlineNote>
            Scanned-only and password-protected PDFs are not supported. Files are
            private and temporary.
          </InlineNote>
          <Turnstile onToken={setTurnstileToken} />
          {submitting ? (
            <div className="upload-progress" aria-live="polite">
              <span>Uploading document</span>
              <strong>{uploadProgress}%</strong>
              <div
                role="progressbar"
                aria-label="PDF upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
              >
                <span style={{ transform: `scaleX(${uploadProgress / 100})` }} />
              </div>
            </div>
          ) : null}
          {error ? <InlineError>{error}</InlineError> : null}
          <button
            className="button button--primary button--wide"
            disabled={submitting || Boolean(active) || !file || !turnstileToken}
          >
            {submitting || active ? (
              <SpinnerGap className="spin" size={22} aria-hidden="true" />
            ) : (
              <ArrowRight size={22} aria-hidden="true" />
            )}
            {submitting ? "Uploading…" : active ? "Converting…" : "Convert to Word"}
          </button>
          <p className="quota-note">
            One active conversion per visitor. Downloads expire after 15 minutes.
          </p>
        </form>
        <JobProgressPanel
          job={job}
          stages={pdfStages}
          waitingTitle="No active conversion"
          waitingMeta="Upload a text-based PDF to begin."
          title={(current) =>
            current.status === "ready" ? "Word document ready" : "Converting document…"
          }
          meta={(current) =>
            `${current.sourceFilename} · ${file ? formatBytes(file.size) : "PDF"}`
          }
          downloadLabel={() => "Download DOCX"}
          progressLabel="PDF conversion progress"
          accent="forest"
          onCancel={cancel}
        />
      </section>
    </>
  );
}
