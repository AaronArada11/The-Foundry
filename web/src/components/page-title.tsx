import type { ReactNode } from "react";

export function PageTitle({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
      </div>
      {description ? <p className="page-description">{description}</p> : null}
      {aside ? <div className="page-title-aside">{aside}</div> : null}
    </header>
  );
}
