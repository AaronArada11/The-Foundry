import { Suspense } from "react";
import {
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router-dom";

import { CatalogProvider, useCatalog } from "./catalog";
import { SiteFooter } from "./components/site-footer";
import { SiteHeader } from "./components/site-header";
import { AboutPage } from "./pages/about-page";
import { HomePage } from "./pages/home-page";
import { NotFoundPage } from "./pages/not-found-page";
import { ToolPlugin } from "./registry";

function ToolRoute() {
  const { slug = "" } = useParams();
  const { tools, loading } = useCatalog();
  if (loading) {
    return <div className="route-loading">Loading tool…</div>;
  }
  const manifest = tools.find((tool) => tool.slug === slug);
  if (!manifest) {
    return <NotFoundPage />;
  }
  return (
    <Suspense fallback={<div className="route-loading">Loading tool…</div>}>
      <ToolPlugin slug={slug} manifest={manifest} />
    </Suspense>
  );
}

function AppRoutes() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tools/:slug" element={<ToolRoute />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/tools" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}

export function App() {
  return (
    <CatalogProvider>
      <AppRoutes />
    </CatalogProvider>
  );
}
