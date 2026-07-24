import {
  createElement,
  lazy,
  type ComponentType,
  type LazyExoticComponent,
} from "react";

import type { ToolPageProps, ToolPluginModule } from "./types";

type PluginLoader = () => Promise<ToolPluginModule>;

const moduleLoaders = import.meta.glob<ToolPluginModule>("./tools/*/plugin.tsx");
const pluginLoaders = new Map<string, PluginLoader>();

for (const [path, loader] of Object.entries(moduleLoaders)) {
  const match = path.match(/\.\/tools\/([^/]+)\/plugin\.tsx$/);
  if (!match) {
    throw new Error(`Invalid tool plugin path: ${path}`);
  }
  const slug = match[1];
  if (pluginLoaders.has(slug)) {
    throw new Error(`Duplicate frontend tool plugin: ${slug}`);
  }
  pluginLoaders.set(slug, loader);
}

const pluginComponents = new Map<
  string,
  LazyExoticComponent<ComponentType<ToolPageProps>>
>();

for (const [slug, loader] of pluginLoaders) {
  pluginComponents.set(slug, lazy(loader));
}

export function ToolPlugin({
  slug,
  manifest,
}: {
  slug: string;
  manifest: ToolPageProps["manifest"];
}) {
  const Component = pluginComponents.get(slug);
  return Component ? createElement(Component, { manifest }) : null;
}

// Registry inspectors are exported for build-time validation and tests.
// eslint-disable-next-line react-refresh/only-export-components
export function frontendPluginIds(): string[] {
  return [...pluginLoaders.keys()].toSorted();
}

// eslint-disable-next-line react-refresh/only-export-components
export function validateCatalogPlugins(manifests: ToolPageProps["manifest"][]): void {
  const available = new Set(frontendPluginIds());
  const missing = manifests
    .filter((manifest) => manifest.availability === "available")
    .map((manifest) => manifest.id)
    .filter((id) => !available.has(id));
  if (missing.length) {
    throw new Error(`Missing frontend tool plugins: ${missing.join(", ")}`);
  }
}
