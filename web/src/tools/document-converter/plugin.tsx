import { ArrowRight, SpinnerGap } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";

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

type DocumentFormat = "pdf" | "docx" | "md";

interface DocumentJob {
  id: string;
  kind: "document-conversion";
  status: JobStatus;
  progress: number;
  sourceFilename: string;
  inputFormat: DocumentFormat;
  outputFormat: DocumentFormat;
  filename: string | null;
  downloadUrl: string | null;
  artifactExpiresAt: number | null;
  error: string | null;
  eventsUrl?: string;
}

const formatLabels: Record<DocumentFormat, string> = {
  pdf: "PDF",
  docx: "Word",
  md: "Markdown",
};

const defaultOutput: Record<DocumentFormat, DocumentFormat> = {
  pdf: "docx",
  docx: "pdf",
  md: "pdf",
};

const documentStages = [
  { status: "queued", label: "queued" },
  { status: "processing", label: "converting" },
  { status: "ready", label: "ready" },
] satisfies { status: JobStatus; label: string }[];

function formatFromFile(file: File): DocumentFormat | null {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "pdf") return "pdf";
  if (extension === "docx") return "docx";
  if (extension === "md" || extension === "markdown") return "md";
  return null;
}

export default function DocumentConverterTool({ manifest }: ToolPageProps) {
  const [file, setFile] = useState<File | null>(null);
  const [inputFormat, setInputFormat] = useState<DocumentFormat | null>(null);
  const [outputFormat, setOutputFormat] = useState<DocumentFormat>("docx");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [job, setJob] = useState<DocumentJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventsRef = useRef<EventSource | null>(null);

  useEffect(
    () => () => {
      eventsRef.current?.close();
    },
    [],
  );

  function watchJob(nextJob: DocumentJob) {
    eventsRef.current?.close();
    const source = new EventSource(
      nextJob.eventsUrl || `/api/document-conversion-jobs/${nextJob.id}/events`,
    );
    eventsRef.current = source;
    source.onmessage = (event) => {
      const update = JSON.parse(event.data) as DocumentJob;
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

  function chooseFile(next: File | null) {
    const detected = next ? formatFromFile(next) : null;
    setFile(next);
    setInputFormat(detected);
    if (detected && outputFormat === detected) {
      setOutputFormat(defaultOutput[detected]);
    }
    setJob(null);
    setUploadProgress(0);
    setError(
      next && !detected
        ? "Choose a PDF, Word (.docx), or Markdown file."
        : null,
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !inputFormat) {
      setError("Choose a PDF, Word (.docx), or Markdown file.");
      return;
    }
    if (inputFormat === outputFormat) {
      setError("Choose an output format different from the source document.");
      return;
    }
    setSubmitting(true);
    setUploadProgress(0);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    body.append("outputFormat", outputFormat);
    body.append("turnstileToken", turnstileToken || "");
    try {
      const created = await uploadFormWithProgress<DocumentJob>(
        "/api/document-conversion-jobs",
        body,
        setUploadProgress,
      );
      setJob(created);
      watchJob(created);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The document conversion could not be started.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!job) return;
    try {
      const updated = await apiRequest<DocumentJob>(
        `/api/document-conversion-jobs/${job.id}`,
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
  const conversionLabel = inputFormat
    ? `${formatLabels[inputFormat]} to ${formatLabels[outputFormat]}`
    : `document to ${formatLabels[outputFormat]}`;

  return (
    <>
      <PageTitle
        eyebrow="Tools / 05"
        title={manifest.name}
        description={manifest.description}
      />
      <section className="tool-workspace document-workspace">
        <form className="workspace-form" onSubmit={submit} noValidate>
          <FileDropzone
            label="Source document"
            accept=".pdf,.docx,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
            file={file}
            helper="PDF, Word, or Markdown · 25 MB max"
            disabled={submitting || Boolean(active)}
            onFileChange={chooseFile}
          />
          <fieldset className="format-fieldset" disabled={submitting || Boolean(active)}>
            <legend>Output format</legend>
            <div className="format-options">
              {(Object.keys(formatLabels) as DocumentFormat[]).map((format) => (
                <label key={format}>
                  <input
                    type="radio"
                    name="output-format"
                    value={format}
                    checked={outputFormat === format}
                    disabled={inputFormat === format}
                    onChange={() => {
                      setOutputFormat(format);
                      setJob(null);
                      setError(null);
                    }}
                  />
                  <span>{formatLabels[format]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <InlineNote>
            Text and basic structure are preserved. Complex layouts may be simplified.
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
                aria-label="Document upload progress"
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
            disabled={
              submitting ||
              Boolean(active) ||
              !file ||
              !inputFormat ||
              inputFormat === outputFormat ||
              !turnstileToken
            }
          >
            {submitting || active ? (
              <SpinnerGap className="spin" size={22} aria-hidden="true" />
            ) : (
              <ArrowRight size={22} aria-hidden="true" />
            )}
            {submitting ? "Uploading…" : active ? "Converting…" : `Convert ${conversionLabel}`}
          </button>
          <p className="quota-note">
            One active conversion per visitor. Downloads expire after 15 minutes.
          </p>
        </form>
        <JobProgressPanel
          job={job}
          stages={documentStages}
          waitingTitle="No active conversion"
          waitingMeta="Upload a PDF, Word, or Markdown file to begin."
          title={(current) =>
            current.status === "ready"
              ? `${formatLabels[current.outputFormat]} document ready`
              : "Converting document…"
          }
          meta={(current) =>
            `${current.sourceFilename} · ${formatLabels[current.inputFormat]} → ${formatLabels[current.outputFormat]} · ${file ? formatBytes(file.size) : "Document"}`
          }
          downloadLabel={(current) => `Download ${formatLabels[current.outputFormat]}`}
          progressLabel="Document conversion progress"
          accent="forest"
          onCancel={cancel}
        />
      </section>
    </>
  );
}
