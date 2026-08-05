import { expect, test } from "@playwright/test";

test("catalog loads, filters, and routes to a tool", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Aaron Toolkit");
  await expect(page.getByRole("heading", { name: "Tools I use." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open YouTube Downloader" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open TikTok Downloader" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Link QR Generator" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Image Format Converter" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open PDF to Word" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Schedule Comparator" })).toBeVisible();

  const columnCount = await page
    .locator(".tool-grid")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columnCount).toBe((page.viewportSize()?.width ?? 0) < 768 ? 1 : 2);

  await page.getByRole("searchbox", { name: "Search tools" }).fill("QR");
  await expect(page.getByRole("link", { name: "Open Link QR Generator" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open YouTube Downloader" })).toHaveCount(0);

  await page.getByRole("link", { name: "Open Link QR Generator" }).click();
  await expect(page).toHaveURL(/\/tools\/link-qr-generator$/);
  await expect(page.getByRole("heading", { name: "Link QR Generator" })).toBeVisible();
});

test("image workflow converts and exposes a download", async ({ page }) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8DQwMDAwMAEIkAYABglAYOd/VRoAAAAAElFTkSuQmCC",
    "base64",
  );
  await page.goto("/tools/image-format-converter");
  await page.getByLabel("Source image").setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByText("JPG", { exact: true }).click();
  await page.getByRole("button", { name: "Convert image" }).click();

  await expect(page.getByText("Output / Ready")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download JPG" })).toHaveAttribute(
    "download",
    "pixel.jpg",
  );
});

