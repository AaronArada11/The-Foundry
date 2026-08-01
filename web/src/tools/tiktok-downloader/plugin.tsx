import { MediaDownloaderWorkspace } from "../../components/media-downloader-workspace";
import type { ToolPageProps } from "../../types";

export default function TikTokDownloaderTool({ manifest }: ToolPageProps) {
  return (
    <MediaDownloaderWorkspace
      manifest={manifest}
      platform="TikTok"
      eyebrow="Tools / 02"
      endpoint="/api/tiktok-download-jobs"
      placeholder="https://www.tiktok.com/@creator/video/…"
      accent="gold"
    />
  );
}
