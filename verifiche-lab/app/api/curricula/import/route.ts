import { NextResponse } from "next/server";
import JSZip from "jszip";
import { z } from "zod";
import { guardApi, jsonError, zodError } from "@/lib/api";
import { importCurriculum } from "@/lib/curriculum/import";
import { getAiConfig } from "@/lib/ai/config";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  text: z.string().max(200_000).optional().default(""),
  track: z.enum(["classico", "scientifico"]),
  year: z.coerce.number().int().min(1).max(5),
  subject: z.enum(["matematica", "fisica"]),
  title: z.string().trim().min(3).max(160),
  notes: z.string().max(2000).optional().default(""),
});

async function textFromDocx(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("Il file DOCX non contiene word/document.xml.");
  const xml = await entry.async("string");
  return xml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function textFromPdf(buffer: ArrayBuffer): Promise<string> {
  const { extractPdfText } = await import("@/lib/pdf/text");
  const result = await extractPdfText(new Uint8Array(buffer));
  return result.text;
}

async function readUpload(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (name.endsWith(".docx")) return textFromDocx(buffer);
  if (name.endsWith(".pdf")) return textFromPdf(buffer);
  if (name.endsWith(".doc")) {
    throw new Error("Il formato .doc (Word 97-2003) non è supportato: salva il file come .docx o PDF.");
  }
  return new TextDecoder("utf-8").decode(buffer);
}

export async function POST(request: Request) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;

  const contentType = request.headers.get("content-type") ?? "";
  let payload: unknown;
  let uploadedText = "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      payload = {
        text: String(form.get("text") ?? ""),
        track: form.get("track"),
        year: form.get("year"),
        subject: form.get("subject"),
        title: form.get("title"),
        notes: String(form.get("notes") ?? ""),
      };
      if (file instanceof File && file.size > 0) {
        if (file.size > 12 * 1024 * 1024) {
          return jsonError("Il file supera il limite di 12 MB.", 413);
        }
        uploadedText = await readUpload(file);
      }
    } else {
      payload = await request.json();
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? `Impossibile leggere il file: ${error.message}` : "Richiesta non valida.",
      400,
    );
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);
  const text = [parsed.data.text, uploadedText].filter((part) => part && part.trim()).join("\n\n").trim();
  if (text.length < 40) {
    return jsonError("Incolla il testo del programma oppure carica un file PDF, DOCX o TXT.", 422);
  }

  try {
    const config = await getAiConfig();
    const result = await importCurriculum({ ...parsed.data, text, config });
    return NextResponse.json({ result, characters: text.length });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Importazione non riuscita.", 400);
  }
}