test("PDF workflow uploads, reports progress, and exposes DOCX", async ({ page }) => {
  const job = {
    id: "visual-pdf-job",
    kind: "pdf-to-word",
    status: "queued",
    progress: 0,
    sourceFilename: "report.pdf",
    filename: null,
    downloadUrl: null,
    artifactExpiresAt: null,
    error: null,
    eventsUrl: "/api/pdf-to-word-jobs/visual-pdf-job/events",
  };
  await page.route("**/api/pdf-to-word-jobs", async (route) => {
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(job) });
  });
  await page.route("**/api/pdf-to-word-jobs/visual-pdf-job/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({
        ...job,
        status: "ready",
        progress: 100,
        filename: "report.docx",
        downloadUrl: "/mock-report.docx",
      })}\n\n`,
    });
  });
  await page.goto("/tools/pdf-to-word");
  await page.getByLabel("Source PDF").setInputFiles({
    name: "report.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-mocked"),
  });
  await page.getByRole("button", { name: "Convert to Word" }).click();

  await expect(page.getByText("Word document ready")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download DOCX" })).toHaveAttribute(
    "href",
    "/mock-report.docx",
  );
});

test("QR workflow generates and exposes a PNG download", async ({ page }) => {
  await page.goto("/tools/link-qr-generator");
  await page.getByLabel("Link URL").fill("https://example.com");
  await page.getByRole("button", { name: "Generate QR" }).click();

  await expect(page.getByText("Output / Ready")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PNG" })).toHaveAttribute(
    "download",
    "example.com-qr.png",
  );
  await expect(page.locator("main")).not.toHaveCSS("overflow-x", "scroll");
});

test("schedule comparator reviews, overlays, recommends, and exports", async ({ page }) => {
  await page.goto("/tools/schedule-comparator");
  const now = new Date().toISOString();
  const confidence = {
    subject: 96, name: 96, days: 96, start: 96, end: 96,
    room: 96, instructor: 100, units: 96, overall: 96,
  };
  const makeClass = (id: string, sourceImageId: string, subject: string, name: string, days: string[], start: string, end: string, room: string) => ({
    id, sourceImageId, subject, name, days, start, end, room,
    instructor: "", units: 3, confidence,
  });
  const project = {
    version: 1,
    id: "project-e2e-schedule",
    title: "Schedule comparison",
    createdAt: now,
    updatedAt: now,
    screenshots: ["a", "b"].map((id) => ({
      id: `shot-${id}`, name: `CS3${id.toUpperCase()}.png`, type: "image/png",
      size: 68, width: 1200, height: 800, previewUrl: "", status: "ready",
      progress: 100, error: null, averageConfidence: 96,
    })),
    sections: [
      {
        id: "section-a", name: "CS3A", color: "#3BCB75", screenshotId: "shot-a",
        classes: [
          makeClass("a1", "shot-a", "CS101", "Mobile Programming", ["Mon", "Wed"], "08:00", "09:30", "LAB203"),
          makeClass("a2", "shot-a", "MATH53", "Discrete Math", ["Tue", "Thu"], "10:00", "11:30", "SCI101"),
          makeClass("a3", "shot-a", "CS303", "Algorithms", ["Fri"], "15:00", "18:00", "LAB204"),
        ],
      },
      {
        id: "section-b", name: "CS3B", color: "#2784C7", screenshotId: "shot-b",
        classes: [
          makeClass("b1", "shot-b", "CS101", "Mobile Programming", ["Mon", "Wed"], "09:00", "10:30", "LAB203"),
          makeClass("b2", "shot-b", "MATH53", "Discrete Math", ["Tue", "Thu"], "13:00", "14:30", "SCI101"),
          makeClass("b3", "shot-b", "CS303", "Algorithms", ["Fri"], "13:00", "16:00", "LAB204"),
        ],
      },
    ],
    preferences: {
      preset: "balanced",
      weights: { start: 15, dismissal: 20, campus: 20, idle: 20, days: 10, weekend: 15 },
      noSaturday: false, noClassesBefore: "", noClassesAfter: "", idleDirection: "minimum",
    },
  };

  await page.evaluate(async (seed) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("aaron-schedule-comparator", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const projects = db.createObjectStore("projects", { keyPath: "id" });
        projects.createIndex("by-updated", "updatedAt");
        db.createObjectStore("images");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(["projects", "images"], "readwrite");
        transaction.objectStore("projects").put(seed);
        for (const screenshot of seed.screenshots) {
          transaction.objectStore("images").put(new Blob(["fixture"], { type: "image/png" }), screenshot.id);
        }
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    localStorage.setItem("aaron-toolkit:schedule-project", seed.id);
    localStorage.setItem("aaron-toolkit:schedule-step", "upload");
  }, project);
  await page.reload();

  await expect(page.getByText("CS3A.png", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review extracted classes" }).click();
  await expect(page.getByLabel("Section name")).toHaveValue("CS3A");
  await page.getByRole("button", { name: "Compare 2 sections" }).click();
  await expect(page.getByRole("heading", { name: /best matches your preferences/i })).toBeVisible();

  await page.getByRole("checkbox", { name: "CS3A" }).check();
  await page.getByRole("checkbox", { name: "CS3B" }).check();
  await expect(page.getByText(/overlapping class meeting/)).toBeVisible();
  await page.getByRole("button", { name: "Recommend best" }).click();
  await expect(page.getByText("Match score", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Export comparison" }).click();
  await expect(page.getByRole("heading", { name: "Your comparison is ready." })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  await expect((await download).suggestedFilename()).toBe("schedule-comparison.csv");
});

test("TikTok workflow accepts a permitted individual video URL", async ({ page }) => {
  await page.goto("/tools/tiktok-downloader");
  await page
    .getByLabel("TikTok URL")
    .fill("https://www.tiktok.com/@creator/video/7461234567890123456");
  await page.getByRole("checkbox", { name: "I have permission to download this media." }).check();

  await expect(page.getByRole("button", { name: "Start download" })).toBeEnabled();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("captures responsive visual references", async ({ page }, testInfo) => {
  const prefix = `../qa/visual/${testInfo.project.name}`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tools I use." })).toBeVisible();
  await page.screenshot({ path: `${prefix}-directory.png`, fullPage: true });

  await page.goto("/tools/link-qr-generator");
  await page.getByLabel("Link URL").fill("https://example.com/toolkit");
  await page.getByRole("button", { name: "Generate QR" }).click();
  await expect(page.getByText("Output / Ready")).toBeVisible();
  await page.screenshot({ path: `${prefix}-qr-ready.png`, fullPage: true });

  await page.goto("/tools/youtube-downloader");
  await expect(page.getByRole("heading", { name: "YouTube Downloader" })).toBeVisible();
  await page.screenshot({ path: `${prefix}-media-waiting.png`, fullPage: true });

  await page.goto("/tools/tiktok-downloader");
  await expect(page.getByRole("heading", { name: "TikTok Downloader" })).toBeVisible();
  await page.screenshot({ path: `${prefix}-tiktok-waiting.png`, fullPage: true });

  await page.goto("/tools/image-format-converter");
  await expect(page.getByRole("heading", { name: "Image Format Converter" })).toBeVisible();
  await page.screenshot({ path: `${prefix}-image-waiting.png`, fullPage: true });

  await page.goto("/tools/pdf-to-word");
  await expect(page.getByRole("heading", { name: "PDF to Word" })).toBeVisible();
  await page.screenshot({ path: `${prefix}-pdf-waiting.png`, fullPage: true });
});

test("supports keyboard focus and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeVisible();

  const transitionDuration = await page
    .getByRole("link", { name: "Open Image Format Converter" })
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001);
});
