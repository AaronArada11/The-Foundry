import { CalendarBlank, Trash } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PageTitle } from "../../components/page-title";
import type { ToolPageProps } from "../../types";
import { validateClass } from "./analytics";
import { CompareView, ExportView } from "./components/compare-export";
import { ReviewView, UploadView } from "./components/upload-review";
import {
  createEmptyClass,
  createId,
  createProject,
  SECTION_COLORS,
  type ScheduleProject,
  type SectionSchedule,
  type SourceScreenshot,
  type WorkflowStep,
} from "./models";
import { inspectImage, recognizeSchedule, terminateOcr } from "./ocr";
import { inferSectionName, parseOcrResult } from "./parser";
import { deleteProject, deleteScreenshot, loadProject, loadScreenshot, saveProject, saveScreenshot } from "./storage";
import "./schedule-comparator.css";

const ACTIVE_PROJECT_KEY = "aaron-toolkit:schedule-project";
const ACTIVE_STEP_KEY = "aaron-toolkit:schedule-step";
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const STEPS: Array<{ id: WorkflowStep; label: string }> = [
  { id: "upload", label: "Upload" },
  { id: "review", label: "Review" },
  { id: "compare", label: "Compare" },
  { id: "export", label: "Export" },
];

interface ProcessingEntry {
  file: File;
  screenshotId: string;
  sectionId: string;
  index: number;
}

