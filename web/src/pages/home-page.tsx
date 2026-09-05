import {
  ArrowRight,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";

import { useCatalog } from "../catalog";
import { BrandMark } from "../components/brand-mark";
import { ToolIcon } from "../components/tool-icon";
import type { ToolManifest } from "../types";

// Exported for catalog-scale tests without duplicating search behavior.
// eslint-disable-next-line react-refresh/only-export-components
export function filterTools(
  tools: ToolManifest[],
  query: string,
  category: string,
): ToolManifest[] {
  const normalized = query.trim().toLowerCase();
  return tools.filter((tool) => {
    if (category !== "all" && tool.category !== category) {
      return false;
    }
    if (!normalized) {
      return true;
    }
    const searchable = [
      tool.name,
      tool.description,
      tool.category,
      ...tool.tags,
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(normalized);
  });
}

function ToolCard({
  tool,
  index,
}: {
  tool: ToolManifest;
  index: number;
}) {
  return (
    <article className={`tool-card tool-card--${tool.accent}`}>
      <p className="tool-meta">
        {String(index + 1).padStart(2, "0")} / {tool.category}
      </p>
      <div className="tool-card-main">
        <div className="tool-icon-frame">
          <ToolIcon name={tool.icon} />
        </div>
        <div>
          <h2>{tool.name}</h2>
          <p>{tool.description}</p>
          <ul className="tag-list" aria-label={`${tool.name} capabilities`}>
            {tool.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        </div>
      </div>
      <Link
        className="tool-action"
        to={`/tools/${tool.slug}`}
        aria-label={`Open ${tool.name}`}
      >
        Open tool
        <ArrowRight size={22} aria-hidden="true" />
      </Link>
    </article>
  );
}

function CatalogLoading() {
  return (
    <div className="catalog-message" role="status">
      <span className="loading-line" />
      Loading tool registry…
    </div>
  );
}

export function HomePage() {
  const { tools, loading, error } = useCatalog();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const deferredQuery = useDeferredValue(query);
  const searchRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(
    () => [...new Set(tools.map((tool) => tool.category))].toSorted(),
    [tools],
  );
  const filteredTools = useMemo(
    () => filterTools(tools, deferredQuery, category),
    [tools, deferredQuery, category],
  );

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.key === "/" &&
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <>
      <header className="directory-title">
        <div className="hero-copy">
          <h1>Tools, forged for getting things done.</h1>
          <p>
            An all-in-one collection of simple, powerful tools for school, work,
            and everyday life.
          </p>
          <div className="hero-actions">
            <a className="button button--primary hero-cta" href="#tool-directory">
              Explore Tools
              <ArrowRight size={22} aria-hidden="true" />
            </a>
            <div
              aria-label={`${tools.length} active ${tools.length === 1 ? "tool" : "tools"}`}
              className="tool-count"
            >
              <strong>{tools.length}</strong> {tools.length === 1 ? "tool" : "tools"} and counting
            </div>
          </div>
        </div>
        <div className="foundry-blueprint" aria-hidden="true">
          <BrandMark />
        </div>
      </header>

      <section className="directory-controls" aria-label="Tool directory controls">
        <div className="directory-index">All / {tools.length}</div>
        <label className="search-control">
          <span>Search tools</span>
          <div>
            <MagnifyingGlass size={22} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, category, or tag"
            />
            <kbd>/</kbd>
          </div>
        </label>
      </section>

      {categories.length > 1 ? (
        <div className="category-filters" aria-label="Filter tools by category">
          <button
            className={category === "all" ? "is-active" : ""}
            type="button"
            onClick={() => setCategory("all")}
          >
            All
          </button>
          {categories.map((item) => (
            <button
              className={category === item ? "is-active" : ""}
              key={item}
              type="button"
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}

      <section
        id="tool-directory"
        className={query !== deferredQuery ? "tool-directory is-filtering" : "tool-directory"}
        aria-live="polite"
        aria-busy={query !== deferredQuery}
      >
        {loading ? <CatalogLoading /> : null}
        {error ? (
          <div className="catalog-message catalog-message--error" role="alert">
            <strong>The Foundry is temporarily unavailable.</strong>
            <span>{error}</span>
          </div>
        ) : null}
        {!loading && !error && tools.length === 0 ? (
          <div className="catalog-message">
            <strong>No tools are in the Foundry yet.</strong>
            <span>Add a validated tool manifest and feature plugin to begin.</span>
          </div>
        ) : null}
        {!loading && !error && tools.length > 0 && filteredTools.length === 0 ? (
          <div className="catalog-message">
            <strong>No matching tools.</strong>
            <span>Try another name, category, or tag.</span>
            <button
              className="text-action"
              type="button"
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : null}
        {filteredTools.length > 0 ? (
          <div className="tool-grid">
            {filteredTools.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                index={tools.findIndex((item) => item.id === tool.id)}
              />
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
