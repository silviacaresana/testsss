import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import {
  generationRequestSchema,
  type GeneratedItem,
  type GeneratedTest,
  type GenerationRequest,
} from "@/lib/schemas";
import { DEFAULT_INDICATORS, DEFAULT_LEVELS, ITEM_TYPE_VALUES } from "@/lib/constants";
import { parseJson, toJson, hashString } from "@/lib/utils";
import { generateDeterministic, type TopicContext } from "./deterministic";
import { applyRules, similarity, type RuleContext, type RuleReport } from "./rule-engine";
import { estimateGenerationCost, getAiConfig, type AiConfig } from "@/lib/ai/config";
import {
  generateWithAi,
  GenerationFailedError,
  type AiRunLog,
} from "@/lib/ai/pipeline";
import { AiError } from "@/lib/ai/provider";
import {
  itemBankSnapshotToContext,
  type ContextBankItem,
} from "@/lib/ai/context";
import {
  buildSnapshot,
  canEditTest,
  createVersion,
  getEditableTest,
  getTestForUser,
  serializeItem,
  serializeTest,
  testInclude,
  toExportJson,
  type SerializedTest,
  type TestWithRelations,
} from "@/lib/tests/repository";

export interface GenerateResult {
  tests: SerializedTest[];
  primaryId: string;
  warnings: string[];
  adjustments: string[];
  provider: string;
  model: string;
  costEstimate: number;
  durationMs: number;
  versions: { id: string; label: string; title: string }[];
}

export class GenerationError extends Error {
  errors: string[];
  warnings: string[];
  constructor(message: string, errors: string[] = [], warnings: string[] = []) {
    super(message);
    this.name = "GenerationError";
    this.errors = errors;
    this.warnings = warnings;
  }
}

function topicContextFromDb(topic: {
  id: string;
  code: string;
  name: string;
  description: string;
  difficultyMin: number;
  difficultyMax: number;
  objectives: { code: string; text: string }[];
}): TopicContext {
  return {
    id: topic.id,
    code: topic.code,
    name: topic.name,
    description: topic.description,
    difficultyMin: topic.difficultyMin,
    difficultyMax: topic.difficultyMax,
    objectives: topic.objectives.map((objective) => ({ code: objective.code, text: objective.text })),
  };
}

export function buildRuleContext(request: GenerationRequest, topics: TopicContext[]): RuleContext {
  return {
    request,
    topicCodes: new Set(topics.map((topic) => topic.code)),
    topicIdToCode: new Map(topics.map((topic) => [topic.id, topic.code])),
    objectivesByCode: new Map(
      topics.map((topic) => [topic.code, topic.objectives.map((objective) => objective.code)]),
    ),
  };
}

async function loadCurriculum(curriculumId: string) {
  const curriculum = await prisma.curriculum.findUnique({
    where: { id: curriculumId },
    include: { topics: { include: { objectives: true }, orderBy: { order: "asc" } } },
  });
  if (!curriculum) throw new GenerationError("Il programma selezionato non esiste più.");
  return curriculum;
}

function selectedTopicContexts(
  curriculum: Awaited<ReturnType<typeof loadCurriculum>>,
  request: GenerationRequest,
): TopicContext[] {
  const selectedIds = new Set(request.selectedTopics.map((topic) => topic.topicId));
  const topics = curriculum.topics.filter((topic) => selectedIds.has(topic.id));
  if (topics.length !== selectedIds.size) {
    throw new GenerationError(
      "Uno o più argomenti selezionati non appartengono al programma scelto. Ricarica la pagina e ripeti la selezione.",
    );
  }
  if (topics.length === 0) throw new GenerationError("Seleziona almeno un argomento del programma.");
  return topics.map(topicContextFromDb);
}

