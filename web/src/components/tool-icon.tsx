import {
  Code,
  FileDoc,
  ImageSquare,
  QrCode,
  Video,
  type Icon,
} from "@phosphor-icons/react";

const icons: Record<string, Icon> = {
  code: Code,
  "file-doc": FileDoc,
  "image-square": ImageSquare,
  "qr-code": QrCode,
  video: Video,
};

export function ToolIcon({
  name,
  size = 42,
}: {
  name: string;
  size?: number;
}) {
  const Component = icons[name] ?? Code;
  return <Component size={size} weight="regular" aria-hidden="true" />;
}
