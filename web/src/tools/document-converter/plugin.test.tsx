import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { ToolManifest } from "../../types";
import DocumentConverterTool from "./plugin";

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
  id: "document-converter",
  slug: "document-converter",
  name: "Document Converter",
  description: "Convert documents.",
  sortOrder: 5,
  category: "Convert",
  tags: ["PDF", "DOCX", "Markdown"],
  icon: "file-doc",
  accent: "forest",
  executionType: "server-job",
  availability: "available",
};

describe("Document Converter tool", () => {
  it("offers every output format and starts a PDF to Markdown job", async () => {
    vi.stubGlobal("EventSource", EventSourceStub);
    uploadFormWithProgress.mockImplementation(
      async (
        _path: string,
        _body: FormData,
        onProgress: (progress: number) => void,
      ) => {
        onProgress(100);
        return {
          id: "document-job",
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
          eventsUrl: "/api/document-conversion-jobs/document-job/events",
        };
      },
    );
    render(<DocumentConverterTool manifest={manifest} />);

    await userEvent.upload(
      screen.getByLabelText("Source document"),
      new File(["%PDF-test"], "report.pdf", { type: "application/pdf" }),
    );
    expect(screen.getByRole("radio", { name: "PDF" })).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "Markdown" }));
    await userEvent.click(
      await screen.findByRole("button", { name: /Convert PDF to Markdown/i }),
    );

    expect(uploadFormWithProgress).toHaveBeenCalledOnce();
    const [path, body] = uploadFormWithProgress.mock.calls[0] as [string, FormData];
    expect(path).toBe("/api/document-conversion-jobs");
    expect(body.get("outputFormat")).toBe("md");
    expect(await screen.findByText("Job / queued")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Document conversion progress" }))
      .toHaveAttribute("aria-valuenow", "0");
  });
});
