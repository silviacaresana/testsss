import { applyRules, type RuleContext, type RuleReport } from "@/lib/generation/rule-engine";
import { generatedTestSchema, type GeneratedTest, type GenerationRequest } from "@/lib/schemas";
import { estimateGenerationCost, type AiConfig } from "./config";
import { callAi, AiError, type AiMessage } from "./provider";
import {
  buildCriticPrompt,
  buildGenerationContext,
  buildRepairPrompt,
  type ContextBankItem,
} from "./context";
import type { TopicContext } from "@/lib/generation/deterministic";

export interface AiRunLog {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costEstimate: number;
  durationMs: number;
  status: "ok" | "errore" | "riparata";
  errors: string[];
  promptExcerpt: string | null;
}

export interface AiGenerationOptions {
  request: GenerationRequest;
  topics: TopicContext[];
  ruleContext: RuleContext;
  bankExamples: ContextBankItem[];
  recentPrompts: string[];
  config: AiConfig;
  retainPrompts: boolean;
}

export interface AiGenerationResult {
  test: GeneratedTest;
  report: RuleReport;
  runs: AiRunLog[];
  repaired: boolean;
}

export class GenerationFailedError extends Error {
  errors: string[];
  runs: AiRunLog[];
  lastTest: GeneratedTest | null;

  constructor(message: string, errors: string[], runs: AiRunLog[], lastTest: GeneratedTest | null) {
    super(message);
    this.name = "GenerationFailedError";
    this.errors = errors;
    this.runs = runs;
    this.lastTest = lastTest;
  }
}

function stripCodeFence(text: string): string {
  let clean = text.trim();
  if (clean.startsWith("\ufeff")) clean = clean.slice(1);
  const fence = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) clean = fence[1].trim();
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first >= 0 && last > first) clean = clean.slice(first, last + 1);
  return clean;
}

export function parseAiJson(text: string): unknown {
  if (!text || !text.trim()) {
    throw new Error("La risposta del provider è vuota.");
  }
  const clean = stripCodeFence(text);
  try {
    return JSON.parse(clean);
  } catch (error) {
    const message = error instanceof Error ? error.message : "errore sconosciuto";
    throw new Error(`JSON non valido: ${message}`);
  }
}

function zodIssues(error: unknown): string[] {
  const result = error as { issues?: { path: (string | number)[]; message: string }[] };
  if (!Array.isArray(result?.issues)) return [String(error)];
  return result.issues.map((issue) => `${issue.path.join(".") || "radice"}: ${issue.message}`);
}

/**
 * Normalizza i metadati restituiti dal modello su quelli richiesti dal docente.
 * I contenuti restano quelli del modello; track/anno/materia/punti/tempo sono vincoli.
 */
function normalizeGeneratedMeta(test: GeneratedTest, request: GenerationRequest): GeneratedTest {
  return {
    ...test,
    meta: {
      ...test.meta,
      title: request.title,
      track: request.track,
      year: request.year,
      subject: request.subject,
      duration_min: request.durationMin,
      total_points: request.totalPoints,
      difficulty_target: request.difficultyTarget,
      calculator_allowed: request.calculatorAllowed,
    },
  };
}

function createRunLog(result: {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costEur: number;
}, durationMs: number, status: AiRunLog["status"], errors: string[], promptExcerpt: string | null): AiRunLog {
  return {
    provider: result.provider,
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    costEstimate: result.costEur,
    durationMs,
    status,
    errors,
    promptExcerpt,
  };
}

function constraintsText(request: GenerationRequest): string {
  const parts = [
    request.calculatorAllowed ? "calcolatrice consentita" : "calcolatrice non consentita",
    request.longProblem ? "problema lungo" : "",
    request.theoryQuestions ? "domande teoriche" : "",
    request.noDerivatives ? "senza derivate" : "",
    request.onlyDefinitions ? "solo definizioni" : "",
    request.answerSpace ? "spazio per lo svolgimento" : "senza spazio per lo svolgimento",
  ].filter(Boolean);
  return parts.join("; ");
}

async function runCritic(
  test: GeneratedTest,
  options: AiGenerationOptions,
  report: RuleReport,
  runs: AiRunLog[],
): Promise<void> {
  if (!options.config.criticModel.trim()) return;
  const prompt = buildCriticPrompt(test, options.request, constraintsText(options.request));
  const started = Date.now();
  try {
    const result = await callAi(
      [
        { role: "system", content: "Sei un revisore didattico rigoroso. Rispondi solo con JSON valido." },
        { role: "user", content: prompt },
      ],
      { ...options.config, model: options.config.criticModel },
      { temperature: 0.1, maxTokens: 2500, model: options.config.criticModel },
    );
    runs.push(
      createRunLog(
        result,
        Date.now() - started,
        "ok",
        [],
        options.retainPrompts ? "Revisione critica della verifica generata." : null,
      ),
    );
    const parsed = parseAiJson(result.text) as { warnings?: { item_id?: string; message?: string; severity?: string }[] };
    for (const warning of parsed.warnings ?? []) {
      if (!warning?.message) continue;
      const prefix = warning.item_id ? `[Revisione ${warning.item_id}]` : "[Revisione]";
      const severity = warning.severity ? ` (${warning.severity})` : "";
      report.warnings.push(`${prefix}${severity} ${warning.message}`);
    }
  } catch (error) {
    runs.push({
      provider: options.config.provider,
      model: options.config.criticModel,
      promptTokens: 0,
      completionTokens: 0,
      costEstimate: 0,
      durationMs: Date.now() - started,
      status: "errore",
      errors: [error instanceof Error ? error.message : "Errore della revisione critica"],
      promptExcerpt: options.retainPrompts ? "Revisione critica non riuscita." : null,
    });
    report.warnings.push(
      `La revisione critica non è stata completata: ${
        error instanceof Error ? error.message : "errore sconosciuto"
      }. La verifica resta modificabile dal docente.`,
    );
  }
}

