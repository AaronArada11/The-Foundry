import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { apiRequest } from "../../api/client";
import { toolFixture } from "../../test/fixtures";
import YouTubeDownloaderTool from "./plugin";

vi.mock("../../api/client", () => ({
  apiRequest: vi.fn(),
}));

class EventSourceStub {
  static instance: EventSourceStub | null = null;

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor() {
    EventSourceStub.instance = this;
  }
}

describe("YouTube downloader tool", () => {
  it("requires permission before enabling submission", async () => {
    render(<YouTubeDownloaderTool manifest={toolFixture(0)} />);
    const submit = screen.getByRole("button", { name: /start download/i });
    expect(submit).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText("YouTube URL"),
      "https://youtu.be/dQw4w9WgXcQ",
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /i have permission/i }),
    );
    expect(submit).toBeEnabled();
  });

  it("keeps a long-running job open while live progress reconnects", async () => {
    vi.stubGlobal("EventSource", EventSourceStub);
    vi.mocked(apiRequest).mockResolvedValue({
      id: "long-video",
      format: "mp4",
      status: "queued",
      progress: 0,
      title: null,
      durationSeconds: null,
      filename: null,
      downloadUrl: null,
      artifactExpiresAt: null,
      error: null,
      eventsUrl: "/api/download-jobs/long-video/events",
    });
    render(<YouTubeDownloaderTool manifest={toolFixture(0)} />);

    await userEvent.type(
      screen.getByLabelText("YouTube URL"),
      "https://youtu.be/dQw4w9WgXcQ",
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /i have permission/i }));
    await userEvent.click(screen.getByRole("button", { name: /start download/i }));

    EventSourceStub.instance?.onerror?.();

    expect(await screen.findByText("Live progress is reconnecting…")).toBeInTheDocument();
    expect(EventSourceStub.instance?.close).not.toHaveBeenCalled();
  });
});
