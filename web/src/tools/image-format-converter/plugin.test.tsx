import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { ToolManifest } from "../../types";
import ImageFormatConverter from "./plugin";

const manifest: ToolManifest = {
  id: "image-format-converter",
  slug: "image-format-converter",
  name: "Image Format Converter",
  description: "Convert images.",
  sortOrder: 3,
  category: "Convert",
  tags: ["JPG", "PNG", "WEBP"],
  icon: "image-square",
  accent: "gold",
  executionType: "server-sync",
  availability: "available",
};

describe("image format converter", () => {
  it("uploads, reveals format controls, and exposes the converted download", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Blob(["converted"], { type: "image/jpeg" }), {
        status: 200,
        headers: {
          "X-Artifact-Filename": "portrait.jpg",
          "X-Image-Width": "100",
          "X-Image-Height": "80",
        },
      }),
    );
    render(<ImageFormatConverter manifest={manifest} />);

    await userEvent.upload(
      screen.getByLabelText("Source image"),
      new File(["image"], "portrait.png", { type: "image/png" }),
    );
    await userEvent.click(screen.getByLabelText(/jpg/i));

    expect(screen.getByLabelText(/Quality/)).toBeInTheDocument();
    expect(screen.getByLabelText("Transparency background")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Convert image/i }));

    expect(await screen.findByText("Output / Ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download JPG" })).toHaveAttribute(
      "download",
      "portrait.jpg",
    );
  });
});
