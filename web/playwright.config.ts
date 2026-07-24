import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "npm run build && ../.venv/bin/uvicorn aaron_toolkit.app:app --host 127.0.0.1 --port 8000",
    url: "http://127.0.0.1:8000/api/health",
    timeout: 120_000,
    reuseExistingServer: true,
  },
  projects: [
    { name: "mobile-375", use: { viewport: { width: 375, height: 900 } } },
    { name: "tablet-768", use: { viewport: { width: 768, height: 1000 } } },
    { name: "desktop-1024", use: { viewport: { width: 1024, height: 900 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
