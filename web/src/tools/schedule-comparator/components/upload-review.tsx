import {
  ArrowRight,
  Copy,
  FileArrowUp,
  Plus,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useId, useState, type DragEvent } from "react";

import { formatBytes } from "../../../utils/files";
import { validateClass } from "../analytics";
import { createEmptyClass, WEEKDAYS, type ScheduleClass, type SectionSchedule, type SourceScreenshot } from "../models";

export function UploadView({
  screenshots,
  disabled,
  message,
  onFiles,
  onRemove,
  onRetry,
  onCancel,
  onContinue,
}: {
  screenshots: SourceScreenshot[];
  disabled: boolean;
  message: string | null;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);

  function acceptFiles(files: FileList | null) {
    if (files?.length) onFiles(Array.from(files));
  }

  function drop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) acceptFiles(event.dataTransfer.files);
  }

  return (
    <section className="schedule-upload-view">
      <div className="schedule-intro-copy">
        <p className="schedule-kicker">Private, on-device OCR</p>
        <h2>Upload each block section.</h2>
        <p>Add one screenshot per section. Images and extracted schedules stay in this browser.</p>
      </div>
      <div className="multi-file-field">
        <label className="field-label" htmlFor={id}>Schedule screenshots</label>
        <button
          type="button"
          className={`schedule-dropzone ${dragging ? "is-dragging" : ""}`}
          disabled={disabled || screenshots.length >= 8}
          onClick={() => document.getElementById(id)?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          <FileArrowUp size={38} aria-hidden="true" />
          <strong>Choose screenshots or drop them here</strong>
          <span>PNG, JPEG, or WebP · 20 MB each · up to 8 sections</span>
        </button>
        <input
          className="visually-hidden"
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={disabled || screenshots.length >= 8}
          onChange={(event) => { acceptFiles(event.target.files); event.currentTarget.value = ""; }}
        />
      </div>

      {message ? <p className="schedule-message" role="alert">{message}</p> : null}
      {screenshots.length ? (
        <div className="upload-queue" aria-live="polite">
          {screenshots.map((item, index) => (
            <article className="upload-queue-row" key={item.id}>
              <div className="upload-thumbnail">
                {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <span>{index + 1}</span>}
              </div>
              <div className="upload-file-info">
                <strong>{item.name}</strong>
                <span>{formatBytes(item.size)} · {item.width} × {item.height}</span>
                <div className="ocr-progress-track" aria-label={`OCR progress ${item.progress}%`}>
                  <span style={{ width: `${item.progress}%` }} />
                </div>
              </div>
              <div className={`ocr-state ocr-state--${item.status}`}>
                <span>{item.status === "processing" ? `Reading ${item.progress}%` : item.status}</span>
                {item.averageConfidence !== null ? <small>{Math.round(item.averageConfidence)}% confidence</small> : null}
                {item.error ? <small>{item.error}</small> : null}
              </div>
              <div className="upload-row-actions">
                {item.status === "error" ? <button type="button" onClick={() => onRetry(item.id)}>Retry</button> : null}
                <button type="button" aria-label={`Remove ${item.name}`} onClick={() => onRemove(item.id)} disabled={item.status === "processing"}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <div className="workflow-actions">
        {disabled ? <button className="button button--outline" type="button" onClick={onCancel}>Cancel OCR</button> : null}
        <button
          className="button button--primary"
          type="button"
          disabled={!screenshots.length || disabled || screenshots.some((item) => item.status !== "ready")}
          onClick={onContinue}
        >
          Review extracted classes <ArrowRight size={20} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function ClassEditor({
  item,
  onChange,
  onDuplicate,
  onDelete,
}: {
  item: ScheduleClass;
  onChange: (item: ScheduleClass) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const errors = validateClass(item);
  const lowConfidence = item.confidence.overall < 80;
  const update = <K extends keyof ScheduleClass>(key: K, value: ScheduleClass[K]) => onChange({
    ...item,
    [key]: value,
    confidence: { ...item.confidence, [key]: 100, overall: 100 },
  });
  return (
    <article className={`class-editor ${errors.length || lowConfidence ? "class-editor--attention" : ""}`}>
      <header>
        <div>
          <span>Class record</span>
          {lowConfidence ? <strong><Warning size={16} /> Check OCR · {Math.round(item.confidence.overall)}%</strong> : null}
        </div>
        <div className="class-editor-actions">
          <button type="button" onClick={onDuplicate}><Copy size={17} /> Duplicate</button>
          <button type="button" onClick={onDelete}><Trash size={17} /> Delete</button>
        </div>
      </header>
      <div className="class-fields">
        <label>Subject<input value={item.subject} onChange={(event) => update("subject", event.target.value)} aria-invalid={!item.subject} /></label>
        <label className="class-field-title">Course title<input value={item.name} onChange={(event) => update("name", event.target.value)} aria-invalid={!item.name} /></label>
        <label>Start<input type="time" value={item.start} onChange={(event) => update("start", event.target.value)} /></label>
        <label>End<input type="time" value={item.end} onChange={(event) => update("end", event.target.value)} /></label>
        <label>Room<input value={item.room} onChange={(event) => update("room", event.target.value)} /></label>
        <label>Instructor<input value={item.instructor} onChange={(event) => update("instructor", event.target.value)} /></label>
        <label>Units<input type="number" min="0" max="10" step="0.5" value={item.units ?? ""} onChange={(event) => update("units", event.target.value ? Number(event.target.value) : null)} /></label>
      </div>
      <fieldset className="day-selector">
        <legend>Meeting days</legend>
        {WEEKDAYS.map((day) => (
          <label key={day}>
            <input type="checkbox" checked={item.days.includes(day)} onChange={(event) => update("days", event.target.checked ? [...item.days, day].toSorted((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b)) : item.days.filter((value) => value !== day))} />
            <span>{day}</span>
          </label>
        ))}
      </fieldset>
      {errors.length ? <p className="class-errors" role="alert">{errors.join(" · ")}</p> : null}
      {item.rawText ? <details><summary>Original OCR row</summary><code>{item.rawText}</code></details> : null}
    </article>
  );
}

export function ReviewView({
  sections,
  screenshots,
  activeSectionId,
  onActiveSection,
  onSectionChange,
  onBack,
  onContinue,
}: {
  sections: SectionSchedule[];
  screenshots: SourceScreenshot[];
  activeSectionId: string;
  onActiveSection: (id: string) => void;
  onSectionChange: (section: SectionSchedule) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const section = sections.find((item) => item.id === activeSectionId) ?? sections[0];
  const screenshot = screenshots.find((item) => item.id === section?.screenshotId);
  if (!section) return null;
  const invalid = sections.some((candidate) => !candidate.classes.length || candidate.classes.some((item) => validateClass(item).length));
  const updateClass = (updated: ScheduleClass) => onSectionChange({ ...section, classes: section.classes.map((item) => item.id === updated.id ? updated : item) });
  return (
    <section className="schedule-review-view">
      <div className="review-toolbar">
        <label>Section to review
          <select value={section.id} onChange={(event) => onActiveSection(event.target.value)}>
            {sections.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Section name
          <input value={section.name} onChange={(event) => onSectionChange({ ...section, name: event.target.value.toUpperCase() })} />
        </label>
        <p><strong>{section.classes.filter((item) => item.confidence.overall < 80).length}</strong> low-confidence records</p>
      </div>
      <div className="review-split">
        <aside className="review-source">
          <div className="review-source-heading"><span>Source screenshot</span><small>Private · stored on this device</small></div>
          {screenshot?.previewUrl ? <img src={screenshot.previewUrl} alt={`Uploaded schedule for ${section.name}`} /> : <p>Source image is unavailable.</p>}
        </aside>
        <div className="review-editors">
          {section.classes.map((item) => (
            <ClassEditor
              key={item.id}
              item={item}
              onChange={updateClass}
              onDuplicate={() => onSectionChange({ ...section, classes: [...section.classes, { ...item, id: `${item.id}-copy-${Date.now()}`, confidence: { ...item.confidence, overall: 100 } }] })}
              onDelete={() => onSectionChange({ ...section, classes: section.classes.filter((candidate) => candidate.id !== item.id) })}
            />
          ))}
          <button className="add-class-button" type="button" onClick={() => onSectionChange({ ...section, classes: [...section.classes, createEmptyClass(section.screenshotId)] })}>
            <Plus size={20} /> Add class manually
          </button>
        </div>
      </div>
      <div className="workflow-actions">
        <button className="button button--outline" type="button" onClick={onBack}>Back to uploads</button>
        <button className="button button--primary" type="button" disabled={invalid || sections.length < 2} onClick={onContinue}>
          Compare {sections.length} sections <ArrowRight size={20} />
        </button>
      </div>
      {sections.length < 2 ? <p className="schedule-footnote">Add at least two valid sections to generate a recommendation.</p> : null}
    </section>
  );
}
