import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { toolFixture } from "../../test/fixtures";
import QRGeneratorTool from "./plugin";

describe("QR generator tool", () => {
  it("submits labeled form values and exposes a download", async () => {
    const png = new Blob(["png"], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(png, {
          status: 200,
          headers: { "X-Artifact-Filename": "example-qr.png" },
        }),
      ),
    );
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:qr"),
      revokeObjectURL: vi.fn(),
    });

    render(<QRGeneratorTool manifest={toolFixture(1)} />);
    await userEvent.type(screen.getByLabelText("Link URL"), "https://example.com");
    await userEvent.click(screen.getByRole("button", { name: /generate qr/i }));

    expect(await screen.findByText("Output / Ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download png/i })).toHaveAttribute(
      "download",
      "example-qr.png",
    );
  });
});
