import { z } from "zod";
import { callAi } from "@/lib/ai/provider";
import { getAiConfig, type AiConfig } from "@/lib/ai/config";

export interface ParsedObjective {
  code: string;
  text: string;
  prerequisites: string[];
  keywords: string[];
}

export interface ParsedTopic {
  code: string;
  name: string;
  description: string;
  weightHint: number;
  difficultyMin: number;
  difficultyMax: number;
  isCore: boolean;
  objectives: ParsedObjective[];
}

export interface ParsedCurriculum {
  track: "classico" | "scientifico";
  year: number;
  subject: "matematica" | "fisica";
  title: string;
  notes: string;
  topics: ParsedTopic[];
}

export interface ImportResult {
  curriculum: ParsedCurriculum;
  mode: "euristico" | "ai";
  warnings: string[];
}

const STOP_WORDS = new Set([
  "il",
  "lo",
  "la",
  "i",
  "gli",
  "le",
  "di",
  "del",
  "della",
  "dei",
  "degli",
  "delle",
  "e",
  "ed",
  "o",
  "a",
  "ad",
  "in",
  "con",
  "su",
  "per",
  "tra",
  "fra",
  "un",
  "uno",
  "una",
]);

function cleanLine(line: string): string {
  return line
    .replace(/^[\s>*\-–—•·]+/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^[a-zA-Z][.)]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeading(line: string, nextLine = ""): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Le voci di elenco non sono intestazioni, anche se iniziano con maiuscola.
  if (/^[\s>*\-–—•·]+/.test(trimmed)) return false;
  if (/^#{1,4}\s/.test(trimmed)) return true;
  if (/^(unit[àa]|modulo|argomento|nucleo|contenut[oi]|tema)\b/i.test(trimmed)) return true;
  if (/^\d+[.)]\s+\S/.test(trimmed) && trimmed.length < 90) return true;
  if (trimmed.length < 75 && trimmed === trimmed.toUpperCase() && /[A-ZÀ-Ù]/.test(trimmed) && trimmed.split(" ").length <= 8) {
    return true;
  }
  if (trimmed.length < 90 && /:$/.test(trimmed)) return true;
  // Intestazione in stile "Equazioni e disequazioni" seguita da un elenco.
  if (
    trimmed.length < 70 &&
    trimmed.split(/\s+/).length <= 9 &&
    !/[.;:,!?]$/.test(trimmed) &&
    /^[A-ZÀ-Ù]/.test(trimmed) &&
    /[a-zà-ù]/.test(trimmed) &&
    /^([-*•·–—]|\d+[.)])\s+/.test(nextLine.trim())
  ) {
    return true;
  }
  return false;
}

function codeFromName(name: string, index: number): string {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(" ")
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word.toLowerCase()));
  const initials = words.map((word) => word[0]).join("").slice(0, 4);
  return `${initials || "T"}${index + 1}`.slice(0, 8);
}

function keywordsFrom(text: string): string[] {
  return [...new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zà-ù0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word)),
  )].slice(0, 6);
}

function uniqueCode(base: string, used: Set<string>): string {
  let code = base;
  let index = 2;
  while (used.has(code)) {
    code = `${base}.${index}`;
    index += 1;
  }
  used.add(code);
  return code;
}

