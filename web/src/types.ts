import type { ComponentType } from "react";

export type ToolAccent = "coral" | "mint" | "gold" | "forest";
export type ExecutionType = "client" | "server-sync" | "server-job";

export interface ToolManifest {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  category: string;
  tags: string[];
  icon: string;
  accent: ToolAccent;
  executionType: ExecutionType;
  availability: "available" | "maintenance" | "coming-soon";
}

export interface HealthStatus {
  status: "online" | "degraded";
  queue: "redis" | "local";
  storage: "s3" | "local";
}

export interface ToolPageProps {
  manifest: ToolManifest;
}

export interface ToolPluginModule {
  default: ComponentType<ToolPageProps>;
}
