import { z } from "zod";
import { ITEM_TYPE_VALUES } from "./constants";

export const pointValueSchema = z
  .number()
  .min(0.25)
  .max(100)
  .refine((v) => Math.abs(v * 4 - Math.round(v * 4)) < 1e-9, "I punti devono essere interi o con .25/.5");

export const requestedTopicSchema = z.object({
  topicId: z.string().min(1),
  weight: z.number().min(0).max(100).default(10),
});

export const generationRequestSchema = z.object({
  title: z.string().trim().min(3, "Titolo troppo corto").max(160),
  track: z.enum(["classico", "scientifico"]),
  year: z.coerce.number().int().min(1).max(5),
  subject: z.enum(["matematica", "fisica"]),
  curriculumId: z.string().min(1, "Seleziona un curriculum"),
  classLabel: z.string().max(60).optional().default(""),
  examDate: z.string().optional().nullable(),
  durationMin: z.coerce.number().int().min(20).max(240),
  totalPoints: z.coerce.number().min(1).max(200),
  difficultyTarget: z.coerce.number().min(1).max(5),
  selectedTopics: z.array(requestedTopicSchema).min(1, "Seleziona almeno un argomento"),
  itemCount: z.coerce.number().int().min(3).max(20),
  types: z.array(z.enum(ITEM_TYPE_VALUES as [string, ...string[]])).min(1, "Seleziona almeno una tipologia"),
  longProblem: z.boolean().default(false),
  theoryQuestions: z.boolean().default(false),
  calculatorAllowed: z.boolean().default(false),
  formulaSheet: z.boolean().default(false),
  trigTables: z.boolean().default(false),
  noDerivatives: z.boolean().default(false),
  onlyDefinitions: z.boolean().default(false),
  simplifiedLanguage: z.boolean().default(false),
  answerSpace: z.boolean().default(true),
  versions: z.coerce.number().int().min(1).max(4).default(1),
  vary: z.enum(["numeri", "ordine", "domande"]).default("numeri"),
  seed: z.coerce.number().int().min(0).max(2_000_000_000).optional(),
});

export type GenerationRequest = z.infer<typeof generationRequestSchema>;

export const generatedItemSchema = z.object({
  id: z.string().min(1),
  section_id: z.string().min(1).optional().nullable(),
  type: z.enum(ITEM_TYPE_VALUES as [string, ...string[]]),
  prompt: z.string().min(5),
  options: z.array(z.string()).default([]),
  correct_option: z.number().int().min(0).nullable().default(null),
  points: pointValueSchema,
  difficulty: z.number().int().min(1).max(5),
  estimated_min: z.number().min(1).max(60),
  topic_code: z.string().min(1),
  objectives: z.array(z.string()).default([]),
  solution_steps: z.array(z.string()).min(1),
  grading_criteria: z.array(z.string()).min(1),
  common_errors: z.array(z.string()).default([]),
  hints: z.array(z.string()).default([]),
  answer_space: z.enum(["none", "lined", "grid", "box"]).default("lined"),
  figure_spec: z.record(z.unknown()).nullable().optional(),
  is_locked: z.boolean().default(false),
  variant_group: z.string().optional().nullable(),
});

export const generatedSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
});

export const generatedRubricSchema = z.object({
  indicators: z.array(z.string()).min(1),
  item_mapping: z.record(z.array(z.string())).default({}),
  levels: z
    .array(
      z.object({
        level: z.number().int().min(1).max(6),
        label: z.string(),
        descriptor: z.string(),
      }),
    )
    .min(2),
});

export const generatedTestSchema = z.object({
  meta: z.object({
    title: z.string().min(3),
    track: z.enum(["classico", "scientifico"]),
    year: z.number().int().min(1).max(5),
    subject: z.enum(["matematica", "fisica"]),
    duration_min: z.number().min(10),
    total_points: z.number().min(1),
    difficulty_target: z.number().min(1).max(5),
    calculator_allowed: z.boolean().default(false),
  }),
  sections: z.array(generatedSectionSchema).min(1),
  items: z.array(generatedItemSchema).min(1),
  rubric: generatedRubricSchema.optional(),
});

