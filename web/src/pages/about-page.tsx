import { PageTitle } from "../components/page-title";

export function AboutPage() {
  return (
    <>
      <PageTitle
        eyebrow="About / 02"
        title="Small tools. Sharp edges."
        description="Aaron Toolkit is a growing set of focused utilities with one shared, extensible interface."
      />
      <section className="about-grid">
        <div>
          <p className="section-index">01 / Purpose</p>
          <h2>Built to get out of the way.</h2>
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
