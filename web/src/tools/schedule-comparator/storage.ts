import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { ScheduleProject } from "./models";

interface ScheduleDatabase extends DBSchema {
  projects: { key: string; value: ScheduleProject; indexes: { "by-updated": string } };
  images: { key: string; value: Blob };
}

let databasePromise: Promise<IDBPDatabase<ScheduleDatabase>> | null = null;
const memoryProjects = new Map<string, ScheduleProject>();
const memoryImages = new Map<string, Blob>();

function database(): Promise<IDBPDatabase<ScheduleDatabase>> {
  if (!databasePromise) {
    databasePromise = openDB<ScheduleDatabase>("aaron-schedule-comparator", 1, {
      upgrade(db) {
        const projects = db.createObjectStore("projects", { keyPath: "id" });
        projects.createIndex("by-updated", "updatedAt");
        db.createObjectStore("images");
      },
    });
  }
  return databasePromise;
}

function persistedProject(project: ScheduleProject): ScheduleProject {
  return {
    ...project,
    screenshots: project.screenshots.map((item) => ({ ...item, previewUrl: "" })),
  };
}

export async function saveProject(project: ScheduleProject): Promise<"indexeddb" | "memory"> {
  const safe = persistedProject(project);
  memoryProjects.set(project.id, safe);
  try {
    const db = await database();
    await db.put("projects", safe);
    return "indexeddb";
  } catch {
    return "memory";
  }
}

export async function saveScreenshot(id: string, blob: Blob): Promise<"indexeddb" | "memory"> {
  memoryImages.set(id, blob);
  try {
    const db = await database();
    await db.put("images", blob, id);
    return "indexeddb";
  } catch {
    return "memory";
  }
}

export async function loadProject(id: string): Promise<ScheduleProject | null> {
  let project = memoryProjects.get(id) ?? null;
  try {
    project = (await (await database()).get("projects", id)) ?? project;
  } catch {
    // In-memory state remains available when storage is blocked.
  }
  if (!project || project.version !== 1) return null;
  const screenshots = await Promise.all(project.screenshots.map(async (item) => {
    const blob = await loadScreenshot(item.id);
    return { ...item, previewUrl: blob ? URL.createObjectURL(blob) : "" };
  }));
  return { ...project, screenshots };
}

export async function loadScreenshot(id: string): Promise<Blob | null> {
  let blob = memoryImages.get(id) ?? null;
  try {
    blob = (await (await database()).get("images", id)) ?? blob;
  } catch {
    // In-memory image remains available when storage is blocked.
  }
  return blob;
}

export async function deleteScreenshot(id: string): Promise<void> {
  memoryImages.delete(id);
  try {
    await (await database()).delete("images", id);
  } catch {
    // Deleting the in-memory copy still releases it for this session.
  }
}

export async function deleteProject(project: ScheduleProject): Promise<void> {
  memoryProjects.delete(project.id);
  for (const screenshot of project.screenshots) memoryImages.delete(screenshot.id);
  try {
    const db = await database();
    const transaction = db.transaction(["projects", "images"], "readwrite");
    await transaction.objectStore("projects").delete(project.id);
    await Promise.all(project.screenshots.map((item) => transaction.objectStore("images").delete(item.id)));
    await transaction.done;
  } catch {
    // Deleting in memory is still useful in privacy-restricted browsers.
  }
}
