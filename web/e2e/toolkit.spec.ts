import { expect, test } from "@playwright/test";

test("catalog loads, filters, and routes to a tool", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Foundry — Tools, forged for getting things done.");
  await expect(
    page.getByRole("heading", { name: "Tools, forged for getting things done." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open YouTube Downloader" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open TikTok Downloader" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Link QR Generator" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Image Format Converter" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Document Converter" })).toBeVisible();

  const columnCount = await page
    .locator(".tool-grid")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columnCount).toBe(1);

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

test("document workflow converts PDF to Markdown and exposes the result", async ({ page }) => {
  const job = {
    id: "visual-document-job",
    kind: "document-conversion",
    status: "queued",
    progress: 0,
    sourceFilename: "report.pdf",
    inputFormat: "pdf",
    outputFormat: "md",
    filename: null,
    downloadUrl: null,
    artifactExpiresAt: null,
    error: null,
    eventsUrl: "/api/document-conversion-jobs/visual-document-job/events",
  };
  await page.route("**/api/document-conversion-jobs", async (route) => {
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(job) });
  });
  await page.route("**/api/document-conversion-jobs/visual-document-job/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({
        ...job,
        status: "ready",
        progress: 100,
        filename: "report.md",
        downloadUrl: "/mock-report.md",
      })}\n\n`,
    });
  });
  await page.goto("/tools/document-converter");
  await page.getByLabel("Source document").setInputFiles({
    name: "report.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-mocked"),
  });
  await page.getByText("Markdown", { exact: true }).click();
  await page.getByRole("button", { name: "Convert PDF to Markdown" }).click();

  await expect(page.getByText("Markdown document ready")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download Markdown" })).toHaveAttribute(
    "href",
    "/mock-report.md",
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

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tools, forged for getting things done." }),
  ).toBeVisible();
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

  await page.goto("/tools/document-converter");
  await expect(page.getByRole("heading", { name: "Document Converter" })).toBeVisible();
  await page.screenshot({ path: `${prefix}-document-waiting.png`, fullPage: true });
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
