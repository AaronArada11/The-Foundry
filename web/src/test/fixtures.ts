import type { ToolManifest } from "../types";

export function toolFixture(index: number): ToolManifest {
  const known =
    index === 0
      ? {
          id: "youtube-downloader",
          name: "YouTube Downloader",
          category: "Media",
          icon: "video",
          accent: "coral" as const,
        }
      : index === 1
        ? {
            id: "link-qr-generator",
            name: "Link QR Generator",
            category: "Generate",
            icon: "qr-code",
            accent: "mint" as const,
          }
        : index === 2
          ? {
              id: "image-format-converter",
              name: "Image Format Converter",
              category: "Convert",
              icon: "image-square",
              accent: "gold" as const,
            }
        : {
            id: `test-tool-${index + 1}`,
            name: `Test Tool ${index + 1}`,
            category: index % 2 ? "Generate" : "Utility",
            icon: "code",
            accent: "forest" as const,
          };
  return {
    id: known.id,
    slug: known.id,
    name: known.name,
    description: `Description for ${known.name}.`,
    sortOrder: index + 1,
    category: known.category,
    tags: ["TEST"],
    icon: known.icon,
    accent: known.accent,
    executionType: "client",
    availability: "available",
  };
}
