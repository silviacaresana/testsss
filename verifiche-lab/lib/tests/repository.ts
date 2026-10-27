import { Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEFAULT_INDICATORS, DEFAULT_LEVELS } from "@/lib/constants";
import type { SessionUser } from "@/lib/auth/session";
import { parseJson, toJson } from "@/lib/utils";

export const testInclude = Prisma.validator<Prisma.TestInclude>()({
  items: { include: { topic: true }, orderBy: { order: "asc" } },
  sections: { orderBy: { order: "asc" } },
  rubric: true,
  gradeScale: true,
  author: { select: { name: true } },
  curriculum: true,
});

export type TestWithRelations = Prisma.TestGetPayload<{ include: typeof testInclude }>;

export interface SerializedItem {
  id: string;
  sectionId: string | null;
  type: string;
  prompt: string;
  options: string[];
  correctOption: number | null;
  points: number;
  difficulty: number;
  estimatedMin: number;
  topicId: string | null;
  topicCode: string | null;
  topicName: string | null;
  objectives: string[];
  solutionSteps: string[];
  gradingCriteria: string[];
  commonErrors: string[];
  hints: string[];
  answerSpace: string;
  answerLines: number;
  figureSpec: unknown;
  source: string;
  isLocked: boolean;
  order: number;
  aiGenerated: boolean;
  variantGroup: string | null;
  notes: string;
}

export interface SerializedSection {
  id: string;
  title: string;
  description: string;
  order: number;
  items: SerializedItem[];
}

export interface SerializedTest {
  id: string;
  title: string;
  track: string;
  year: number;
  subject: string;
  classLabel: string;
  examDate: string | null;
  durationMin: number;
  totalPoints: number;
  difficultyTarget: number;
  calculatorAllowed: boolean;
  formulaSheet: boolean;
  trigTables: boolean;
  noDerivatives: boolean;
  onlyDefinitions: boolean;
  simplifiedLanguage: boolean;
  answerSpace: boolean;
  versionLabel: string;
  status: string;
  seed: number;
  styleProfile: string;
  aiProvider: string;
  aiModel: string;
  aiCostEstimate: number;
  authorId: string;
  authorName: string;
  curriculumId: string | null;
  curriculumTitle: string | null;
  gradeScaleId: string | null;
  gradeScale: {
    id: string;
    name: string;
    totalPoints: number;
    sufficiencyThreshold: number;
    mapping: unknown;
    isDefault: boolean;
  } | null;
  parentTestId: string | null;
  isTemplate: boolean;
  createdAt: string;
  updatedAt: string;
  sections: SerializedSection[];
  items: SerializedItem[];
  rubric: {
    indicators: string[];
    levels: { level: number; label: string; descriptor: string }[];
    itemMapping: Record<string, string[]>;
  };
  totalSum: number;
  totalTime: number;
  balanced: boolean;
  timeInTolerance: boolean;
}

export function serializeItem(item: TestWithRelations["items"][number]): SerializedItem {
  return {
    id: item.id,
    sectionId: item.sectionId,
    type: item.type,
    prompt: item.prompt,
    options: parseJson<string[]>(item.options, []),
    correctOption: item.correctOption,
    points: item.points,
    difficulty: item.difficulty,
    estimatedMin: item.estimatedMin,
    topicId: item.topicId,
    topicCode: item.topic?.code ?? null,
    topicName: item.topic?.name ?? null,
    objectives: parseJson<string[]>(item.objectives, []),
    solutionSteps: parseJson<string[]>(item.solutionSteps, []),
    gradingCriteria: parseJson<string[]>(item.gradingCriteria, []),
    commonErrors: parseJson<string[]>(item.commonErrors, []),
    hints: parseJson<string[]>(item.hints, []),
    answerSpace: item.answerSpace,
    answerLines: item.answerLines,
    figureSpec: item.figureSpec ? parseJson<unknown>(item.figureSpec, null) : null,
    source: item.source,
    isLocked: item.isLocked,
    order: item.order,
    aiGenerated: item.aiGenerated,
    variantGroup: item.variantGroup,
    notes: item.notes,
  };
}

