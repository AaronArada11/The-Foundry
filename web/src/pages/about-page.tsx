import { PageTitle } from "../components/page-title";

export function AboutPage() {
  return (
    <>
      <PageTitle
        eyebrow="About Foundry"
        title="Built for the task at hand."
        description="Foundry brings focused, dependable utilities together in one shared, extensible interface."
      />
      <section className="about-grid">
        <div>
          <p className="section-index">Purpose</p>
          <h2>A practical workshop for everyday work.</h2>
        </div>
        <div className="about-copy">
          <p>
            Each tool owns its workflow, while the catalog, navigation, status,
            accessibility, and deployment foundation remain shared.
          </p>
          <p>
            The directory is generated from validated manifests, so new tools
            appear automatically without redesigning the homepage.
          </p>
          <p>
            Only use media tools for content you have permission to download,
            and follow the source platform&apos;s terms and applicable laws.
          </p>
        </div>
      </section>
    </>
  );
}
