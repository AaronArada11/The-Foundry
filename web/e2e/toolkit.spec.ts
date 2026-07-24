import { expect, test } from "@playwright/test";

test("catalog loads, filters, and routes to a tool", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Aaron Toolkit");
  await expect(page.getByRole("heading", { name: "Tools I use." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open YouTube Downloader" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Link QR Generator" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Image Format Converter" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open PDF to Word" })).toBeVisible();

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
