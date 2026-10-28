"use client";

export class ApiError extends Error {
  status: number;
  issues: string[];
  log?: string;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown, issues: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.issues = issues;
    if (payload && typeof payload === "object" && "log" in payload && typeof payload.log === "string") {
      this.log = payload.log;
    }
  }
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiFetch<T>(url: string, options: ApiFetchOptions = {}): Promise<T> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(url, {
    method,
    headers,
    cache: "no-store",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  if (!response.ok) {
    const data = payload as { error?: string; issues?: { path?: string; message?: string }[]; log?: string };
    const issues = Array.isArray(data?.issues)
      ? data.issues.map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message ?? ""))
      : [];
    throw new ApiError(data?.error || `Richiesta non riuscita (HTTP ${response.status}).`, response.status, payload, issues);
  }
  return payload as T;
}

function filenameFromHeader(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : fallback;
}

export interface DownloadResult {
  filename: string;
  blob: Blob;
}

export async function downloadRequest(url: string, body: unknown, fallbackName: string): Promise<DownloadResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const payload: unknown = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");
    const data = payload as { error?: string; log?: string };
    throw new ApiError(data?.error || "Download non riuscito.", response.status, payload);
  }
  const blob = await response.blob();
  return {
    filename: filenameFromHeader(response.headers.get("content-disposition"), fallbackName),
    blob,
  };
}

export function triggerDownload(result: DownloadResult): void {
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadLabelFromDisposition(header: string | null): string | null {
  return header ? filenameFromHeader(header, "") : null;
}
