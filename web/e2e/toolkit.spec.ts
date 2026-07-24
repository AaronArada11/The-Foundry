import { expect, test } from "@playwright/test";

test("catalog loads, filters, and routes to a tool", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Aaron Toolkit");
  await expect(page.getByRole("heading", { name: "Tools I use." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open YouTube Downloader" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Link QR Generator" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search tools" }).fill("QR");
  await expect(page.getByRole("link", { name: "Open Link QR Generator" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open YouTube Downloader" })).toHaveCount(0);

  await page.getByRole("link", { name: "Open Link QR Generator" }).click();
  await expect(page).toHaveURL(/\/tools\/link-qr-generator$/);
  await expect(page.getByRole("heading", { name: "Link QR Generator" })).toBeVisible();
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
});

test("supports keyboard focus and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeVisible();

  const transitionDuration = await page
    .getByRole("link", { name: "Open YouTube Downloader" })
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001);
});
