import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { ToolManifest } from "../../types";
import PDFToWordTool from "./plugin";

const uploadFormWithProgress = vi.fn();

vi.mock("../../api/client", () => ({
  apiRequest: vi.fn(),
  uploadFormWithProgress: (
    path: string,
    body: FormData,
    onProgress: (progress: number) => void,
  ) => uploadFormWithProgress(path, body, onProgress),
}));

class EventSourceStub {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
}

const manifest: ToolManifest = {
  id: "pdf-to-word",
  slug: "pdf-to-word",
  name: "PDF to Word",
  description: "Convert a PDF.",
  sortOrder: 4,
  category: "Convert",
  tags: ["PDF", "DOCX"],
  icon: "file-doc",
  accent: "forest",
  executionType: "server-job",
  availability: "available",
};

describe("PDF to Word tool", () => {
  it("uploads a PDF and starts the background job", async () => {
    vi.stubGlobal("EventSource", EventSourceStub);
    uploadFormWithProgress.mockImplementation(
      async (
        _path: string,
        _body: FormData,
        onProgress: (progress: number) => void,
      ) => {
        onProgress(100);
        return {
          id: "pdf-job",
          kind: "pdf-to-word",
          status: "queued",
          progress: 0,
          sourceFilename: "report.pdf",
          filename: null,
          downloadUrl: null,
          artifactExpiresAt: null,
          error: null,
          eventsUrl: "/api/pdf-to-word-jobs/pdf-job/events",
        };
      },
    );
    render(<PDFToWordTool manifest={manifest} />);

    await userEvent.upload(
      screen.getByLabelText("Source PDF"),
      new File(["%PDF-test"], "report.pdf", { type: "application/pdf" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /Convert to Word/i }),
    );

    expect(uploadFormWithProgress).toHaveBeenCalledOnce();
    expect(await screen.findByText("Job / queued")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "PDF conversion progress" }))
      .toHaveAttribute("aria-valuenow", "0");
  });
});