export function serializeTest(test: TestWithRelations): SerializedTest {
  const items = [...test.items].sort((a, b) => a.order - b.order);
  const sections = [...test.sections].sort((a, b) => a.order - b.order);
  const serializedItems = items.map(serializeItem);
  const indicators = test.rubric
    ? parseJson<string[]>(test.rubric.indicatorsJson, [...DEFAULT_INDICATORS])
    : [...DEFAULT_INDICATORS];
  const levels = test.rubric
    ? parseJson<{ level: number; label: string; descriptor: string }[]>(
        test.rubric.levelsJson,
        DEFAULT_LEVELS.map((level) => ({ ...level })),
      )
    : DEFAULT_LEVELS.map((level) => ({ ...level }));
  const itemMapping = test.rubric ? parseJson<Record<string, string[]>>(test.rubric.itemMappingJson, {}) : {};
  const totalSum = Math.round(serializedItems.reduce((acc, item) => acc + item.points, 0) * 100) / 100;
  const totalTime = serializedItems.reduce((acc, item) => acc + item.estimatedMin, 0);

  return {
    id: test.id,
    title: test.title,
    track: test.track,
    year: test.year,
    subject: test.subject,
    classLabel: test.classLabel,
    examDate: test.examDate ? test.examDate.toISOString() : null,
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
    versionLabel: test.versionLabel,
    status: test.status,
    seed: test.seed,
    styleProfile: test.styleProfile,
    aiProvider: test.aiProvider,
    aiModel: test.aiModel,
    aiCostEstimate: test.aiCostEstimate,
    authorId: test.authorId,
    authorName: test.author.name,
    curriculumId: test.curriculumId,
    curriculumTitle: test.curriculum?.title ?? null,
    gradeScaleId: test.gradeScaleId,
    gradeScale: test.gradeScale
      ? {
          id: test.gradeScale.id,
          name: test.gradeScale.name,
          totalPoints: test.gradeScale.totalPoints,
          sufficiencyThreshold: test.gradeScale.sufficiencyThreshold,
          mapping: parseJson<unknown>(test.gradeScale.mappingJson, { mode: "lineare" }),
          isDefault: test.gradeScale.isDefault,
        }
      : null,
    parentTestId: test.parentTestId,
    isTemplate: test.isTemplate,
    createdAt: test.createdAt.toISOString(),
    updatedAt: test.updatedAt.toISOString(),
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      order: section.order,
      items: serializedItems.filter((item) => item.sectionId === section.id),
    })),
    items: serializedItems,
    rubric: { indicators, levels, itemMapping },
    totalSum,
    totalTime,
    balanced: Math.abs(totalSum - test.totalPoints) < 0.0001,
    timeInTolerance: Math.abs(totalTime - test.durationMin) <= test.durationMin * 0.1,
  };
}

export function canAccessTest(
  user: Pick<SessionUser, "id" | "role">,
  test: Pick<TestWithRelations, "authorId" | "isTemplate">,
): boolean {
  if (user.role === "admin") return true;
  return test.authorId === user.id || test.isTemplate;
}

export function canEditTest(
  user: Pick<SessionUser, "id" | "role">,
  test: Pick<TestWithRelations, "authorId">,
): boolean {
  return user.role === "admin" || test.authorId === user.id;
}

export async function getTestForUser(id: string, user: Pick<SessionUser, "id" | "role">): Promise<TestWithRelations> {
  const test = await prisma.test.findUnique({ where: { id }, include: testInclude });
  if (!test) throw new Error("Verifica non trovata.");
  if (!canAccessTest(user, test)) {
    throw new Error("Non hai i permessi per accedere a questa verifica.");
  }
  return test;
}

export async function getEditableTest(
  id: string,
  user: Pick<SessionUser, "id" | "role">,
): Promise<TestWithRelations> {
  const test = await getTestForUser(id, user);
  if (!canEditTest(user, test)) {
    throw new Error("Questa verifica è in sola lettura: non sei l'autore.");
  }
  return test;
}

