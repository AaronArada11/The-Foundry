import {
  ArrowCounterClockwise,
  ArrowRight,
  DownloadSimple,
} from "@phosphor-icons/react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { downloadFilename, readApiError } from "../../api/client";
import { FileDropzone } from "../../components/file-dropzone";
import { Field, InlineError, InlineNote, TextInput } from "../../components/form-controls";
import { PageTitle } from "../../components/page-title";
import type { ToolPageProps } from "../../types";

type OutputFormat = "jpg" | "png" | "webp";

interface ImageArtifact {
  url: string;
  filename: string;
  width: string | null;
  height: string | null;
}

const acceptedImages = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ".avif",
].join(",");

export default function ImageFormatConverter({ manifest }: ToolPageProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("png");
  const [quality, setQuality] = useState(85);
  const [background, setBackground] = useState("#FFFFFF");
  const [artifact, setArtifact] = useState<ImageArtifact | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourcePreview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(
    () => () => {
      if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    },
    [sourcePreview],
  );

  useEffect(
    () => () => {
      if (artifact) URL.revokeObjectURL(artifact.url);
    },
    [artifact],
  );

  function reset() {
    if (artifact) URL.revokeObjectURL(artifact.url);
    setFile(null);
    setArtifact(null);
    setError(null);
    setOutputFormat("png");
    setQuality(85);
    setBackground("#FFFFFF");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose an image before starting the conversion.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    body.append("format", outputFormat);
    body.append("quality", String(quality));
    body.append("background", background);
    try {
      const response = await fetch("/api/image-conversions", {
        method: "POST",
        body,
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, "The image could not be converted."),
        );
      }
      const blob = await response.blob();
      if (artifact) URL.revokeObjectURL(artifact.url);
      setArtifact({
        url: URL.createObjectURL(blob),
        filename: downloadFilename(response, `converted-image.${outputFormat}`),
        width: response.headers.get("X-Image-Width"),
        height: response.headers.get("X-Image-Height"),
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The image could not be converted.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="Tools / 04"
        title={manifest.name}
        description={manifest.description}
      />
      <section className="tool-workspace image-workspace">
        <form className="workspace-form" onSubmit={submit} noValidate>
          <FileDropzone
            label="Source image"
            accept={acceptedImages}
            file={file}
            helper="JPG, PNG, WebP, GIF, BMP, TIFF, HEIC, or AVIF · 20 MB max"
            disabled={submitting}
            onFileChange={(next) => {
              setFile(next);
              setPreviewFailed(false);
              setArtifact(null);
              setError(null);
            }}
          />

          <fieldset className="format-fieldset" disabled={submitting}>
            <legend>Output format</legend>
            <div className="format-options">
              {(["jpg", "png", "webp"] as const).map((format) => (
                <label key={format}>
                  <input
                    type="radio"
                    name="image-format"
                    value={format}
                    checked={outputFormat === format}
                    onChange={() => setOutputFormat(format)}
                  />
                  <span>{format.toUpperCase()}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {outputFormat !== "png" ? (
            <Field label={`Quality / ${quality}`} htmlFor="image-quality">
              <input
                className="range-input"
                id="image-quality"
                type="range"
                min={1}
                max={95}
                value={quality}
                onChange={(event) => setQuality(Number(event.target.value))}
              />
            </Field>
          ) : null}

          {outputFormat === "jpg" ? (
            <Field
              label="Transparency background"
              htmlFor="image-background"
              helper="Transparent pixels are flattened to this color."
            >
              <div className="color-control">
                <input
                  type="color"
                  value={background}
                  onChange={(event) => setBackground(event.target.value.toUpperCase())}
                  aria-label="Choose transparency background"
                />
                <TextInput
                  id="image-background"
                  value={background}
                  onChange={(event) => setBackground(event.target.value)}
                  pattern="#[0-9a-fA-F]{6}"
                />
              </div>
            </Field>
          ) : null}

          <InlineNote>
            Orientation and color appearance are normalized. Private metadata is removed.
          </InlineNote>
          {error ? <InlineError>{error}</InlineError> : null}
          <button
            className="button button--primary button--wide"
            disabled={submitting || !file}
          >
            {submitting ? "Converting…" : "Convert image"}
            <ArrowRight size={22} aria-hidden="true" />
          </button>
        </form>

        <div className="workspace-result" aria-live="polite">
          <div className="result-heading">
            <span className={artifact ? "status-square status-square--ready" : "status-square"} />
            <div>
              <p>{artifact ? "Output / Ready" : "Preview / Waiting"}</p>
              <span>
                {artifact
                  ? `${outputFormat.toUpperCase()} · ${artifact.width} × ${artifact.height}`
                  : file?.name || "Your converted image will appear here."}
              </span>
            </div>
          </div>
          <div className="image-preview-frame">
            {artifact ? (
              <img src={artifact.url} alt="Converted image preview" />
            ) : sourcePreview && !previewFailed ? (
              <img
                src={sourcePreview}
                alt="Source image preview"
                onError={() => setPreviewFailed(true)}
              />
            ) : (
              <div className="image-preview-placeholder" aria-hidden="true">
                <span>IMG</span>
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
                Download {outputFormat.toUpperCase()}
              </a>
            ) : (
              <button className="button button--outline" type="button" disabled>
                <DownloadSimple size={22} aria-hidden="true" />
                Download
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
