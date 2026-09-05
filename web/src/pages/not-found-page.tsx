import { Link } from "react-router-dom";

import { PageTitle } from "../components/page-title";

export function NotFoundPage() {
  return (
    <>
      <PageTitle
        eyebrow="404 / Not found"
        title="Tool not found."
        description="This route may have moved, or the tool is not currently available in Foundry."
      />
      <section className="not-found">
        <Link className="button button--primary" to="/">
          Explore all tools
        </Link>
      </section>
    </>
  );
}
