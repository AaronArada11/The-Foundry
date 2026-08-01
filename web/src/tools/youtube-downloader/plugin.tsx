import { MediaDownloaderWorkspace } from "../../components/media-downloader-workspace";
import type { ToolPageProps } from "../../types";

export default function YouTubeDownloaderTool({ manifest }: ToolPageProps) {
  return (
    <MediaDownloaderWorkspace
      manifest={manifest}
      platform="YouTube"
      eyebrow="Tools / 01"
      endpoint="/api/download-jobs"
      placeholder="https://www.youtube.com/watch?v=…"
      accent="coral"
    />
  );
}
