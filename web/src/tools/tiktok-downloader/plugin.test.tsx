import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { toolFixture } from "../../test/fixtures";
import TikTokDownloaderTool from "./plugin";

describe("TikTok downloader tool", () => {
  it("requires permission before enabling submission", async () => {
    render(<TikTokDownloaderTool manifest={toolFixture(1)} />);
    const submit = screen.getByRole("button", { name: /start download/i });
    expect(submit).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText("TikTok URL"),
      "https://www.tiktok.com/@creator/video/7461234567890123456",
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /i have permission/i }),
    );
    expect(submit).toBeEnabled();
  });
});
