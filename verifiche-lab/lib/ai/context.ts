import { prompts } from "@/lib/generated/assets";
import type { GeneratedItem, GenerationRequest } from "@/lib/schemas";
import { parseJson } from "@/lib/utils";
import type { TopicContext } from "@/lib/generation/deterministic";

export interface ContextBankItem {
  prompt: string;
  type: string;
  solutionSteps: string[];
  gradingCriteria: string[];
  tags: string[];
}

export interface GenerationContextInput {
  request: GenerationRequest;
  topics: TopicContext[];
  bankExamples: ContextBankItem[];
  recentPrompts?: string[];
}

export interface GenerationContext {
  system: string;
  user: string;
  contextText: string;
  promptExcerpt: string;
}

function readPrompt(relative: string): string {
  return prompts[relative] ?? "";
}

function fill(template: string, values: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

function constraintText(request: GenerationRequest): string {
  const parts: string[] = [];
  parts.push(request.calculatorAllowed ? "calcolatrice consentita" : "calcolatrice non consentita");
  if (request.formulaSheet) parts.push("formulario allegato");
  if (request.trigTables) parts.push("tavole goniometriche consentite");
  if (request.noDerivatives) parts.push("senza derivate");
  if (request.onlyDefinitions) parts.push("solo definizioni e giustificazioni");
  if (request.simplifiedLanguage) parts.push("linguaggio semplificato per DSA/BES");
  if (request.answerSpace) parts.push("spazio per lo svolgimento");
  if (request.longProblem) parts.push("un problema lungo");
  if (request.theoryQuestions) parts.push("domande teoriche");
  return parts.join("; ");
}

export function curriculumSliceText(topics: TopicContext[], request: GenerationRequest): string {
  const weightById = new Map(request.selectedTopics.map((topic) => [topic.topicId, topic.weight]));
  const blocks = topics.map((topic) => {
    const weight = weightById.get(topic.id) ?? 0;
    const objectives = topic.objectives
      .map((objective) => `  - ${objective.code}: ${objective.text}`)
      .join("\n");
    return [
      `### ${topic.code} — ${topic.name}`,
      `Peso richiesto: ${weight}%. Difficoltà tipica: ${topic.difficultyMin}–${topic.difficultyMax}/5.`,
      topic.description ? `Descrizione: ${topic.description}` : "",
      objectives ? `Obiettivi:\n${objectives}` : "Obiettivi: (nessuno specificato, usa il topic come riferimento).",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return blocks.join("\n\n");
}

export function bankExamplesText(examples: ContextBankItem[]): string {
  if (examples.length === 0) {
    return "Nessun esempio approvato disponibile: attieniti al curriculum e allo stile richiesto.";
  }
  return examples
    .slice(0, 6)
    .map((example, index) =>
      [
        `### Esempio ${index + 1} (${example.type})`,
        `Consegna: ${example.prompt}`,
        `Soluzione: ${example.solutionSteps.join(" ")}`,
        `Criteri: ${example.gradingCriteria.join("; ")}`,
        example.tags.length > 0 ? `Tag: ${example.tags.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function antiRepetitionText(recentPrompts: string[] = []): string {
  if (recentPrompts.length === 0) {
    return "Nessuna consegna recente da evitare.";
  }
  const bullets = recentPrompts
    .slice(-30)
    .map((prompt) => `- ${prompt.replace(/\s+/g, " ").slice(0, 220)}`)
    .join("\n");
  return `Non riproporre, nemmeno con numeri diversi, le seguenti consegne già usate dal docente:\n${bullets}`;
}

export function itemBankSnapshotToContext(snapshot: unknown, tags: string[]): ContextBankItem | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const data = snapshot as Record<string, unknown>;
  const prompt = typeof data.prompt === "string" ? data.prompt : "";
  if (!prompt) return null;
  const type = typeof data.type === "string" ? data.type : "exercise";
  return {
    prompt,
    type,
    solutionSteps: Array.isArray(data.solutionSteps) ? data.solutionSteps.map(String) : [],
    gradingCriteria: Array.isArray(data.gradingCriteria) ? data.gradingCriteria.map(String) : [],
    tags,
  };
}

export function serializeBankSnapshot(item: {
  type: string;
  prompt: string;
  options?: string;
  correctOption?: number | null;
  points: number;
  difficulty: number;
  estimatedMin: number;
  objectives?: string;
  solutionSteps: string;
  gradingCriteria: string;
  commonErrors: string;
  hints: string;
  answerSpace: string;
  figureSpec?: string | null;
  topicId?: string | null;
}): Record<string, unknown> {
  return {
    type: item.type,
    prompt: item.prompt,
    options: parseJson<string[]>(item.options ?? "[]", []),
    correctOption: item.correctOption ?? null,
    points: item.points,
    difficulty: item.difficulty,
    estimatedMin: item.estimatedMin,
    objectives: parseJson<string[]>(item.objectives ?? "[]", []),
    solutionSteps: parseJson<string[]>(item.solutionSteps, []),
    gradingCriteria: parseJson<string[]>(item.gradingCriteria, []),
    commonErrors: parseJson<string[]>(item.commonErrors, []),
    hints: parseJson<string[]>(item.hints, []),
    answerSpace: item.answerSpace,
    figureSpec: item.figureSpec ? parseJson<unknown>(item.figureSpec, null) : null,
    topicId: item.topicId ?? null,
  };
}

export function buildGenerationContext(input: GenerationContextInput): GenerationContext {
  const { request, topics, bankExamples, recentPrompts } = input;
  const template = readPrompt("generation.md");
  const style = readPrompt(`styles/${request.track}.md`);
  const schema = readPrompt("schema.json");
  const mix = request.types.join(", ");
  const contextText = curriculumSliceText(topics, request);
  const examples = bankExamplesText(bankExamples);
  const antiRepetition = antiRepetitionText(recentPrompts);
  const topicCodes = topics.map((topic) => topic.code).join(", ");

  const system = fill(template, {
    materia: request.subject === "fisica" ? "Fisica" : "Matematica",
    indirizzo: request.track === "classico" ? "Liceo Classico" : "Liceo Scientifico",
    anno: String(request.year),
    punti: String(request.totalPoints),
    minuti: String(request.durationMin),
    difficolta: String(request.difficultyTarget),
    mix,
    numeroQuesiti: String(request.itemCount),
    vincoli: constraintText(request),
    profilo: style,
    contesto: contextText,
    esempi: examples,
    antiRipetizione: antiRepetition,
    schema,
  });

  const user = [
    "Genera ora la verifica richiesta.",
    `Titolo: ${request.title}.`,
    `Argomenti ammessi (usa esattamente questi codici in topic_code): ${topicCodes}.`,
    `Ripartisci i ${request.totalPoints} punti in modo che la somma sia esattamente ${request.totalPoints}.`,
    `La somma dei tempi stimati deve essere compresa tra ${Math.floor(request.durationMin * 0.9)} e ${Math.ceil(request.durationMin * 1.1)} minuti.`,
    "Restituisci solo il JSON.",
  ].join("\n");

  return {
    system,
    user,
    contextText,
    promptExcerpt: `${request.title} | ${request.track}/${request.year}/${request.subject} | ${request.itemCount} item | ${request.totalPoints} pt / ${request.durationMin} min`,
  };
}

export function buildRepairPrompt(errors: string[], previousResponse: string, maxChars = 24_000): string {
  const template = readPrompt("repair.md");
  const schema = readPrompt("schema.json");
  const truncated = previousResponse.length > maxChars ? `${previousResponse.slice(0, maxChars)}\n…[troncato]` : previousResponse;
  return fill(template, {
    errori: errors.map((error) => `- ${error}`).join("\n"),
    risposta: truncated,
    schema,
  });
}

export function buildCriticPrompt(
  generated: unknown,
  request: GenerationRequest,
  constraints: string,
): string {
  const template = readPrompt("critic.md");
  return fill(template, {
    materia: request.subject === "fisica" ? "Fisica" : "Matematica",
    indirizzo: request.track === "classico" ? "Liceo Classico" : "Liceo Scientifico",
    anno: String(request.year),
    vincoli: constraints,
    verifica: JSON.stringify(generated, null, 2).slice(0, 40_000),
  });
}

export function itemToPromptBlock(item: GeneratedItem): string {
  return [
    `Tipo: ${item.type}`,
    `Consegna: ${item.prompt}`,
    item.options.length > 0 ? `Opzioni: ${item.options.join(" | ")}` : "",
    `Punti: ${item.points}`,
    `Difficoltà: ${item.difficulty}`,
    `Tempo: ${item.estimated_min} min`,
    `Soluzione: ${item.solution_steps.join(" ")}`,
    `Criteri: ${item.grading_criteria.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}