export async function getPublicUser(userId: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id: userId } });
}

export interface TestSnapshot {
  schemaVersion: 1;
  capturedAt: string;
  label: string;
  test: {
    title: string;
    track: string;
    year: number;
    subject: string;
    classLabel: string;
    examDate: string | null;
    durationMin: number;
    totalPoints: number;
    difficultyTarget: number;
    calculatorAllowed: boolean;
    formulaSheet: boolean;
    trigTables: boolean;
    noDerivatives: boolean;
    onlyDefinitions: boolean;
    simplifiedLanguage: boolean;
    answerSpace: boolean;
    status: string;
    versionLabel: string;
  };
  sections: { id: string; title: string; description: string; order: number }[];
  items: SerializedItem[];
  rubric: {
    indicators: string[];
    levels: { level: number; label: string; descriptor: string }[];
    itemMapping: Record<string, string[]>;
  };
}

export function buildSnapshot(test: TestWithRelations, label = "Salvataggio manuale"): TestSnapshot {
  const serialized = serializeTest(test);
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    label,
    test: {
      title: serialized.title,
      track: serialized.track,
      year: serialized.year,
      subject: serialized.subject,
      classLabel: serialized.classLabel,
      examDate: serialized.examDate,
      durationMin: serialized.durationMin,
      totalPoints: serialized.totalPoints,
      difficultyTarget: serialized.difficultyTarget,
      calculatorAllowed: serialized.calculatorAllowed,
      formulaSheet: serialized.formulaSheet,
      trigTables: serialized.trigTables,
      noDerivatives: serialized.noDerivatives,
      onlyDefinitions: serialized.onlyDefinitions,
      simplifiedLanguage: serialized.simplifiedLanguage,
      answerSpace: serialized.answerSpace,
      status: serialized.status,
      versionLabel: serialized.versionLabel,
    },
    sections: serialized.sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      order: section.order,
    })),
    items: serialized.items,
    rubric: serialized.rubric,
  };
}

export async function createVersion(
  testId: string,
  userId: string,
  label = "Salvataggio manuale",
): Promise<{ id: string; version: number; createdAt: Date }> {
  const test = await prisma.test.findUnique({ where: { id: testId }, include: testInclude });
  if (!test) throw new Error("Verifica non trovata.");
  const last = await prisma.testVersion.findFirst({
    where: { testId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const next = (last?.version ?? 0) + 1;
  const snapshot = buildSnapshot(test, label);
  return prisma.testVersion.create({
    data: { testId, version: next, label, snapshotJson: toJson(snapshot), createdById: userId },
    select: { id: true, version: true, createdAt: true },
  });
}

export async function listVersions(testId: string) {
  const versions = await prisma.testVersion.findMany({
    where: { testId },
    orderBy: { version: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
  return versions.map((version) => ({
    id: version.id,
    version: version.version,
    label: version.label,
    createdAt: version.createdAt.toISOString(),
    authorName: version.createdBy.name,
  }));
}

export function parseSnapshot(raw: string): TestSnapshot {
  const parsed = parseJson<TestSnapshot | null>(raw, null);
  if (!parsed || parsed.schemaVersion !== 1) throw new Error("Istantanea della versione non valida.");
  return parsed;
}

export function toExportJson(test: TestWithRelations): Record<string, unknown> {
  const serialized = serializeTest(test);
  return {
    formato: "VerificheLab/1",
    generatoIl: new Date().toISOString(),
    verifica: serialized,
    metadati: {
      istituto: process.env.INSTITUTE_NAME ?? "",
      autore: test.author.name,
      curriculum: test.curriculum?.title ?? null,
      provider: test.aiProvider,
      modello: test.aiModel,
      costoStimato: test.aiCostEstimate,
    },
  };
}

export function topicIdsFromRequest(requestJson: string): string[] {
  const parsed = parseJson<{ selectedTopics?: { topicId?: string }[] }>(requestJson, {});
  return (parsed.selectedTopics ?? []).map((topic) => topic.topicId ?? "").filter(Boolean);
}