/** Parser deterministico: riconosce titoli, elenchi e periodi; non inventa contenuti. */
export function parseCurriculumText(input: {
  text: string;
  track: "classico" | "scientifico";
  year: number;
  subject: "matematica" | "fisica";
  title: string;
  notes?: string;
}): ParsedCurriculum {
  const text = input.text.replace(/\r\n/g, "\n").replace(/\t/g, " ");
  const lines = text.split("\n").map((line) => line.trimEnd());
  const blocks: { heading: string; lines: string[] }[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const original = lines[index];
    if (!original.trim()) continue;
    const cleaned = cleanLine(original);
    if (!cleaned) continue;
    const nextLine = lines.slice(index + 1).find((line) => line.trim()) ?? "";
    const looksHeading = isHeading(original, nextLine) && cleaned.length < 110;
    if (looksHeading && current && current.lines.length === 0 && current.heading) {
      // Il titolo del documento non è un argomento: la prima vera intestazione lo sostituisce.
      current.heading = cleaned.replace(/^#+\s*/, "");
    } else if (looksHeading && (!current || current.lines.length > 0 || !current.heading)) {
      current = { heading: cleaned.replace(/^#+\s*/, ""), lines: [] };
      blocks.push(current);
    } else if (!current) {
      current = { heading: "", lines: [] };
      blocks.push(current);
      current.lines.push(cleaned);
    } else {
      current.lines.push(cleaned);
    }
  }

  if (blocks.length === 0) {
    blocks.push({ heading: "Programma", lines: [cleanLine(text).slice(0, 400) || input.title] });
  }

  const usedTopics = new Set<string>();
  const topics: ParsedTopic[] = [];
  let fallbackIndex = 0;

  for (const block of blocks) {
    const heading = block.heading || block.lines[0] || `Argomento ${fallbackIndex + 1}`;
    const body = block.heading ? block.lines : block.lines.slice(1);
    const name = heading.replace(/^[0-9.)\s]+/, "").slice(0, 90) || `Argomento ${fallbackIndex + 1}`;
    const objectives: ParsedObjective[] = [];
    const usedObjectives = new Set<string>();
    const baseCode = uniqueCode(codeFromName(name, topics.length), usedTopics);

    const statements = body
      .flatMap((line) => (line.length > 160 ? line.split(/(?<=[.;:])\s+/) : [line]))
      .map((line) => line.trim())
      .filter((line) => line.length >= 4);

    if (statements.length === 0) {
      statements.push(`Conoscere e applicare i contenuti di ${name.toLowerCase()}.`);
    }

    statements.slice(0, 24).forEach((statement, index) => {
      const objectiveText = statement.replace(/[.;]\s*$/, "");
      objectives.push({
        code: uniqueCode(`${baseCode}.${index + 1}`, usedObjectives),
        text: objectiveText.charAt(0).toUpperCase() + objectiveText.slice(1),
        prerequisites: [],
        keywords: keywordsFrom(objectiveText),
      });
    });

    topics.push({
      code: baseCode,
      name,
      description: objectives.map((objective) => objective.text).slice(0, 2).join(" ").slice(0, 300),
      weightHint: Math.max(5, Math.round(100 / Math.max(1, blocks.length))),
      difficultyMin: 1,
      difficultyMax: 3,
      isCore: topics.length < 4,
      objectives,
    });
    fallbackIndex += 1;
  }

  const totalWeight = topics.reduce((acc, topic) => acc + topic.weightHint, 0);
  if (totalWeight > 0) {
    for (const topic of topics) topic.weightHint = Math.max(1, Math.round((topic.weightHint / totalWeight) * 100));
  }

  return {
    track: input.track,
    year: input.year,
    subject: input.subject,
    title: input.title,
    notes: input.notes ?? "Importato dal testo del programma; verificare e correggere prima della pubblicazione.",
    topics,
  };
}

const aiTopicSchema = z.object({
  code: z.string().min(1).max(12).optional(),
  name: z.string().min(2).max(120),
  description: z.string().max(500).default(""),
  weightHint: z.number().min(0).max(100).default(10),
  difficultyMin: z.number().int().min(1).max(5).default(1),
  difficultyMax: z.number().int().min(1).max(5).default(3),
  isCore: z.boolean().default(true),
  objectives: z
    .array(
      z.object({
        text: z.string().min(3).max(400),
        prerequisites: z.array(z.string()).default([]),
        keywords: z.array(z.string()).default([]),
      }),
    )
    .min(1)
    .max(20),
});

const aiImportSchema = z.object({
  topics: z.array(aiTopicSchema).min(1).max(30),
  notes: z.string().max(600).optional(),
});

function normalizeAiTopics(
  parsed: z.infer<typeof aiImportSchema>,
  input: Parameters<typeof parseCurriculumText>[0],
): ParsedCurriculum {
  const usedTopics = new Set<string>();
  const topics: ParsedTopic[] = parsed.topics.map((topic, topicIndex) => {
    const code = uniqueCode((topic.code || codeFromName(topic.name, topicIndex)).toUpperCase().replace(/\s+/g, ""), usedTopics);
    const usedObjectives = new Set<string>();
    return {
      code,
      name: topic.name,
      description: topic.description,
      weightHint: topic.weightHint,
      difficultyMin: Math.min(topic.difficultyMin, topic.difficultyMax),
      difficultyMax: Math.max(topic.difficultyMin, topic.difficultyMax),
      isCore: topic.isCore,
      objectives: topic.objectives.map((objective, objectiveIndex) => ({
        code: uniqueCode(`${code}.${objectiveIndex + 1}`, usedObjectives),
        text: objective.text,
        prerequisites: objective.prerequisites,
        keywords: objective.keywords.length > 0 ? objective.keywords : keywordsFrom(objective.text),
      })),
    };
  });
  const totalWeight = topics.reduce((acc, topic) => acc + topic.weightHint, 0);
  if (totalWeight > 0) {
    for (const topic of topics) topic.weightHint = Math.max(1, Math.round((topic.weightHint / totalWeight) * 100));
  }
  return {
    track: input.track,
    year: input.year,
    subject: input.subject,
    title: input.title,
    notes: parsed.notes || "Importazione assistita: rivedere i contenuti prima della pubblicazione.",
    topics,
  };
}

/**
 * Import assistito: usa il provider AI se configurato, altrimenti il parser
 * deterministico. In entrambi i casi restituisce una bozza da revisionare.
 */
export async function importCurriculum(input: {
  text: string;
  track: "classico" | "scientifico";
  year: number;
  subject: "matematica" | "fisica";
  title: string;
  notes?: string;
  config?: AiConfig;
}): Promise<ImportResult> {
  const fallback = parseCurriculumText(input);
  const config = input.config ?? (await getAiConfig());
  if (config.provider === "offline") {
    return {
      curriculum: fallback,
      mode: "euristico",
      warnings: [
        "Importazione euristica locale: controlla titoli, codici e obiettivi. Per un'analisi più fine configura un provider AI.",
      ],
    };
  }

  const prompt = [
    "Sei un assistente del dipartimento di Matematica e Fisica di un liceo italiano.",
    "Trasforma il testo del programma fornito in una struttura di topic e obiettivi.",
    "Usa SOLO informazioni presenti nel testo: non inventare argomenti ministeriali.",
    "Scrivi in italiano. Ogni topic deve avere 2-8 obiettivi operativi.",
    "Restituisci solo JSON con questa forma:",
    '{"topics":[{"code":"EQ1","name":"...","description":"...","weightHint":20,"difficultyMin":1,"difficultyMax":3,"isCore":true,"objectives":[{"text":"...","prerequisites":[],"keywords":[]}]}],"notes":"..."}',
    "",
    `Indirizzo: ${input.track}`,
    `Anno: ${input.year}`,
    `Materia: ${input.subject}`,
    `Titolo: ${input.title}`,
    "",
    "TESTO DEL PROGRAMMA:",
    input.text.slice(0, 60_000),
  ].join("\n");

  try {
    const result = await callAi(
      [
        { role: "system", content: "Rispondi esclusivamente con JSON valido, senza markdown." },
        { role: "user", content: prompt },
      ],
      config,
      { temperature: 0.1, maxTokens: 6000 },
    );
    const cleaned = result.text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    const raw = JSON.parse(cleaned.slice(first, last + 1)) as unknown;
    const parsed = aiImportSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        curriculum: fallback,
        mode: "euristico",
        warnings: [
          "L'AI ha restituito una struttura non valida: è stata usata l'importazione euristica. Controlla i contenuti.",
        ],
      };
    }
    return {
      curriculum: normalizeAiTopics(parsed.data, input),
      mode: "ai",
      warnings: ["Importazione AI: la bozza non è pubblicata. Rivedi topic, obiettivi e pesi prima di pubblicare."],
    };
  } catch (error) {
    return {
      curriculum: fallback,
      mode: "euristico",
      warnings: [
        `Importazione AI non riuscita (${error instanceof Error ? error.message : "errore sconosciuto"}). È stata usata l'importazione euristica.`,
      ],
    };
  }
}