async function fetchBankExamples(
  user: SessionUser,
  request: GenerationRequest,
): Promise<ContextBankItem[]> {
  const rows = await prisma.itemBankEntry.findMany({
    where: {
      OR: [{ ownerId: user.id }, { visibility: { in: ["dipartimento", "pubblico interno"] } }],
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const items = rows
    .map((row) => {
      const tags = parseJson<string[]>(row.tagsJson, []);
      const context = itemBankSnapshotToContext(parseJson<unknown>(row.itemSnapshotJson, null), tags);
      if (!context) return null;
      let score = 0;
      if (tags.includes(request.subject)) score += 4;
      if (tags.includes(request.track)) score += 3;
      if (tags.includes(String(request.year))) score += 2;
      if (tags.some((tag) => request.selectedTopics.some((topic) => topic.topicId === tag))) score += 2;
      return { context, score };
    })
    .filter((entry): entry is { context: ContextBankItem; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.context);
  return items.slice(0, 6);
}

async function recentPrompts(userId: string, excludeTestId?: string): Promise<string[]> {
  const rows = await prisma.item.findMany({
    where: { test: { authorId: userId }, ...(excludeTestId ? { testId: { not: excludeTestId } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { prompt: true },
  });
  return rows.map((row) => row.prompt);
}

export interface GenerationLimits {
  runsLastHour: number;
  monthlySpend: number;
  monthlyBudget: number;
  estimatedCost: number;
  rateLimit: number;
}

export async function checkGenerationLimits(
  user: SessionUser,
  request: GenerationRequest,
  config?: AiConfig,
): Promise<GenerationLimits> {
  const aiConfig = config ?? (await getAiConfig());
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [runsLastHour, monthly] = await Promise.all([
    prisma.generationRun.count({ where: { userId: user.id, createdAt: { gte: hourAgo } } }),
    prisma.generationRun.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { costEstimate: true },
    }),
  ]);
  const monthlySpend = monthly._sum.costEstimate ?? 0;
  const estimatedCost =
    aiConfig.provider === "offline"
      ? 0
      : estimateGenerationCost(aiConfig.model, 16_000, request.itemCount) * request.versions;

  if (runsLastHour + request.versions > aiConfig.rateLimitPerHour) {
    throw new GenerationError(
      `Hai raggiunto il limite di ${aiConfig.rateLimitPerHour} generazioni all'ora (ne restano ${
        aiConfig.rateLimitPerHour - runsLastHour
      }). Attendi oppure chiedi all'amministratore di aumentare il limite.`,
    );
  }
  if (monthlySpend + estimatedCost > aiConfig.monthlyBudget) {
    throw new GenerationError(
      `Il budget mensile AI (${aiConfig.monthlyBudget.toFixed(2)} €) è quasi esaurito: spesi ${monthlySpend.toFixed(
        2,
      )} €, stimati ${estimatedCost.toFixed(2)} € per questa generazione.`,
    );
  }
  return {
    runsLastHour,
    monthlySpend,
    monthlyBudget: aiConfig.monthlyBudget,
    estimatedCost,
    rateLimit: aiConfig.rateLimitPerHour,
  };
}

function rotate<T>(values: T[], by: number): T[] {
  if (values.length === 0) return values;
  const shift = ((by % values.length) + values.length) % values.length;
  return [...values.slice(shift), ...values.slice(0, shift)];
}

function shuffle<T>(values: T[], seed: number): T[] {
  const copy = [...values];
  let state = seed || 1;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function applyVariantShape(generated: GeneratedTest, index: number, request: GenerationRequest): GeneratedTest {
  if (index === 0 || request.vary !== "ordine") return generated;
  const sections = shuffle(generated.sections, request.seed ?? 7);
  const perSection = new Map<string, GeneratedItem[]>();
  for (const section of sections) perSection.set(section.id, []);
  for (const item of generated.items) {
    const target = perSection.get(item.section_id ?? sections[0]?.id ?? "");
    if (target) target.push(item);
    else perSection.get(sections[0]?.id ?? "")?.push(item);
  }
  const items: GeneratedItem[] = [];
  for (const section of sections) {
    for (const item of shuffle(perSection.get(section.id) ?? [], (request.seed ?? 7) + index)) {
      items.push({ ...item, section_id: section.id });
    }
  }
  return { ...generated, sections, items };
}

interface PersistInput {
  generated: GeneratedTest;
  request: GenerationRequest;
  user: SessionUser;
  curriculumId: string;
  parentTestId?: string | null;
  title: string;
  versionLabel: string;
  provider: string;
  model: string;
  costEstimate: number;
  seed: number;
}

async function persistGeneratedTest(input: PersistInput): Promise<string> {
  const { generated, request, user, curriculumId } = input;
  const topicRows = await prisma.topic.findMany({ where: { curriculumId }, select: { id: true, code: true } });
  const topicByCode = new Map(topicRows.map((topic) => [topic.code, topic.id]));
  const gradeScale = await prisma.gradeScale.findFirst({
    where: { isDefault: true },
    orderBy: { name: "asc" },
  });

  // D1 non supporta le transazioni: Prisma esegue le query una alla volta e non annulla quelle già fatte
  // se una successiva fallisce. Se qualcosa va storto elimino io la verifica appena creata
  // (sezioni, quesiti e griglia collegati vengono eliminati a cascata).
  let createdId: string | null = null;
  try {
    const tx = prisma;
    const test = await tx.test.create({
      data: {
        title: input.title,
        track: request.track,
        year: request.year,
        subject: request.subject,
        classLabel: request.classLabel ?? "",
        examDate: request.examDate ? new Date(request.examDate) : null,
        durationMin: request.durationMin,
        totalPoints: request.totalPoints,
        difficultyTarget: request.difficultyTarget,
        calculatorAllowed: request.calculatorAllowed,
        formulaSheet: request.formulaSheet,
        trigTables: request.trigTables,
        noDerivatives: request.noDerivatives,
        onlyDefinitions: request.onlyDefinitions,
        simplifiedLanguage: request.simplifiedLanguage,
        answerSpace: request.answerSpace,
        versionLabel: input.versionLabel,
        status: "bozza",
        seed: input.seed,
        requestJson: toJson({ ...request, seed: input.seed }),
        styleProfile: request.track,
        aiProvider: input.provider,
        aiModel: input.model,
        aiCostEstimate: input.costEstimate,
        authorId: user.id,
        curriculumId,
        gradeScaleId: gradeScale?.id ?? null,
        parentTestId: input.parentTestId ?? null,
      },
    });
    createdId = test.id;

    const sectionMap = new Map<string, string>();
    for (let index = 0; index < generated.sections.length; index++) {
      const section = generated.sections[index];
      const created = await tx.section.create({
        data: {
          testId: test.id,
          title: section.title,
          description: section.description ?? "",
          order: index,
        },
      });
      sectionMap.set(section.id, created.id);
    }
    if (sectionMap.size === 0) {
      const created = await tx.section.create({
        data: { testId: test.id, title: "Quesiti", description: "", order: 0 },
      });
      sectionMap.set("default", created.id);
    }

    const itemMap = new Map<string, string>();
    const generatedById = new Map(generated.items.map((item) => [item.id, item]));
    let order = 0;
    for (const item of generated.items) {
      const created = await tx.item.create({
        data: {
          testId: test.id,
          sectionId: item.section_id ? sectionMap.get(item.section_id) ?? null : null,
          type: item.type,
          prompt: item.prompt,
          options: toJson(item.options ?? []),
          correctOption: item.correct_option ?? null,
          points: item.points,
          difficulty: item.difficulty,
          estimatedMin: item.estimated_min,
          topicId: topicByCode.get(item.topic_code) ?? null,
          objectives: toJson(item.objectives ?? []),
          solutionSteps: toJson(item.solution_steps ?? []),
          gradingCriteria: toJson(item.grading_criteria ?? []),
          commonErrors: toJson(item.common_errors ?? []),
          hints: toJson(item.hints ?? []),
          answerSpace: item.answer_space,
          figureSpec: item.figure_spec ? toJson(item.figure_spec) : null,
          source: "ai",
          isLocked: item.is_locked,
          order: order++,
          aiGenerated: true,
          variantGroup: item.variant_group ?? null,
        },
      });
      itemMap.set(item.id, created.id);
    }

    const indicators = generated.rubric?.indicators?.length ? generated.rubric.indicators : [...DEFAULT_INDICATORS];
    const levels = generated.rubric?.levels?.length
      ? generated.rubric.levels
      : DEFAULT_LEVELS.map((level) => ({ ...level }));
    const mapping: Record<string, string[]> = {};
    for (const [generatedId, dbId] of itemMap) {
      const source = generatedById.get(generatedId);
      const configured = generated.rubric?.item_mapping?.[generatedId] ?? [];
      mapping[dbId] =
        configured.length > 0
          ? configured.filter((indicator) => indicators.includes(indicator))
          : [indicators[0] ?? "Conoscenze"];
      if (source && mapping[dbId].length === 0) mapping[dbId] = [indicators[0] ?? "Conoscenze"];
    }

    await tx.rubric.create({
      data: {
        testId: test.id,
        indicatorsJson: toJson(indicators),
        levelsJson: toJson(levels),
        itemMappingJson: toJson(mapping),
      },
    });

    return test.id;
  } catch (error) {
    if (createdId) await prisma.test.delete({ where: { id: createdId } }).catch(() => undefined);
    throw error;
  }
}

async function persistRuns(runs: AiRunLog[], userId: string, testId: string | null): Promise<void> {
  if (runs.length === 0) return;
  await prisma.generationRun.createMany({
    data: runs.map((run) => ({
      userId,
      testId,
      provider: run.provider,
      model: run.model,
      promptTokens: run.promptTokens,
      completionTokens: run.completionTokens,
      costEstimate: run.costEstimate,
      durationMs: run.durationMs,
      status: run.status,
      errorsJson: toJson(run.errors),
      promptExcerpt: run.promptExcerpt,
    })),
  });
}

function offlineRun(durationMs: number, promptExcerpt: string): AiRunLog {
  return {
    provider: "offline",
    model: "demo-deterministico",
    promptTokens: 0,
    completionTokens: 0,
    costEstimate: 0,
    durationMs,
    status: "ok",
    errors: [],
    promptExcerpt,
  };
}

async function auditSafe(
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  await prisma.auditLog
    .create({ data: { userId, action, entity, entityId, metaJson: toJson(meta) } })
    .catch(() => undefined);
}

/**
 * Genera una verifica (ed eventuali versioni A–D) e la persiste come bozza.
 * Offline: generatore deterministico. AI: pipeline con riparazione.
 */
export async function generateTests(input: {
  request: GenerationRequest;
  user: SessionUser;
}): Promise<GenerateResult> {
  const parsed = generationRequestSchema.safeParse(input.request);
  if (!parsed.success) {
    throw new GenerationError(
      "I dati del wizard non sono validi.",
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  const request = parsed.data;
  if (request.versions > 1 && request.vary === "domande" && request.types.length === 1) {
    throw new GenerationError(
      "Per variare le domande servono almeno due tipologie di quesito. Aggiungi una tipologia o scegli «numeri».",
    );
  }

  const curriculum = await loadCurriculum(request.curriculumId);
  if (!curriculum.topics.length) {
    throw new GenerationError("Il programma selezionato non contiene argomenti. Completalo prima di generare.");
  }
  if (
    curriculum.track !== request.track ||
    curriculum.year !== request.year ||
    curriculum.subject !== request.subject
  ) {
    throw new GenerationError("Il programma scelto non corrisponde a indirizzo, anno e materia della verifica.");
  }
  if (curriculum.status !== "pubblicato" && input.user.role !== "admin") {
    throw new GenerationError("Il programma scelto non è ancora pubblicato. Chiedi all'amministratore di pubblicarlo.");
  }

  const topics = selectedTopicContexts(curriculum, request);
  const ruleContext = buildRuleContext(request, topics);
  const config = await getAiConfig();
  await checkGenerationLimits(input.user, request, config);
  const started = Date.now();
  const baseSeed =
    request.seed ?? hashString(`${request.title}|${request.track}|${request.year}|${request.subject}|${Date.now()}`);
  const bankExamples = await fetchBankExamples(input.user, request);
  const previousPrompts = await recentPrompts(input.user.id);

  const versions: { id: string; label: string; title: string }[] = [];
  let primaryId = "";
  let totalCost = 0;
  let lastWarnings: string[] = [];
  let lastAdjustments: string[] = [];
  let provider = config.provider;
  let model = config.model;

  for (let index = 0; index < request.versions; index++) {
    const label = String.fromCharCode(65 + index);
    const seed = baseSeed + index * 7919;
    const variantRequest: GenerationRequest = {
      ...request,
      seed,
      types: index > 0 && request.vary === "domande" ? rotate(request.types, index) : request.types,
    };
    let generated: GeneratedTest;
    let report: RuleReport;
    let runs: AiRunLog[] = [];

    if (config.provider === "offline") {
      generated = generateDeterministic({ request: variantRequest, topics });
      const ruled = applyRules(generated.items, ruleContext);
      generated = { ...generated, items: ruled.items };
      report = ruled.report;
      runs = [offlineRun(Date.now() - started, `${variantRequest.title} — versione ${label}`)];
      provider = "offline";
      model = "demo-deterministico";
    } else {
      try {
        const aiResult = await generateWithAi({
          request: variantRequest,
          topics,
          ruleContext,
          bankExamples,
          recentPrompts: previousPrompts,
          config,
          retainPrompts: config.retainPrompts,
        });
        generated = aiResult.test;
        report = aiResult.report;
        runs = aiResult.runs;
        provider = config.provider;
        model = config.model;
      } catch (error) {
        if (error instanceof AiError) {
          // Fallback: un secondo tentativo immediato, come previsto dalla specifica.
          try {
            const retry = await generateWithAi({
              request: variantRequest,
              topics,
              ruleContext,
              bankExamples,
              recentPrompts: previousPrompts,
              config: { ...config, timeoutMs: Math.round(config.timeoutMs / 2) },
              retainPrompts: config.retainPrompts,
            });
            generated = retry.test;
            report = retry.report;
            runs = retry.runs;
            provider = config.provider;
            model = config.model;
          } catch (retryError) {
            const message = retryError instanceof Error ? retryError.message : error.message;
            await persistRuns(
              [
                {
                  provider: config.provider,
                  model: config.model,
                  promptTokens: 0,
                  completionTokens: 0,
                  costEstimate: 0,
                  durationMs: Date.now() - started,
                  status: "errore",
                  errors: [message],
                  promptExcerpt: config.retainPrompts ? variantRequest.title : null,
                },
              ],
              input.user.id,
              null,
            );
            throw new GenerationError(
              `Il provider AI non ha risposto correttamente: ${message} I dati del wizard sono conservati.`,
            );
          }
        } else if (error instanceof GenerationFailedError) {
          await persistRuns(error.runs, input.user.id, null);
          throw new GenerationError(
            error.message,
            error.errors,
            error.runs.flatMap((run) => run.errors),
          );
        } else {
          throw error;
        }
      }
    }

    generated = applyVariantShape(generated, index, variantRequest);
    if (report.errors.length > 0) {
      await persistRuns(runs, input.user.id, null);
      throw new GenerationError(
        "La verifica non supera i controlli automatici. Correggi i vincoli e riprova.",
        report.errors,
        report.warnings,
      );
    }

    const title =
      index === 0 ? request.title : `${request.title} — Versione ${label}`;
    const testId = await persistGeneratedTest({
      generated,
      request: variantRequest,
      user: input.user,
      curriculumId: request.curriculumId,
      parentTestId: index === 0 ? null : primaryId,
      title,
      versionLabel: label,
      provider,
      model,
      costEstimate: runs.reduce((acc, run) => acc + run.costEstimate, 0),
      seed,
    });
    if (index === 0) primaryId = testId;
    totalCost += runs.reduce((acc, run) => acc + run.costEstimate, 0);
    await persistRuns(runs, input.user.id, testId);
    const full = await prisma.test.findUniqueOrThrow({ where: { id: testId }, include: testInclude });
    await createVersion(testId, input.user.id, `Generazione — versione ${label}`);
    versions.push({ id: testId, label, title });
    lastWarnings = report.warnings;
    lastAdjustments = report.adjustments;
    await auditSafe(input.user.id, "generazione", "Test", testId, {
      provider,
      model,
      label,
      warnings: report.warnings.length,
      adjustments: report.adjustments.length,
    });
    void full;
  }

  const all = await Promise.all(
    versions.map(async (version) => {
      const test = await prisma.test.findUniqueOrThrow({ where: { id: version.id }, include: testInclude });
      return serializeTest(test);
    }),
  );

  const uniqueWarnings = [...new Set(lastWarnings)];
  return {
    tests: all,
    primaryId,
    warnings: uniqueWarnings,
    adjustments: lastAdjustments,
    provider,
    model,
    costEstimate: totalCost,
    durationMs: Date.now() - started,
    versions,
  };
}

export async function estimateGeneration(user: SessionUser, requestInput: GenerationRequest) {
  const request = generationRequestSchema.parse(requestInput);
  const config = await getAiConfig();
  const limits = await checkGenerationLimits(user, request, config);
  const seconds = config.provider === "offline" ? 2 : 25 + request.itemCount * 3 * request.versions;
  return {
    provider: config.provider,
    model: config.model,
    costEstimate: limits.estimatedCost,
    monthlySpend: limits.monthlySpend,
    monthlyBudget: limits.monthlyBudget,
    runsLastHour: limits.runsLastHour,
    rateLimit: limits.rateLimit,
    estimatedSeconds: seconds,
    versions: request.versions,
    offline: config.provider === "offline",
  };
}

export interface RebalanceResult {
  points: Record<string, number>;
  total: number;
  target: number;
  balanced: boolean;
  adjustments: string[];
}

function roundQuarter(value: number): number {
  return Math.round(value * 4) / 4;
}

/** Riequilibrio assistito: i quesiti bloccati restano fermi, gli altri si scalano. */
export function rebalancePoints(
  items: { id: string; points: number; isLocked: boolean }[],
  target: number,
): RebalanceResult {
  if (items.length === 0) {
    return { points: {}, total: 0, target, balanced: false, adjustments: ["Nessun quesito presente."] };
  }
  const locked = items.filter((item) => item.isLocked);
  const free = items.filter((item) => !item.isLocked);
  const adjustments: string[] = [];
  const points: Record<string, number> = {};
  for (const item of locked) points[item.id] = item.points;
  const fixedSum = locked.reduce((acc, item) => acc + item.points, 0);
  if (free.length === 0) {
    const total = roundQuarter(fixedSum);
    return {
      points,
      total,
      target,
      balanced: Math.abs(total - target) < 0.0001,
      adjustments: ["Tutti i quesiti sono bloccati: sbloccane almeno uno per riequilibrare i punti."],
    };
  }
  const remaining = roundQuarter(target - fixedSum);
  if (remaining < free.length * 0.25) {
    const total = roundQuarter(fixedSum + free.length * 0.25);
    return {
      points,
      total,
      target,
      balanced: false,
      adjustments: [
        `I quesiti bloccati valgono ${fixedSum} pt: restano solo ${remaining} pt per ${free.length} quesiti liberi. Sblocca un quesito o aumenta il totale.`,
      ],
    };
  }
  const freeSum = free.reduce((acc, item) => acc + item.points, 0);
  for (const item of free) {
    const share = freeSum > 0 ? item.points / freeSum : 1 / free.length;
    points[item.id] = Math.max(0.25, roundQuarter(remaining * share));
  }
  let current = roundQuarter(Object.values(points).reduce((acc, value) => acc + value, 0));
  let guard = 0;
  while (Math.abs(current - target) > 0.0001 && guard < 100) {
    const delta = roundQuarter(target - current);
    const candidate = free
      .map((item) => ({ id: item.id, points: points[item.id] }))
      .filter((entry) => entry.points + delta >= 0.25)
      .sort((a, b) => b.points - a.points)[0];
    if (!candidate) break;
    points[candidate.id] = roundQuarter(points[candidate.id] + delta);
    current = roundQuarter(Object.values(points).reduce((acc, value) => acc + value, 0));
    guard += 1;
  }
  if (Math.abs(current - target) > 0.0001) {
    adjustments.push(
      `Impossibile raggiungere esattamente ${target} pt con i vincoli attuali: ottenuti ${current} pt. Usa un totale multiplo di 0,25.`,
    );
  } else if (Math.abs(items.reduce((acc, item) => acc + item.points, 0) - target) > 0.0001) {
    adjustments.push(`Punti riequilibrati: totale da ${items.reduce((acc, item) => acc + item.points, 0)} a ${target} pt.`);
  } else {
    adjustments.push("Il totale era già bilanciato.");
  }
  return { points, total: current, target, balanced: Math.abs(current - target) < 0.0001, adjustments };
}

export async function rebalanceTest(
  testId: string,
  user: SessionUser,
  target?: number,
): Promise<{ test: SerializedTest; result: RebalanceResult }> {
  const test = await getEditableTest(testId, user);
  const desired = target ?? test.totalPoints;
  if (desired <= 0) throw new GenerationError("Il punteggio totale deve essere maggiore di zero.");
  if (Math.abs(desired * 4 - Math.round(desired * 4)) > 1e-9) {
    throw new GenerationError("Il punteggio totale deve essere intero oppure con decimali .25 o .5.");
  }
  const result = rebalancePoints(
    test.items.map((item) => ({ id: item.id, points: item.points, isLocked: item.isLocked })),
    desired,
  );
  if (!result.balanced) throw new GenerationError(result.adjustments.join(" "), result.adjustments);

  // D1 non ha transazioni: aggiorno prima il totale (e lo stato «bozza»), poi i singoli punteggi. Se un
  // aggiornamento fallisce a metà il totale non torna e il riequilibrio si può semplicemente ripetere.
  await prisma.test.update({
    where: { id: testId },
    data: { totalPoints: desired, ...(test.status === "approvata" ? { status: "bozza" } : {}) },
  });
  for (const [id, points] of Object.entries(result.points)) {
    await prisma.item.update({ where: { id }, data: { points } });
  }
  await createVersion(testId, user.id, `Riequilibrio punti (${desired} pt)`);
  await auditSafe(user.id, "riequilibrio", "Test", testId, { target: desired });
  const updated = await getTestForUser(testId, user);
  return { test: serializeTest(updated), result };
}

function toGeneratedItem(item: TestWithRelations["items"][number]): GeneratedItem {
  return {
    id: item.id,
    section_id: item.sectionId,
    type: item.type as GeneratedItem["type"],
    prompt: item.prompt,
    options: parseJson<string[]>(item.options, []),
    correct_option: item.correctOption ?? null,
    points: item.points,
    difficulty: item.difficulty,
    estimated_min: item.estimatedMin,
    topic_code: item.topic?.code ?? "",
    objectives: parseJson<string[]>(item.objectives, []),
    solution_steps: parseJson<string[]>(item.solutionSteps, []),
    grading_criteria: parseJson<string[]>(item.gradingCriteria, []),
    common_errors: parseJson<string[]>(item.commonErrors, []),
    hints: parseJson<string[]>(item.hints, []),
    answer_space: item.answerSpace as GeneratedItem["answer_space"],
    figure_spec: item.figureSpec ? parseJson<Record<string, unknown>>(item.figureSpec, {}) : null,
    is_locked: item.isLocked,
    variant_group: item.variantGroup,
  };
}

export function validateTestForApproval(test: TestWithRelations): RuleReport {
  const report: RuleReport = { errors: [], warnings: [], adjustments: [] };
  const total = Math.round(test.items.reduce((acc, item) => acc + item.points, 0) * 100) / 100;
  if (Math.abs(total - test.totalPoints) > 0.0001) {
    report.errors.push(`La somma dei punti è ${total}, il totale dichiarato è ${test.totalPoints}.`);
  }
  const time = test.items.reduce((acc, item) => acc + item.estimatedMin, 0);
  if (Math.abs(time - test.durationMin) > test.durationMin * 0.1) {
    report.errors.push(`Il tempo stimato (${time} min) è fuori tolleranza rispetto a ${test.durationMin} min (±10%).`);
  }
  if (test.items.length === 0) report.errors.push("La verifica non contiene quesiti.");
  for (const item of test.items) {
    const label = `Quesito ${item.order + 1}`;
    if (parseJson<string[]>(item.solutionSteps, []).length === 0) {
      report.errors.push(`${label}: manca la soluzione svolta.`);
    }
    if (parseJson<string[]>(item.gradingCriteria, []).length === 0) {
      report.errors.push(`${label}: mancano i criteri di punteggio.`);
    }
    if (item.type === "multiple_choice") {
      const options = parseJson<string[]>(item.options, []);
      if (options.length !== 4) report.warnings.push(`${label}: la scelta multipla ha ${options.length} opzioni invece di 4.`);
      if (item.correctOption === null || item.correctOption < 0 || item.correctOption >= options.length) {
        report.errors.push(`${label}: risposta corretta non valida.`);
      }
    }
  }
  const request = parseJson<GenerationRequest | null>(test.requestJson, null);
  if (request?.selectedTopics?.length) {
    const used = new Set(test.items.map((item) => item.topicId).filter(Boolean));
    for (const selected of request.selectedTopics) {
      if (!used.has(selected.topicId)) {
        report.errors.push(`Nessun quesito copre l'argomento selezionato ${selected.topicId}.`);
      }
    }
  }
  for (let i = 0; i < test.items.length; i++) {
    for (let j = i + 1; j < test.items.length; j++) {
      const score = similarity(test.items[i].prompt, test.items[j].prompt);
      if (score >= 0.95) {
        report.errors.push(`I quesiti ${test.items[i].order + 1} e ${test.items[j].order + 1} sono troppo simili.`);
      } else if (score >= 0.85) {
        report.warnings.push(`I quesiti ${test.items[i].order + 1} e ${test.items[j].order + 1} sono simili.`);
      }
    }
  }
  void toGeneratedItem;
  return report;
}

export async function approveTest(testId: string, user: SessionUser): Promise<SerializedTest> {
  const test = await getEditableTest(testId, user);
  const report = validateTestForApproval(test);
  if (report.errors.length > 0) {
    throw new GenerationError("La verifica non può essere approvata: correggi gli errori indicati.", report.errors, report.warnings);
  }
  await prisma.test.update({ where: { id: testId }, data: { status: "approvata" } });
  await createVersion(testId, user.id, "Approvazione");
  await auditSafe(user.id, "approvazione", "Test", testId, { warnings: report.warnings.length });
  const updated = await getTestForUser(testId, user);
  return serializeTest(updated);
}

export async function setTestStatus(
  testId: string,
  user: SessionUser,
  status: "bozza" | "approvata",
): Promise<SerializedTest> {
  if (status === "approvata") return approveTest(testId, user);
  const test = await getEditableTest(testId, user);
  await prisma.test.update({ where: { id: test.id }, data: { status: "bozza" } });
  await createVersion(testId, user.id, "Ripristino bozza");
  await auditSafe(user.id, "stato", "Test", testId, { status });
  const updated = await getTestForUser(testId, user);
  return serializeTest(updated);
}

export async function updateTestMeta(
  testId: string,
  user: SessionUser,
  patch: Record<string, unknown>,
): Promise<{ test: SerializedTest; suggestion: string | null }> {
  const test = await getEditableTest(testId, user);
  const data: Prisma.TestUpdateInput = {};
  const allowed = [
    "title",
    "classLabel",
    "class_label",
    "durationMin",
    "totalPoints",
    "difficultyTarget",
    "calculatorAllowed",
    "formulaSheet",
    "trigTables",
    "noDerivatives",
    "onlyDefinitions",
    "simplifiedLanguage",
    "answerSpace",
  ] as const;
  for (const key of allowed) {
    if (patch[key] === undefined) continue;
    if (key === "class_label") continue;
    (data as Record<string, unknown>)[key] = patch[key];
  }
  if (patch.class_label !== undefined && patch.classLabel === undefined) data.classLabel = String(patch.class_label);
  if (patch.examDate !== undefined) {
    const raw = typeof patch.examDate === "string" ? patch.examDate.trim() : "";
    data.examDate = raw ? new Date(raw) : null;
  }
  if (Object.keys(data).length === 0) {
    return { test: serializeTest(test), suggestion: null };
  }
  if (typeof data.totalPoints === "number" && data.totalPoints <= 0) {
    throw new GenerationError("Il punteggio totale deve essere maggiore di zero.");
  }
  if (test.status === "approvata") data.status = "bozza";
  await prisma.test.update({ where: { id: testId }, data });
  await createVersion(testId, user.id, "Modifica impostazioni");
  await auditSafe(user.id, "modifica", "Test", testId, { fields: Object.keys(data) });
  const updated = await getTestForUser(testId, user);
  const total = updated.items.reduce((acc, item) => acc + item.points, 0);
  const suggestion =
    Math.abs(total - updated.totalPoints) > 0.0001
      ? `La somma dei quesiti è ${total} pt, il totale richiesto è ${updated.totalPoints} pt. Usa «Riequilibra» per allineare i punteggi.`
      : null;
  return { test: serializeTest(updated), suggestion };
}

export async function updateItem(
  testId: string,
  itemId: string,
  user: SessionUser,
  patch: Record<string, unknown>,
): Promise<{ test: SerializedTest; item: ReturnType<typeof serializeItem>; suggestion: string | null }> {
  const test = await getEditableTest(testId, user);
  const item = test.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new GenerationError("Quesito non trovato.");
  // Lo sblocco è l'unica modifica consentita su un quesito bloccato.
  const unlocking = patch.isLocked === false;
  if (item.isLocked && !unlocking) {
    throw new GenerationError("Il quesito è bloccato: sbloccalo prima di modificarlo.");
  }

  const data: Prisma.ItemUpdateInput = {};
  const fields = [
    "prompt",
    "options",
    "correctOption",
    "points",
    "difficulty",
    "estimatedMin",
    "solutionSteps",
    "gradingCriteria",
    "commonErrors",
    "hints",
    "isLocked",
    "answerSpace",
    "order",
    "type",
    "notes",
  ] as const;
  for (const field of fields) {
    if (patch[field] !== undefined) {
      (data as Record<string, unknown>)[field] = patch[field];
    }
  }
  if (patch.topicId !== undefined) {
    if (patch.topicId === null) data.topic = { disconnect: true };
    else data.topic = { connect: { id: String(patch.topicId) } };
  }
  if (data.points !== undefined) {
    const points = Number(data.points);
    if (Math.abs(points * 4 - Math.round(points * 4)) > 1e-9 || points < 0.25) {
      throw new GenerationError("I punti devono essere almeno 0,25 e multipli di 0,25.");
    }
  }
  if (data.type !== undefined && !(ITEM_TYPE_VALUES as string[]).includes(String(data.type))) {
    throw new GenerationError("Tipologia di quesito non valida.");
  }
  data.source = "manuale";
  if (Object.keys(data).length === 0) {
    return { test: serializeTest(test), item: serializeItem(item), suggestion: null };
  }
  // Prima lo stato «bozza», poi la modifica (D1 non ha transazioni).
  if (test.status === "approvata") {
    await prisma.test.update({ where: { id: testId }, data: { status: "bozza" } });
  }
  await prisma.item.update({ where: { id: itemId }, data });
  await createVersion(testId, user.id, "Modifica quesito");
  await auditSafe(user.id, "modifica", "Item", itemId, { fields: Object.keys(data) });
  const updated = await getTestForUser(testId, user);
  const updatedItem = updated.items.find((candidate) => candidate.id === itemId)!;
  const sum = updated.items.reduce((acc, candidate) => acc + candidate.points, 0);
  const suggestion =
    Math.abs(sum - updated.totalPoints) > 0.0001
      ? `Totale attuale ${Math.round(sum * 100) / 100} pt su ${updated.totalPoints} pt. Riequilibra per distribuire la differenza.`
      : null;
  return { test: serializeTest(updated), item: serializeItem(updatedItem), suggestion };
}

function randomSeed(): number {
  return hashString(`${Date.now()}|${Math.random()}`);
}

export async function regenerateItem(
  testId: string,
  itemId: string,
  user: SessionUser,
): Promise<{ test: SerializedTest; item: ReturnType<typeof serializeItem>; warnings: string[] }> {
  const test = await getEditableTest(testId, user);
  const item = test.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new GenerationError("Quesito non trovato.");
  if (item.isLocked) throw new GenerationError("Il quesito è bloccato: sbloccalo prima di rigenerarlo.");
  if (!item.topicId || !item.topic) {
    throw new GenerationError("Il quesito non ha un argomento collegato. Assegna un argomento prima di rigenerarlo.");
  }
  if (!test.curriculumId) throw new GenerationError("La verifica non è collegata a un programma.");

  const curriculum = await loadCurriculum(test.curriculumId);
  const topicRow = curriculum.topics.find((topic) => topic.id === item.topicId);
  if (!topicRow) throw new GenerationError("L'argomento del quesito non appartiene più al programma.");
  const topic = topicContextFromDb(topicRow);
  const type = (ITEM_TYPE_VALUES as string[]).includes(item.type) ? item.type : "exercise";
  const internalRequest = {
    title: test.title,
    track: test.track,
    year: test.year,
    subject: test.subject,
    curriculumId: test.curriculumId,
    classLabel: test.classLabel,
    examDate: test.examDate ? test.examDate.toISOString() : null,
    durationMin: Math.max(1, item.estimatedMin),
    totalPoints: item.points,
    difficultyTarget: item.difficulty,
    selectedTopics: [{ topicId: item.topicId, weight: 100 }],
    itemCount: 1,
    types: [type],
    longProblem: false,
    theoryQuestions: false,
    calculatorAllowed: test.calculatorAllowed,
    formulaSheet: test.formulaSheet,
    trigTables: test.trigTables,
    noDerivatives: test.noDerivatives,
    onlyDefinitions: test.onlyDefinitions,
    simplifiedLanguage: test.simplifiedLanguage,
    answerSpace: test.answerSpace,
    versions: 1,
    vary: "numeri",
    seed: randomSeed(),
  } as GenerationRequest;
  const ruleContext = buildRuleContext(internalRequest, [topic]);
  const config = await getAiConfig();
  const warnings: string[] = [];
  let generatedItem: GeneratedItem;

  if (config.provider === "offline") {
    const generated = generateDeterministic({ request: internalRequest, topics: [topic] });
    const ruled = applyRules(generated.items, ruleContext);
    if (ruled.report.errors.length > 0) {
      throw new GenerationError("La rigenerazione non supera i controlli.", ruled.report.errors);
    }
    generatedItem = ruled.items[0];
    warnings.push(...ruled.report.warnings);
  } else {
    const aiResult = await generateWithAi({
      request: internalRequest,
      topics: [topic],
      ruleContext,
      bankExamples: [],
      recentPrompts: await recentPrompts(user.id, testId),
      config,
      retainPrompts: config.retainPrompts,
    });
    generatedItem = aiResult.test.items[0];
    warnings.push(...aiResult.report.warnings);
  }

  const otherPrompts = test.items.filter((candidate) => candidate.id !== itemId).map((candidate) => candidate.prompt);
  for (const prompt of otherPrompts) {
    if (similarity(prompt, generatedItem.prompt) >= 0.95) {
      warnings.push("Il nuovo quesito è molto simile a un altro presente nella verifica: controllalo.");
      break;
    }
  }

  // Prima lo stato «bozza», poi la modifica (D1 non ha transazioni).
  if (test.status === "approvata") {
    await prisma.test.update({ where: { id: testId }, data: { status: "bozza" } });
  }
  await prisma.item.update({
    where: { id: itemId },
    data: {
      prompt: generatedItem.prompt,
      options: toJson(generatedItem.options ?? []),
      correctOption: generatedItem.correct_option ?? null,
      solutionSteps: toJson(generatedItem.solution_steps),
      gradingCriteria: toJson(generatedItem.grading_criteria),
      commonErrors: toJson(generatedItem.common_errors ?? []),
      hints: toJson(generatedItem.hints ?? []),
      answerSpace: generatedItem.answer_space,
      figureSpec: generatedItem.figure_spec ? toJson(generatedItem.figure_spec) : null,
      aiGenerated: true,
      source: "ai",
      points: item.points,
      difficulty: item.difficulty,
      estimatedMin: item.estimatedMin,
      topicId: item.topicId,
    },
  });
  await createVersion(testId, user.id, "Rigenerazione quesito");
  await auditSafe(user.id, "rigenerazione", "Item", itemId, { provider: config.provider });
  const updated = await getTestForUser(testId, user);
  const updatedItem = updated.items.find((candidate) => candidate.id === itemId)!;
  return { test: serializeTest(updated), item: serializeItem(updatedItem), warnings };
}

export async function duplicateTest(testId: string, user: SessionUser): Promise<SerializedTest> {
  const test = await getTestForUser(testId, user);
  if (!canEditTest(user, test)) throw new GenerationError("Non hai i permessi per duplicare questa verifica.");
  const snapshot = buildSnapshot(test, "Duplicazione");
  // Come in generazione: senza transazioni, se la copia fallisce a metà la elimino.
  let copyId: string | null = null;
  let newId: string;
  try {
    const tx = prisma;
    const copy = await tx.test.create({
      data: {
        title: `Copia di ${test.title}`,
        track: test.track,
        year: test.year,
        subject: test.subject,
        classLabel: test.classLabel,
        examDate: test.examDate,
        durationMin: test.durationMin,
        totalPoints: test.totalPoints,
        difficultyTarget: test.difficultyTarget,
        calculatorAllowed: test.calculatorAllowed,
        formulaSheet: test.formulaSheet,
        trigTables: test.trigTables,
        noDerivatives: test.noDerivatives,
        onlyDefinitions: test.onlyDefinitions,
        simplifiedLanguage: test.simplifiedLanguage,
        answerSpace: test.answerSpace,
        versionLabel: "A",
        status: "bozza",
        seed: randomSeed(),
        requestJson: test.requestJson,
        styleProfile: test.styleProfile,
        aiProvider: test.aiProvider,
        aiModel: test.aiModel,
        aiCostEstimate: 0,
        authorId: user.id,
        curriculumId: test.curriculumId,
        gradeScaleId: test.gradeScaleId,
        parentTestId: test.parentTestId,
        isTemplate: false,
      },
    });
    copyId = copy.id;
    const sectionMap = new Map<string, string>();
    for (const section of [...test.sections].sort((a, b) => a.order - b.order)) {
      const created = await tx.section.create({
        data: { testId: copy.id, title: section.title, description: section.description, order: section.order },
      });
      sectionMap.set(section.id, created.id);
    }
    const itemMap = new Map<string, string>();
    for (const item of [...test.items].sort((a, b) => a.order - b.order)) {
      const created = await tx.item.create({
        data: {
          testId: copy.id,
          sectionId: item.sectionId ? sectionMap.get(item.sectionId) ?? null : null,
          type: item.type,
          prompt: item.prompt,
          options: item.options,
          correctOption: item.correctOption,
          points: item.points,
          difficulty: item.difficulty,
          estimatedMin: item.estimatedMin,
          topicId: item.topicId,
          objectives: item.objectives,
          solutionSteps: item.solutionSteps,
          gradingCriteria: item.gradingCriteria,
          commonErrors: item.commonErrors,
          hints: item.hints,
          answerSpace: item.answerSpace,
          answerLines: item.answerLines,
          figureSpec: item.figureSpec,
          source: item.source,
          isLocked: item.isLocked,
          order: item.order,
          aiGenerated: item.aiGenerated,
          variantGroup: item.variantGroup,
          notes: item.notes,
        },
      });
      itemMap.set(item.id, created.id);
    }
    if (test.rubric) {
      const mapping = parseJson<Record<string, string[]>>(test.rubric.itemMappingJson, {});
      const remapped: Record<string, string[]> = {};
      for (const [oldId, newId] of itemMap) {
        if (mapping[oldId]) remapped[newId] = mapping[oldId];
      }
      await tx.rubric.create({
        data: {
          testId: copy.id,
          indicatorsJson: test.rubric.indicatorsJson,
          levelsJson: test.rubric.levelsJson,
          itemMappingJson: toJson(remapped),
        },
      });
    }
    newId = copy.id;
  } catch (error) {
    if (copyId) await prisma.test.delete({ where: { id: copyId } }).catch(() => undefined);
    throw error;
  }
  await createVersion(newId, user.id, "Duplicazione");
  await auditSafe(user.id, "duplicazione", "Test", newId, { from: testId, snapshot: snapshot.label });
  const created = await getTestForUser(newId, user);
  return serializeTest(created);
}

export async function deleteTest(testId: string, user: SessionUser): Promise<void> {
  const test = await getTestForUser(testId, user);
  if (!canEditTest(user, test)) throw new GenerationError("Non hai i permessi per eliminare questa verifica.");
  await prisma.test.delete({ where: { id: testId } });
  await auditSafe(user.id, "eliminazione", "Test", testId, { title: test.title });
}

export async function saveTestVersion(testId: string, user: SessionUser, label?: string) {
  await getEditableTest(testId, user);
  const version = await createVersion(testId, user.id, label?.trim() || "Salvataggio manuale");
  await auditSafe(user.id, "versione", "Test", testId, { version: version.version });
  return version;
}

export async function restoreTestVersion(
  testId: string,
  versionId: string,
  user: SessionUser,
): Promise<SerializedTest> {
  await getEditableTest(testId, user);
  const version = await prisma.testVersion.findFirst({ where: { id: versionId, testId } });
  if (!version) throw new GenerationError("Versione non trovata.");
  const snapshot = parseJson<ReturnType<typeof buildSnapshot> | null>(version.snapshotJson, null);
  if (!snapshot || snapshot.schemaVersion !== 1) throw new GenerationError("Istantanea non valida.");

  // Senza transazioni, un errore a metà ripristino lascerebbe la verifica incompleta: salvo prima lo stato
  // attuale come versione, così non si perde e si può ripristinare di nuovo.
  await createVersion(testId, user.id, `Prima del ripristino della versione ${version.version}`);
  try {
    const tx = prisma;
    await tx.item.deleteMany({ where: { testId } });
    await tx.section.deleteMany({ where: { testId } });
    await tx.rubric.deleteMany({ where: { testId } });
    await tx.test.update({
      where: { id: testId },
      data: {
        title: snapshot.test.title,
        classLabel: snapshot.test.classLabel,
        examDate: snapshot.test.examDate ? new Date(snapshot.test.examDate) : null,
        durationMin: snapshot.test.durationMin,
        totalPoints: snapshot.test.totalPoints,
        difficultyTarget: snapshot.test.difficultyTarget,
        calculatorAllowed: snapshot.test.calculatorAllowed,
        formulaSheet: snapshot.test.formulaSheet,
        trigTables: snapshot.test.trigTables,
        noDerivatives: snapshot.test.noDerivatives,
        onlyDefinitions: snapshot.test.onlyDefinitions,
        simplifiedLanguage: snapshot.test.simplifiedLanguage,
        answerSpace: snapshot.test.answerSpace,
        status: "bozza",
      },
    });
    const sectionMap = new Map<string, string>();
    for (const section of snapshot.sections) {
      const created = await tx.section.create({
        data: { testId, title: section.title, description: section.description, order: section.order },
      });
      sectionMap.set(section.id, created.id);
    }
    const itemMap = new Map<string, string>();
    for (const item of snapshot.items) {
      const created = await tx.item.create({
        data: {
          testId,
          sectionId: item.sectionId ? sectionMap.get(item.sectionId) ?? null : null,
          type: item.type,
          prompt: item.prompt,
          options: toJson(item.options),
          correctOption: item.correctOption,
          points: item.points,
          difficulty: item.difficulty,
          estimatedMin: item.estimatedMin,
          topicId: item.topicId,
          objectives: toJson(item.objectives),
          solutionSteps: toJson(item.solutionSteps),
          gradingCriteria: toJson(item.gradingCriteria),
          commonErrors: toJson(item.commonErrors),
          hints: toJson(item.hints),
          answerSpace: item.answerSpace,
          answerLines: item.answerLines,
          figureSpec: item.figureSpec ? toJson(item.figureSpec) : null,
          source: item.source,
          isLocked: item.isLocked,
          order: item.order,
          aiGenerated: item.aiGenerated,
          variantGroup: item.variantGroup,
          notes: item.notes,
        },
      });
      itemMap.set(item.id, created.id);
    }
    const remapped: Record<string, string[]> = {};
    for (const [oldId, newId] of itemMap) {
      if (snapshot.rubric.itemMapping[oldId]) remapped[newId] = snapshot.rubric.itemMapping[oldId];
    }
    await tx.rubric.create({
      data: {
        testId,
        indicatorsJson: toJson(snapshot.rubric.indicators),
        levelsJson: toJson(snapshot.rubric.levels),
        itemMappingJson: toJson(remapped),
      },
    });
  } catch (error) {
    console.error("ripristino versione fallito", error);
    throw new GenerationError(
      "Il ripristino non è stato completato. Riprova: il contenuto di prima è salvato nella versione «Prima del ripristino».",
    );
  }
  await createVersion(testId, user.id, `Ripristino versione ${version.version}`);
  await auditSafe(user.id, "ripristino", "Test", testId, { version: version.version });
  const restored = await getTestForUser(testId, user);
  return serializeTest(restored);
}

export async function duplicateItem(
  testId: string,
  itemId: string,
  user: SessionUser,
): Promise<SerializedTest> {
  const test = await getEditableTest(testId, user);
  const item = test.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new GenerationError("Quesito non trovato.");
  // Prima lo stato «bozza», poi la modifica (D1 non ha transazioni).
  if (test.status === "approvata") {
    await prisma.test.update({ where: { id: testId }, data: { status: "bozza" } });
  }
  await prisma.item.updateMany({
    where: { testId, order: { gte: item.order + 1 } },
    data: { order: { increment: 1 } },
  });
  await prisma.item.create({
    data: {
      testId,
      sectionId: item.sectionId,
      type: item.type,
      prompt: item.prompt,
      options: item.options,
      correctOption: item.correctOption,
      points: item.points,
      difficulty: item.difficulty,
      estimatedMin: item.estimatedMin,
      topicId: item.topicId,
      objectives: item.objectives,
      solutionSteps: item.solutionSteps,
      gradingCriteria: item.gradingCriteria,
      commonErrors: item.commonErrors,
      hints: item.hints,
      answerSpace: item.answerSpace,
      answerLines: item.answerLines,
      figureSpec: item.figureSpec,
      source: item.source,
      isLocked: false,
      order: item.order + 1,
      aiGenerated: item.aiGenerated,
      variantGroup: item.variantGroup,
      notes: item.notes ? `${item.notes} (copia)` : "Copia",
    },
  });
  await createVersion(testId, user.id, "Duplicazione quesito");
  await auditSafe(user.id, "duplicazione", "Item", itemId, {});
  const updated = await getTestForUser(testId, user);
  return serializeTest(updated);
}

export async function deleteItem(
  testId: string,
  itemId: string,
  user: SessionUser,
): Promise<SerializedTest> {
  const test = await getEditableTest(testId, user);
  const item = test.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new GenerationError("Quesito non trovato.");
  if (test.items.length <= 1) throw new GenerationError("La verifica deve contenere almeno un quesito.");
  // Prima lo stato «bozza», poi la modifica (D1 non ha transazioni).
  if (test.status === "approvata") {
    await prisma.test.update({ where: { id: testId }, data: { status: "bozza" } });
  }
  await prisma.item.delete({ where: { id: itemId } });
  await prisma.item.updateMany({
    where: { testId, order: { gt: item.order } },
    data: { order: { decrement: 1 } },
  });
  await createVersion(testId, user.id, "Eliminazione quesito");
  await auditSafe(user.id, "eliminazione", "Item", itemId, {});
  const updated = await getTestForUser(testId, user);
  return serializeTest(updated);
}

export async function reorderItems(
  testId: string,
  orderedIds: string[],
  user: SessionUser,
): Promise<SerializedTest> {
  const test = await getEditableTest(testId, user);
  const current = new Set(test.items.map((item) => item.id));
  if (orderedIds.length !== current.size || orderedIds.some((id) => !current.has(id))) {
    throw new GenerationError("L'ordine proposto non contiene tutti i quesiti della verifica.");
  }
  // D1 non ha transazioni: se un aggiornamento fallisce il riordino si può ripetere.
  for (let order = 0; order < orderedIds.length; order++) {
    await prisma.item.update({ where: { id: orderedIds[order] }, data: { order } });
  }
  await createVersion(testId, user.id, "Riordino quesiti");
  await auditSafe(user.id, "riordino", "Test", testId, {});
  const updated = await getTestForUser(testId, user);
  return serializeTest(updated);
}

export async function exportTestJson(testId: string, user: SessionUser): Promise<Record<string, unknown>> {
  const test = await getTestForUser(testId, user);
  await auditSafe(user.id, "export", "Test", testId, { format: "json" });
  return toExportJson(test);
}

export async function createVariantFromRequest(
  testId: string,
  user: SessionUser,
  label = "B",
): Promise<SerializedTest> {
  const test = await getEditableTest(testId, user);
  const request = parseJson<GenerationRequest | null>(test.requestJson, null);
  if (!request) throw new GenerationError("La richiesta originale della verifica non è disponibile.");
  const result = await generateTests({
    user,
    request: {
      ...request,
      title: test.title.replace(/ — Versione [A-D]$/, ""),
      versions: 1,
      seed: randomSeed(),
    },
  });
  if (result.primaryId !== testId) {
    await prisma.test.update({
      where: { id: result.primaryId },
      data: { parentTestId: testId, versionLabel: label },
    });
    await prisma.test.update({ where: { id: result.primaryId }, data: { title: `${test.title} — Versione ${label}` } });
  }
  const created = await getTestForUser(result.primaryId, user);
  await auditSafe(user.id, "variante", "Test", result.primaryId, { from: testId, label });
  return serializeTest(created);
}
