import {
  ArrowRight,
  ArrowCounterClockwise,
  DownloadSimple,
} from "@phosphor-icons/react";
import { useEffect, useState, type FormEvent } from "react";

import { Field, InlineError, InlineNote, TextInput } from "../../components/form-controls";
import { PageTitle } from "../../components/page-title";
import type { ToolPageProps } from "../../types";

interface QRArtifact {
  url: string;
  filename: string;
}

function parseFilename(response: Response): string {
  return (
    response.headers.get("X-Artifact-Filename") ||
    response.headers
      .get("Content-Disposition")
      ?.match(/filename="?([^"]+)"?/)?.[1] ||
    "link-qr.png"
  );
}

export default function QRGeneratorTool({ manifest }: ToolPageProps) {
  const [link, setLink] = useState("");
  const [foreground, setForeground] = useState("#1A3C2B");
  const [background, setBackground] = useState("#FFFFFF");
  const [filename, setFilename] = useState("");
  const [artifact, setArtifact] = useState<QRArtifact | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (artifact) {
        URL.revokeObjectURL(artifact.url);
      }
    },
    [artifact],
  );

  function reset() {
    if (artifact) {
      URL.revokeObjectURL(artifact.url);
    }
    setArtifact(null);
    setError(null);
    setLink("");
    setFilename("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/qr-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link, foreground, background, filename }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        throw new Error(payload.detail || "The QR code could not be generated.");
      }
      const blob = await response.blob();
      if (artifact) {
        URL.revokeObjectURL(artifact.url);
      }
      setArtifact({
        url: URL.createObjectURL(blob),
        filename: parseFilename(response),
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The QR code could not be generated.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="Tools / 02"
        title={manifest.name}
        description={manifest.description}
      />
      <section className="tool-workspace qr-workspace">
        <form className="workspace-form" onSubmit={submit} noValidate>
          <Field label="Link URL" htmlFor="qr-link">
            <TextInput
              id="qr-link"
              type="url"
              required
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://example.com"
              autoComplete="url"
              aria-describedby="qr-reliability-note"
            />
          </Field>

          <div className="color-grid">
            <Field label="Foreground" htmlFor="qr-foreground">
              <div className="color-control">
                <input
                  type="color"
                  value={foreground}
                  onChange={(event) => setForeground(event.target.value.toUpperCase())}
                  aria-label="Choose foreground color"
                />
                <TextInput
                  id="qr-foreground"
                  value={foreground}
                  onChange={(event) => setForeground(event.target.value)}
                  pattern="#[0-9a-fA-F]{6}"
                  aria-label="Foreground hex color"
                />
              </div>
            </Field>
            <Field label="Background" htmlFor="qr-background">
              <div className="color-control">
                <input
                  type="color"
                  value={background}
                  onChange={(event) => setBackground(event.target.value.toUpperCase())}
                  aria-label="Choose background color"
                />
                <TextInput
                  id="qr-background"
                  value={background}
                  onChange={(event) => setBackground(event.target.value)}
                  pattern="#[0-9a-fA-F]{6}"
                  aria-label="Background hex color"
                />
              </div>
            </Field>
          </div>

          <Field label="File name (optional)" htmlFor="qr-filename">
            <TextInput
              id="qr-filename"
              value={filename}
              onChange={(event) => setFilename(event.target.value)}
              placeholder="example-qr"
              maxLength={120}
            />
          </Field>

          <div id="qr-reliability-note">
            <InlineNote>
              Dark foregrounds on light backgrounds scan most reliably.
            </InlineNote>
          </div>
          {error ? <InlineError>{error}</InlineError> : null}
          <button className="button button--primary button--wide" disabled={submitting}>
            {submitting ? "Generating…" : "Generate QR"}
            <ArrowRight size={22} aria-hidden="true" />
          </button>
        </form>

        <div className="workspace-result" aria-live="polite">
          <div className="result-heading">
            <span className={artifact ? "status-square status-square--ready" : "status-square"} />
            <div>
              <p>{artifact ? "Output / Ready" : "Output / Waiting"}</p>
              <span>{artifact ? "PNG · 1200 × 1200" : "Your QR code will appear here."}</span>
            </div>
          </div>
          <div className={artifact ? "qr-frame is-ready" : "qr-frame"}>
            <span className="corner corner--tl" />
            <span className="corner corner--tr" />
            <span className="corner corner--bl" />
            <span className="corner corner--br" />
            {artifact ? (
              <img src={artifact.url} alt={`QR code for ${link}`} />
            ) : (
              <div className="qr-placeholder" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
          <div className="result-actions">
            {artifact ? (
              <a
                className="button button--outline"
                href={artifact.url}
                download={artifact.filename}
              >
                <DownloadSimple size={22} aria-hidden="true" />
                Download PNG
              </a>
            ) : (
              <button className="button button--outline" type="button" disabled>
                <DownloadSimple size={22} aria-hidden="true" />
                Download PNG
              </button>
            )}
            <button className="button button--outline" type="button" onClick={reset}>
              <ArrowCounterClockwise size={22} aria-hidden="true" />
              Start over
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
