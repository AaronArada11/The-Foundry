import type { HealthStatus, ToolManifest } from "../types";

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = "The request could not be completed.";
    try {
      const payload = (await response.json()) as {
        detail?: string | { message?: string };
      };
      if (typeof payload.detail === "string") {
        message = payload.detail;
      } else if (payload.detail?.message) {
        message = payload.detail.message;
      }
    } catch {
      // Keep the stable fallback message for non-JSON errors.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as {
      detail?: string | { message?: string };
    };
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
    if (payload.detail?.message) {
      return payload.detail.message;
    }
  } catch {
    // Keep the caller's recovery-oriented fallback.
  }
  return fallback;
}

export function downloadFilename(response: Response, fallback: string): string {
  return (
    response.headers.get("X-Artifact-Filename") ||
    response.headers
      .get("Content-Disposition")
      ?.match(/filename="?([^"]+)"?/)?.[1] ||
    fallback
  );
}

export function uploadFormWithProgress<T>(
  path: string,
  body: FormData,
  onProgress: (progress: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", path);
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      const payload = request.response as
        | T
        | { detail?: string | { message?: string } }
        | null;
      if (request.status >= 200 && request.status < 300 && payload) {
        resolve(payload as T);
        return;
      }
      const detail =
        payload && typeof payload === "object" && "detail" in payload
          ? payload.detail
          : null;
      reject(
        new Error(
          typeof detail === "string"
            ? detail
            : detail?.message || "The upload could not be completed.",
        ),
      );
    });
    request.addEventListener("error", () => {
      reject(new Error("The upload was interrupted. Check your connection and try again."));
    });
    request.send(body);
  });
}

export function fetchTools(signal?: AbortSignal): Promise<ToolManifest[]> {
  return apiRequest<ToolManifest[]>("/api/tools", { signal });
}

export function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  return apiRequest<HealthStatus>("/api/health", { signal });
}