export type GeneratedTest = z.infer<typeof generatedTestSchema>;
export type GeneratedItem = z.infer<typeof generatedItemSchema>;
export type GeneratedRubric = z.infer<typeof generatedRubricSchema>;

export const gradeMappingSchema = z.object({
  mode: z.enum(["lineare", "scaglioni"]).default("lineare"),
  bands: z
    .array(z.object({ minPercent: z.number().min(0).max(100), grade: z.number().min(1).max(10) }))
    .optional(),
});

export type GradeMapping = z.infer<typeof gradeMappingSchema>;

export const testPatchSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  classLabel: z.string().max(60).optional(),
  examDate: z
    .string()
    .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), "Data non valida")
    .optional()
    .nullable(),
  durationMin: z.coerce.number().int().min(20).max(240).optional(),
  totalPoints: z.coerce.number().min(1).max(200).optional(),
  difficultyTarget: z.coerce.number().min(1).max(5).optional(),
  calculatorAllowed: z.boolean().optional(),
  formulaSheet: z.boolean().optional(),
  trigTables: z.boolean().optional(),
  noDerivatives: z.boolean().optional(),
  onlyDefinitions: z.boolean().optional(),
  simplifiedLanguage: z.boolean().optional(),
  answerSpace: z.boolean().optional(),
  status: z.enum(["bozza", "approvata"]).optional(),
  class_label: z.string().max(60).optional(),
});

export const itemPatchSchema = z.object({
  prompt: z.string().min(3).optional(),
  options: z.array(z.string()).optional(),
  correctOption: z.number().int().min(0).nullable().optional(),
  points: pointValueSchema.optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  estimatedMin: z.number().int().min(1).max(60).optional(),
  solutionSteps: z.array(z.string()).optional(),
  gradingCriteria: z.array(z.string()).optional(),
  commonErrors: z.array(z.string()).optional(),
  hints: z.array(z.string()).optional(),
  isLocked: z.boolean().optional(),
  answerSpace: z.enum(["none", "lined", "grid", "box"]).optional(),
  order: z.number().int().min(0).optional(),
  type: z.enum(ITEM_TYPE_VALUES as [string, ...string[]]).optional(),
  topicId: z.string().nullable().optional(),
  notes: z.string().max(1000).optional(),
});

export type ItemPatch = z.infer<typeof itemPatchSchema>;

export const curriculumImportSchema = z.object({
  track: z.enum(["classico", "scientifico"]),
  year: z.coerce.number().int().min(1).max(5),
  subject: z.enum(["matematica", "fisica"]),
  title: z.string().trim().min(3).max(160),
  text: z.string().min(20, "Incolla il testo del programma (almeno 20 caratteri)").max(200_000),
});

export const loginSchema = z.object({
  email: z.string().email("Email non valida"),
  password: z.string().min(1, "Inserisci la password"),
});

export const userCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(2).max(80),
  password: z.string().min(8, "Almeno 8 caratteri"),
  role: z.enum(["admin", "teacher"]),
  subjects: z.array(z.enum(["matematica", "fisica"])).default([]),
  tracks: z.array(z.enum(["classico", "scientifico"])).default([]),
});

export const itemBankSchema = z.object({
  itemSnapshot: z.record(z.unknown()),
  visibility: z.enum(["privato", "dipartimento", "pubblico interno"]).default("dipartimento"),
  tags: z.array(z.string()).default([]),
  notes: z.string().max(500).default(""),
  sourceTestId: z.string().optional(),
});

export const exportRequestSchema = z.object({
  format: z.enum(["tex", "pdf", "zip", "json"]),
  kind: z.enum(["verifica", "soluzioni", "griglia", "pacchetto"]).default("verifica"),
});
