/**
 * Compilazione LaTeX → PDF.
 *
 * Su Cloudflare Workers non si possono avviare programmi esterni (pdfLaTeX, Tectonic), quindi
 * in questa versione il server NON produce PDF: restano scaricabili i sorgenti .tex (verifica,
 * soluzioni, griglia) e il JSON, e l'anteprima HTML permette di stampare dal browser.
 *
 * Le funzioni mantengono la forma di prima, così il resto del codice (esportazione, anteprima,
 * ZIP) non cambia: la compilazione risulta semplicemente «non disponibile».
 */

export interface CompileResult {
  ok: boolean;
  pdf: Buffer | null;
  log: string;
  engine: string;
  durationMs: number;
  timedOut: boolean;
  unavailable: boolean;
}

export interface CompileOptions {
  sourceDateEpoch?: number;
  extraFiles?: { name: string; path: string }[];
  keepDir?: boolean;
  timeoutMs?: number;
}

const UNAVAILABLE_MESSAGE =
  "La compilazione dei PDF sul server non è attiva in questa versione. Scarica il file .tex e compilalo " +
  "(ad esempio con Overleaf o pdfLaTeX), oppure usa «Stampa / Salva come PDF» dall'anteprima.";

export async function latexAvailability(
  _force = false,
): Promise<{ engine: string; ok: boolean; message: string }> {
  return { engine: "nessuno", ok: false, message: UNAVAILABLE_MESSAGE };
}

export async function compileLatex(_source: string, _options: CompileOptions = {}): Promise<CompileResult> {
  return {
    ok: false,
    pdf: null,
    log: UNAVAILABLE_MESSAGE,
    engine: "nessuno",
    durationMs: 0,
    timedOut: false,
    unavailable: true,
  };
}

export function engineVersionLabel(): string {
  return "nessuno";
}
