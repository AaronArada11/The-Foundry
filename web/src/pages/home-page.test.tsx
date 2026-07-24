import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { CatalogProvider } from "../catalog";
import { toolFixture } from "../test/fixtures";
import { filterTools, HomePage } from "./home-page";

function renderCatalog(count: number) {
  const tools = Array.from({ length: count }, (_, index) => toolFixture(index));
  render(
    <MemoryRouter>
      <CatalogProvider initialTools={tools}>
        <HomePage />
      </CatalogProvider>
    </MemoryRouter>,
  );
}

describe("registry-driven tool directory", () => {
  it.each([0, 1, 2, 20])("renders a %i-tool catalog", (count) => {
    renderCatalog(count);
    expect(
      screen.getByLabelText(
        `${count} active ${count === 1 ? "tool" : "tools"}`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: /open/i })).toHaveLength(count);
  });

  it("filters by name, category, and tag", () => {
    const tools = [toolFixture(0), toolFixture(1)];
    expect(filterTools(tools, "youtube", "all")).toHaveLength(1);
    expect(filterTools(tools, "test", "Generate")).toHaveLength(1);
    expect(filterTools(tools, "nothing", "all")).toHaveLength(0);
  });

  it("updates rendered results from search input", async () => {
    renderCatalog(2);
    await userEvent.type(
      screen.getByRole("searchbox", { name: /search tools/i }),
      "youtube",
    );
    expect(await screen.findByText("YouTube Downloader")).toBeInTheDocument();
    expect(screen.queryByText("Link QR Generator")).not.toBeInTheDocument();
  });
});
