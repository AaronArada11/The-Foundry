import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { toolFixture } from "../../test/fixtures";
import YouTubeDownloaderTool from "./plugin";

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
});
