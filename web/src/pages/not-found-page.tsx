import { Link } from "react-router-dom";

import { PageTitle } from "../components/page-title";

export function NotFoundPage() {
  return (
    <>
      <PageTitle
        eyebrow="Error / 404"
        title="Tool not found."
        description="The route may have moved, or this tool is not available."
      />
      <section className="not-found">
        <Link className="button button--primary" to="/">
          Return to tools
        </Link>
      </section>
    </>
  );
}