export default function ScheduleComparator({ manifest }: ToolPageProps) {
  const [project, setProject] = useState<ScheduleProject>(() => createProject());
  const [step, setStep] = useState<WorkflowStep>(() => {
    const stored = localStorage.getItem(ACTIVE_STEP_KEY);
    return STEPS.some((item) => item.id === stored) ? stored as WorkflowStep : "upload";
  });
  const [activeSectionId, setActiveSectionId] = useState("");
  const [overlayIds, setOverlayIds] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    const id = localStorage.getItem(ACTIVE_PROJECT_KEY);
    if (!id) {
      setHydrated(true);
      return;
    }
    loadProject(id).then((saved) => {
      if (saved) {
        setProject(saved);
        setActiveSectionId(saved.sections[0]?.id ?? "");
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);
    localStorage.setItem(ACTIVE_STEP_KEY, step);
    const timer = window.setTimeout(() => {
      saveProject(project).then((storage) => {
        if (storage === "memory") setMessage("Browser storage is unavailable. This project will last for the current session only.");
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hydrated, project, step]);

  useEffect(() => () => {
    for (const screenshot of project.screenshots) {
      if (screenshot.previewUrl.startsWith("blob:")) URL.revokeObjectURL(screenshot.previewUrl);
    }
    void terminateOcr();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const validForComparison = useMemo(
    () => project.sections.length >= 2 && project.sections.every((section) => section.classes.length && section.classes.every((item) => !validateClass(item).length)),
    [project.sections],
  );

  function updateProject(updater: (current: ScheduleProject) => ScheduleProject) {
    setProject((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }));
  }

  function navigate(next: WorkflowStep) {
    if (next === "compare" && !validForComparison) return;
    if (next === "export" && !validForComparison) return;
    if (next === "review" && !project.sections.length) return;
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function processEntries(entries: ProcessingEntry[]) {
    if (!entries.length) return;
    setProcessing(true);
    cancelRef.current = false;
    for (const entry of entries) {
      if (cancelRef.current) break;
      updateProject((current) => ({
        ...current,
        screenshots: current.screenshots.map((item) => item.id === entry.screenshotId ? { ...item, status: "processing", progress: 1, error: null } : item),
      }));
      try {
        const result = await recognizeSchedule(entry.file, (progress) => {
          updateProject((current) => ({
            ...current,
            screenshots: current.screenshots.map((item) => item.id === entry.screenshotId ? { ...item, progress: Math.max(1, progress) } : item),
          }));
        });
        if (cancelRef.current) break;
        const parsed = parseOcrResult(result, entry.screenshotId);
        const classes = parsed.length ? parsed : [{ ...createEmptyClass(entry.screenshotId), confidence: { ...createEmptyClass(entry.screenshotId).confidence, overall: 0 } }];
        updateProject((current) => ({
          ...current,
          screenshots: current.screenshots.map((item) => item.id === entry.screenshotId ? { ...item, status: "ready", progress: 100, averageConfidence: result.confidence, error: null } : item),
          sections: current.sections.map((section) => section.id === entry.sectionId ? { ...section, name: inferSectionName(result.text, entry.file.name, entry.index), classes } : section),
        }));
      } catch (error) {
        updateProject((current) => ({
          ...current,
          screenshots: current.screenshots.map((item) => item.id === entry.screenshotId ? { ...item, status: "error", progress: 0, error: error instanceof Error ? error.message : "OCR failed. Try again." } : item),
        }));
      }
    }
    setProcessing(false);
  }

  async function addFiles(files: File[]) {
    setMessage(null);
    const available = Math.max(0, 8 - project.screenshots.length);
    const selected = files.slice(0, available);
    if (files.length > available) setMessage(`Only ${available} more screenshot${available === 1 ? "" : "s"} can be added.`);
    const entries: ProcessingEntry[] = [];
    const screenshots: SourceScreenshot[] = [];
    const sections: SectionSchedule[] = [];
    for (const file of selected) {
      if (!ACCEPTED_TYPES.has(file.type)) {
        setMessage(`${file.name} is not a PNG, JPEG, or WebP screenshot.`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        setMessage(`${file.name} is larger than 20 MB.`);
        continue;
      }
      try {
        const dimensions = await inspectImage(file);
        if (dimensions.width * dimensions.height > 40_000_000) throw new Error(`${file.name} exceeds 40 megapixels.`);
        const screenshotId = createId("screenshot");
        const sectionId = createId("section");
        const previewUrl = URL.createObjectURL(file);
        screenshots.push({
          id: screenshotId,
          name: file.name,
          type: file.type,
          size: file.size,
          width: dimensions.width,
          height: dimensions.height,
          previewUrl,
          status: "queued",
          progress: 0,
          error: null,
          averageConfidence: null,
        });
        sections.push({
          id: sectionId,
          name: `SECTION ${project.sections.length + sections.length + 1}`,
          color: SECTION_COLORS[(project.sections.length + sections.length) % SECTION_COLORS.length],
          screenshotId,
          classes: [],
        });
        entries.push({ file, screenshotId, sectionId, index: project.sections.length + sections.length - 1 });
        await saveScreenshot(screenshotId, file);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : `${file.name} could not be read.`);
      }
    }
    if (!entries.length) return;
    updateProject((current) => ({ ...current, screenshots: [...current.screenshots, ...screenshots], sections: [...current.sections, ...sections] }));
    setActiveSectionId((current) => current || sections[0].id);
    await processEntries(entries);
  }

  async function retryScreenshot(id: string) {
    const screenshot = project.screenshots.find((item) => item.id === id);
    const section = project.sections.find((item) => item.screenshotId === id);
    const blob = await loadScreenshot(id);
    if (!screenshot || !section || !blob) {
      setMessage("The original screenshot is no longer available. Remove it and upload it again.");
      return;
    }
    const file = new File([blob], screenshot.name, { type: screenshot.type });
    await processEntries([{ file, screenshotId: id, sectionId: section.id, index: project.sections.indexOf(section) }]);
  }

  async function cancelOcr() {
    cancelRef.current = true;
    await terminateOcr();
    updateProject((current) => ({
      ...current,
      screenshots: current.screenshots.map((item) => item.status === "processing" || item.status === "queued" ? { ...item, status: "error", progress: 0, error: "OCR cancelled. Retry when ready." } : item),
    }));
    setProcessing(false);
  }

  function removeScreenshot(id: string) {
    const screenshot = project.screenshots.find((item) => item.id === id);
    if (screenshot?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(screenshot.previewUrl);
    const remainingSections = project.sections.filter((item) => item.screenshotId !== id);
    updateProject((current) => ({
      ...current,
      screenshots: current.screenshots.filter((item) => item.id !== id),
      sections: remainingSections,
    }));
    void deleteScreenshot(id);
    if (!remainingSections.some((item) => item.id === activeSectionId)) setActiveSectionId(remainingSections[0]?.id ?? "");
  }

  function updateSection(updated: SectionSchedule) {
    updateProject((current) => ({ ...current, sections: current.sections.map((item) => item.id === updated.id ? updated : item) }));
  }

  async function clearProject() {
    await cancelOcr();
    await deleteProject(project);
    for (const screenshot of project.screenshots) if (screenshot.previewUrl.startsWith("blob:")) URL.revokeObjectURL(screenshot.previewUrl);
    const fresh = createProject();
    setProject(fresh);
    setActiveSectionId("");
    setOverlayIds([]);
    setMessage(null);
    setStep("upload");
    localStorage.setItem(ACTIVE_PROJECT_KEY, fresh.id);
  }

  const stepAside = (
    <div className="schedule-workflow-nav">
      <div className="schedule-steps" aria-label="Schedule comparison progress">
        {STEPS.map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={step === item.id ? "is-active" : ""}
            aria-current={step === item.id ? "step" : undefined}
            disabled={(item.id === "review" && !project.sections.length) || ((item.id === "compare" || item.id === "export") && !validForComparison)}
            onClick={() => navigate(item.id)}
          >
            <span>{index + 1}</span>{item.label}
          </button>
        ))}
      </div>
      {project.screenshots.length ? <button className="delete-project" type="button" onClick={clearProject}><Trash size={16} /> Delete project</button> : null}
    </div>
  );

  if (!hydrated) return <div className="route-loading">Loading saved schedule…</div>;

  return (
    <div className="schedule-comparator-page">
      <PageTitle
        title={manifest.name}
        description={manifest.description}
        aside={stepAside}
      />
      <div className="schedule-tool-icon" aria-hidden="true"><CalendarBlank size={34} /></div>
      {step === "upload" ? (
        <UploadView
          screenshots={project.screenshots}
          disabled={processing}
          message={message}
          onFiles={addFiles}
          onRemove={removeScreenshot}
          onRetry={retryScreenshot}
          onCancel={cancelOcr}
          onContinue={() => navigate("review")}
        />
      ) : null}
      {step === "review" ? (
        <ReviewView
          sections={project.sections}
          screenshots={project.screenshots}
          activeSectionId={activeSectionId}
          onActiveSection={setActiveSectionId}
          onSectionChange={updateSection}
          onBack={() => navigate("upload")}
          onContinue={() => navigate("compare")}
        />
      ) : null}
      {step === "compare" ? (
        <CompareView
          sections={project.sections}
          preferences={project.preferences}
          activeSectionId={activeSectionId}
          overlayIds={overlayIds}
          onPreferences={(preferences) => updateProject((current) => ({ ...current, preferences }))}
          onActiveSection={setActiveSectionId}
          onOverlay={setOverlayIds}
          onBack={() => navigate("review")}
          onExport={() => navigate("export")}
        />
      ) : null}
      {step === "export" ? (
        <ExportView
          sections={project.sections}
          preferences={project.preferences}
          activeSectionId={activeSectionId}
          onActiveSection={setActiveSectionId}
          onBack={() => navigate("compare")}
        />
      ) : null}
    </div>
  );
}
