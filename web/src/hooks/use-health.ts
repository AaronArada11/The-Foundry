import { useEffect, useState } from "react";

import { fetchHealth } from "../api/client";
import type { HealthStatus } from "../types";

export function useHealth(): HealthStatus["status"] {
  const [status, setStatus] = useState<HealthStatus["status"]>("degraded");

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((health) => setStatus(health.status))
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus("degraded");
        }
      });
    return () => controller.abort();
  }, []);

  return status;
}
