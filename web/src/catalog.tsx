import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { fetchTools } from "./api/client";
import { validateCatalogPlugins } from "./registry";
import type { ToolManifest } from "./types";

interface CatalogState {
  tools: ToolManifest[];
  loading: boolean;
  error: string | null;
}

const CatalogContext = createContext<CatalogState | null>(null);

export function CatalogProvider({
  children,
  initialTools,
}: {
  children: ReactNode;
  initialTools?: ToolManifest[];
}) {
  const [state, setState] = useState<CatalogState>({
    tools: initialTools ?? [],
    loading: !initialTools,
    error: null,
  });

  useEffect(() => {
    if (initialTools) {
      return;
    }
    const controller = new AbortController();
    fetchTools(controller.signal)
      .then((tools) => {
        validateCatalogPlugins(tools);
        setState({ tools, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            tools: [],
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "The tool registry could not be loaded.",
          });
        }
      });
    return () => controller.abort();
  }, [initialTools]);

  const value = useMemo(() => state, [state]);
  return (
    <CatalogContext.Provider value={value}>
      {children}
    </CatalogContext.Provider>
  );
}

// Context hooks intentionally live beside their provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useCatalog(): CatalogState {
  const context = useContext(CatalogContext);
  if (!context) {
    throw new Error("useCatalog must be used inside CatalogProvider");
  }
  return context;
}
