import { prisma } from "@/lib/db";
import { CURRICULA, type CurriculumSeed } from "@/lib/seed-data";
import { toJson } from "@/lib/utils";

/**
 * Dati di base dell'app, creati al primo accesso se mancano:
 *  - l'utente condiviso (l'app non ha account: tutte le verifiche appartengono a lui);
 *  - le scale di conversione dei voti;
 *  - i programmi dimostrativi.
 *
 * Idempotente: usa id fissi e ricerche per chiave unica, quindi due richieste contemporanee
 * al primo avvio non duplicano nulla (la seconda trova i dati già presenti o fallisce sul
 * vincolo di unicità, che qui viene ignorato).
 */

export const SHARED_USER_ID = "utente-condiviso";

export const SHARED_USER = {
  id: SHARED_USER_ID,
  email: "dipartimento@verifichelab.local",
  name: "Dipartimento",
  role: "admin",
  subjects: toJson(["matematica", "fisica"]),
  tracks: toJson(["classico", "scientifico"]),
} as const;

const SCALE_LINEAR_ID = "scala-lineare-100";
const SCALE_BANDS_ID = "scala-scaglioni-10";

const BANDS = [
  { minPercent: 0, grade: 1 },
  { minPercent: 20, grade: 2 },
  { minPercent: 30, grade: 3 },
  { minPercent: 40, grade: 4 },
  { minPercent: 50, grade: 5 },
  { minPercent: 60, grade: 6 },
  { minPercent: 70, grade: 7 },
  { minPercent: 80, grade: 8 },
  { minPercent: 90, grade: 9 },
  { minPercent: 95, grade: 10 },
];

let completed = false;

async function ensureCurriculum(seed: CurriculumSeed) {
  const existing = await prisma.curriculum.findFirst({
    where: { track: seed.track, year: seed.year, subject: seed.subject, version: 1 },
    select: { id: true },
  });
  if (existing) return;

  await prisma.curriculum
    .create({
      data: {
        track: seed.track,
        year: seed.year,
        subject: seed.subject,
        version: 1,
        status: "pubblicato",
        title: seed.title,
        notes: seed.notes,
        authorId: SHARED_USER_ID,
        publishedAt: new Date(),
        topics: {
          create: seed.topics.map((topic, index) => ({
            code: topic.code,
            name: topic.name,
            description: topic.description,
            weightHint: topic.weightHint,
            difficultyMin: topic.difficultyMin,
            difficultyMax: topic.difficultyMax,
            isCore: true,
            order: index,
            objectives: {
              create: topic.objectives.map((objective) => ({
                code: objective.code,
                text: objective.text,
                keywords: toJson(objective.keywords ?? []),
                prerequisites: toJson([]),
              })),
            },
          })),
        },
      },
    })
    .catch(() => undefined); // creato nel frattempo da un'altra richiesta
}

export async function ensureBaseData(): Promise<void> {
  if (completed) return;

  await prisma.user.upsert({
    where: { id: SHARED_USER_ID },
    update: {},
    create: { ...SHARED_USER, passwordHash: "" },
  });

  await prisma.gradeScale.upsert({
    where: { id: SCALE_LINEAR_ID },
    update: {},
    create: {
      id: SCALE_LINEAR_ID,
      name: "Scala dipartimento (100 punti)",
      totalPoints: 100,
      sufficiencyThreshold: 60,
      mappingJson: toJson({ mode: "lineare" }),
      isDefault: true,
    },
  });
  await prisma.gradeScale.upsert({
    where: { id: SCALE_BANDS_ID },
    update: {},
    create: {
      id: SCALE_BANDS_ID,
      name: "Scala a scaglioni (10°)",
      totalPoints: 100,
      sufficiencyThreshold: 60,
      mappingJson: toJson({ mode: "scaglioni", bands: BANDS }),
      isDefault: false,
    },
  });

  for (const curriculum of CURRICULA) {
    await ensureCurriculum(curriculum);
  }

  completed = true;
}
