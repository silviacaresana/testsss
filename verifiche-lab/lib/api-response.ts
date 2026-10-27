import { NextResponse } from "next/server";

export function fileResponse(
  buffer: Buffer,
  filename: string,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,
      "content-length": String(buffer.length),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function inlineResponse(
  buffer: Buffer,
  contentType: string,
  filename: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline' /katex/katex.min.css; font-src /katex/fonts; img-src data:; form-action 'none'; frame-ancestors 'self'",
    },
  });
}

export type RouteParams<T extends string> = { params: Promise<Record<T, string>> };

export function errorMessage(error: unknown, fallback = "Errore imprevisto."): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

export function isPermissionError(message: string): boolean {
  return /permess|sola lettura|non sei l'autore|non trovata|non trovato/i.test(message);
}

export function asNext(response: Response): NextResponse {
  return response as unknown as NextResponse;
}

/** Risposta JSON uniforme per gli errori dei servizi (generazione, export, permessi). */
export function routeError(error: unknown, fallback = "Errore imprevisto."): NextResponse {
  const value = error as {
    name?: string;
    message?: string;
    issues?: string[];
    warnings?: string[];
    log?: string;
    engine?: string;
  };
  const message = value?.message || fallback;
  const issues = Array.isArray(value?.issues) ? value.issues : [];
  const warnings = Array.isArray(value?.warnings) ? value.warnings : [];

  if (value?.name === "GenerationError") {
    return NextResponse.json({ error: message, issues, warnings, keepWizardData: true }, { status: 422 });
  }
  if (value?.name === "ExportError") {
    return NextResponse.json(
      { error: message, log: value.log ?? "", engine: value.engine ?? "", canDownloadTex: true },
      { status: 422 },
    );
  }
  if (/sessione|accesso|login/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 401 });
  }
  if (isPermissionError(message)) {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  if (/non trovat/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  return NextResponse.json({ error: message }, { status: 500 });
}
