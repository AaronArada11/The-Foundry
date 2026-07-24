import { FileArrowUp } from "@phosphor-icons/react";
import {
  useId,
  useState,
  type DragEvent,
} from "react";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropzone({
  label,
  accept,
  file,
  helper,
  disabled = false,
  onFileChange,
}: {
  label: string;
  accept: string;
  file: File | null;
  helper: string;
  disabled?: boolean;
  onFileChange: (file: File | null) => void;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);

  function drop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) {
      onFileChange(event.dataTransfer.files.item(0));
    }
  }

  return (
    <div className="file-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <button
        type="button"
        className={`file-dropzone ${dragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`}
        disabled={disabled}
        onClick={() => document.getElementById(id)?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <FileArrowUp size={32} aria-hidden="true" />
        <strong>{file ? file.name : "Choose a file or drop it here"}</strong>
        <span>{file ? `${formatBytes(file.size)} · Ready` : helper}</span>
      </button>
      <input
        className="visually-hidden"
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => onFileChange(event.target.files?.item(0) ?? null)}
      />
    </div>
  );
}