/**
 * Pipeline AI: chiamata strutturata → validazione Zod → rule engine → riparazione (max 2)
 * → revisione critica opzionale.
 */
export async function generateWithAi(options: AiGenerationOptions): Promise<AiGenerationResult> {
  const { request, topics, config, ruleContext } = options;
  if (config.provider === "offline") {
    throw new AiError("Il provider offline non usa la pipeline AI.");
  }

  const context = buildGenerationContext({
    request,
    topics,
    bankExamples: options.bankExamples,
    recentPrompts: options.recentPrompts,
  });

  const estimated = estimateGenerationCost(config.model, context.system.length + context.user.length, request.itemCount);
  if (estimated > config.maxCostPerGeneration) {
    throw new AiError(
      `Il costo stimato della generazione (${estimated.toFixed(3)} €) supera il limite di ${config.maxCostPerGeneration.toFixed(
        2,
      )} €. Riduci il numero di quesiti o aumenta il limite nelle impostazioni.`,
    );
  }

  const runs: AiRunLog[] = [];
  const messages: AiMessage[] = [
    { role: "system", content: context.system },
    { role: "user", content: context.user },
  ];
  const errors: string[] = [];
  let lastTest: GeneratedTest | null = null;

  for (let attempt = 0; attempt <= 2; attempt++) {
    const started = Date.now();
    let result;
    try {
      result = await callAi(messages, config, { temperature: attempt === 0 ? 0.35 : 0.2 });
    } catch (error) {
      runs.push({
        provider: config.provider,
        model: config.model,
        promptTokens: 0,
        completionTokens: 0,
        costEstimate: 0,
        durationMs: Date.now() - started,
        status: "errore",
        errors: [error instanceof Error ? error.message : "Errore del provider"],
        promptExcerpt: options.retainPrompts ? context.promptExcerpt : null,
      });
      throw error;
    }

    const attemptErrors: string[] = [];
    let parsedTest: GeneratedTest | null = null;

    try {
      const raw = parseAiJson(result.text);
      const validation = generatedTestSchema.safeParse(raw);
      if (!validation.success) {
        attemptErrors.push(...zodIssues(validation.error));
      } else {
        parsedTest = normalizeGeneratedMeta(validation.data as GeneratedTest, request);
        const sectionIds = new Set(parsedTest.sections.map((section) => section.id));
        for (const item of parsedTest.items) {
          if (item.section_id && !sectionIds.has(item.section_id)) {
            attemptErrors.push(`Quesito ${item.id}: section_id "${item.section_id}" inesistente.`);
          }
        }
        if (parsedTest.sections.length === 0) attemptErrors.push("Nessuna sezione definita.");
        if (attemptErrors.length === 0) {
          const resultRules = applyRules(parsedTest.items, ruleContext);
          lastTest = { ...parsedTest, items: resultRules.items };
          errors.length = 0;
          errors.push(...resultRules.report.errors);
          if (resultRules.report.errors.length === 0) {
            runs.push(
              createRunLog(
                result,
                Date.now() - started,
                attempt > 0 ? "riparata" : "ok",
                [],
                options.retainPrompts ? context.promptExcerpt : null,
              ),
            );
            const report: RuleReport = resultRules.report;
            await runCritic(lastTest, options, report, runs);
            return { test: lastTest, report, runs, repaired: attempt > 0 };
          }
        }
      }
    } catch (error) {
      attemptErrors.push(error instanceof Error ? error.message : "Risposta non interpretabile");
    }

    errors.length = 0;
    errors.push(...attemptErrors);
    runs.push(
      createRunLog(
        result,
        Date.now() - started,
        "errore",
        attemptErrors,
        options.retainPrompts ? context.promptExcerpt : null,
      ),
    );

    if (attempt === 2) break;
    const repairPrompt = buildRepairPrompt(errors, result.text);
    messages.push({ role: "assistant", content: result.text });
    messages.push({ role: "user", content: repairPrompt });
  }

  throw new GenerationFailedError(
    "La verifica generata non supera i controlli automatici dopo due tentativi di riparazione. I dati del wizard sono conservati: puoi riprovare o cambiare i vincoli.",
    errors.length > 0 ? errors : ["La risposta non è conforme al contratto JSON."],
    runs,
    lastTest,
  );
}
