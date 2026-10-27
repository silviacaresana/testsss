/**
 * Estrazione del testo dai PDF tramite pdf.js.
 *
 * Usata sia dall'import assistito dei programmi sia dal controllo qualità
 * degli esempi. Il modulo viene caricato dinamicamente perché il build
 * "legacy" di pdf.js va eseguito solo lato server (runtime Node).
 */

export interface ExtractedPdfText {
  text: string;
  pages: number;
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPdfText(data: Uint8Array): Promise<ExtractedPdfText> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Copia difensiva: pdf.js può trasferire il buffer a un worker.
  const pdf = await getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  const pages = pdf.numPages;
  const pageTexts: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pieces: string[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        pieces.push(item.str);
        if (item.hasEOL) pieces.push("\n");
      }
      const pageText = normalizeText(pieces.join(" "));
      if (pageText) pageTexts.push(pageText);
    }
  } finally {
    await pdf.destroy();
  }

  return { text: pageTexts.join("\n\n"), pages };
}
