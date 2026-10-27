/**
 * Seed dimostrativo di VerificheLab.
 *
 * Crea:
 *  - tre account (un amministratore e due docenti);
 *  - due scale di conversione (lineare e a scaglioni);
 *  - due programmi di Matematica per la 1ª (Classico e Scientifico) con
 *    contenuti segnaposto dichiaratamente non ministeriali;
 *  - due verifiche complete da 100 punti / 60 minuti (una approvata, una bozza);
 *  - dieci quesiti nella banca condivisa.
 *
 * Il seed è idempotente: se i programmi o le verifiche dimostrative esistono già
 * non vengono duplicati. Usa `npm run db:reset` per ricostruire da zero.
 */

import { prisma } from "../lib/db";
import { hashPassword } from "../lib/auth/password";
import { toJson } from "../lib/utils";
import { approveTest, generateTests } from "../lib/generation/service";
import { serializeBankSnapshot } from "../lib/ai/context";
import type { SessionUser } from "../lib/auth/session";
import type { GenerationRequest } from "../lib/schemas";

const PASSWORD_ADMIN = "Admin1234!";
const PASSWORD_TEACHER = "Docente1234!";

const ADMIN_EMAIL = "admin@verifichelab.local";
const TEACHER_EMAIL = "docente@verifichelab.local";
const SECOND_TEACHER_EMAIL = "prof.rossi@verifichelab.local";

const DEMO_NOTE = "DEMO-SEED — contenuto segnaposto per la dimostrazione, non è un programma ministeriale.";
const EXAM_DATE = "2026-11-12";

interface ObjectiveSeed {
  code: string;
  text: string;
  keywords?: string[];
}

interface TopicSeed {
  code: string;
  name: string;
  description: string;
  weightHint: number;
  difficultyMin: number;
  difficultyMax: number;
  objectives: ObjectiveSeed[];
}

interface CurriculumSeed {
  track: "classico" | "scientifico";
  year: number;
  subject: "matematica" | "fisica";
  title: string;
  notes: string;
  topics: TopicSeed[];
}

const CLASSICO_TOPICS: TopicSeed[] = [
  {
    code: "CLA1.PERC",
    name: "Insiemi numerici e percentuali",
    description: "Ripasso dei numeri naturali, interi e razionali; calcolo percentuale in contesti quotidiani.",
    weightHint: 10,
    difficultyMin: 1,
    difficultyMax: 2,
    objectives: [
      { code: "CLA1.PERC.1", text: "Riconoscere e rappresentare numeri naturali, interi e razionali.", keywords: ["numeri", "razionali"] },
      { code: "CLA1.PERC.2", text: "Calcolare percentuali e applicarle a problemi di sconto e aumento.", keywords: ["percentuali", "sconto"] },
      { code: "CLA1.PERC.3", text: "Passare dalla frazione alla percentuale e viceversa.", keywords: ["frazioni"] },
    ],
  },
  {
    code: "CLA1.EQ",
    name: "Equazioni di primo grado",
    description: "Equazioni lineari a un'incognita, principi di equivalenza e verifica della soluzione.",
    weightHint: 15,
    difficultyMin: 1,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.EQ.1", text: "Riconoscere un'equazione di primo grado e il suo insieme di definizione.", keywords: ["equazioni"] },
      { code: "CLA1.EQ.2", text: "Applicare i principi di equivalenza per isolare l'incognita.", keywords: ["equivalenza"] },
      { code: "CLA1.EQ.3", text: "Verificare la soluzione sostituendola nell'equazione.", keywords: ["verifica"] },
    ],
  },
  {
    code: "CLA1.DIS",
    name: "Disequazioni di primo grado",
    description: "Disequazioni lineari, rappresentazione dell'insieme soluzione e intervalli.",
    weightHint: 10,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.DIS.1", text: "Risolvere disequazioni lineari applicando i principi di equivalenza.", keywords: ["disequazioni"] },
      { code: "CLA1.DIS.2", text: "Rappresentare l'insieme soluzione sulla retta orientata.", keywords: ["intervalli"] },
    ],
  },
  {
    code: "CLA1.POL",
    name: "Polinomi e scomposizioni",
    description: "Operazioni tra polinomi, prodotti notevoli e scomposizione di trinomi.",
    weightHint: 15,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.POL.1", text: "Eseguire addizioni, sottrazioni e moltiplicazioni tra polinomi.", keywords: ["polinomi"] },
      { code: "CLA1.POL.2", text: "Scomporre un trinomio di secondo grado con somma e prodotto.", keywords: ["scomposizione"] },
    ],
  },
  {
    code: "CLA1.GEO",
    name: "Geometria del piano: perimetro e area",
    description: "Figure piane, perimetro, area e applicazioni semplici del teorema di Pitagora.",
    weightHint: 15,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.GEO.1", text: "Calcolare perimetro e area delle principali figure piane.", keywords: ["area", "perimetro"] },
      { code: "CLA1.GEO.2", text: "Applicare il teorema di Pitagora in contesti semplici.", keywords: ["pitagora"] },
    ],
  },
  {
    code: "CLA1.FUN",
    name: "Funzioni e proporzionalità",
    description: "Relazioni funzionali, piano cartesiano e proporzionalità diretta.",
    weightHint: 10,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.FUN.1", text: "Riconoscere una relazione funzionale e rappresentarla nel piano cartesiano.", keywords: ["funzioni"] },
      { code: "CLA1.FUN.2", text: "Interpretare il coefficiente angolare di una retta.", keywords: ["retta"] },
    ],
  },
  {
    code: "CLA1.SIS",
    name: "Sistemi lineari",
    description: "Sistemi di due equazioni in due incognite e loro interpretazione.",
    weightHint: 10,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.SIS.1", text: "Risolvere sistemi lineari con il metodo di sostituzione o di riduzione.", keywords: ["sistemi"] },
      { code: "CLA1.SIS.2", text: "Tradurre un problema in un sistema lineare.", keywords: ["modellizzazione"] },
    ],
  },
  {
    code: "CLA1.PROB",
    name: "Probabilità e statistica descrittiva",
    description: "Probabilità in casi finiti equiprobabili, media e frequenze.",
    weightHint: 15,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.PROB.1", text: "Calcolare la probabilità di un evento in casi finiti equiprobabili.", keywords: ["probabilità"] },
      { code: "CLA1.PROB.2", text: "Calcolare media e frequenze di una serie di dati.", keywords: ["media", "statistica"] },
    ],
  },
];

const SCIENTIFICO_TOPICS: TopicSeed[] = [
  {
    code: "SCI1.POL",
    name: "Polinomi e scomposizioni",
    description: "Calcolo letterale, prodotti notevoli e scomposizioni.",
    weightHint: 15,
    difficultyMin: 1,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.POL.1", text: "Eseguire operazioni tra polinomi e riconoscere i prodotti notevoli.", keywords: ["polinomi"] },
      { code: "SCI1.POL.2", text: "Scomporre un trinomio di secondo grado.", keywords: ["scomposizione"] },
    ],
  },
  {
    code: "SCI1.EQ",
    name: "Equazioni di primo grado",
    description: "Equazioni lineari, equazioni equivalenti e verifica.",
    weightHint: 15,
    difficultyMin: 1,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.EQ.1", text: "Riconoscere e risolvere un'equazione lineare.", keywords: ["equazioni"] },
      { code: "SCI1.EQ.2", text: "Verificare la soluzione e motivare i passaggi.", keywords: ["verifica"] },
    ],
  },
  {
    code: "SCI1.DIS",
    name: "Disequazioni di primo grado",
    description: "Disequazioni lineari e rappresentazione delle soluzioni.",
    weightHint: 10,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.DIS.1", text: "Risolvere disequazioni lineari e scrivere l'insieme soluzione.", keywords: ["disequazioni"] },
      { code: "SCI1.DIS.2", text: "Rappresentare intervalli sulla retta orientata.", keywords: ["intervalli"] },
    ],
  },
  {
    code: "SCI1.FUN",
    name: "Funzioni e piano cartesiano",
    description: "Funzioni, rette e lettura di grafici.",
    weightHint: 15,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.FUN.1", text: "Riconoscere una funzione e calcolarne i valori.", keywords: ["funzioni"] },
      { code: "SCI1.FUN.2", text: "Rappresentare una retta nel piano cartesiano.", keywords: ["retta", "grafico"] },
    ],
  },
  {
    code: "SCI1.GEO",
    name: "Geometria euclidea e teorema di Pitagora",
    description: "Triangoli, quadrilateri e applicazioni del teorema di Pitagora.",
    weightHint: 15,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.GEO.1", text: "Calcolare perimetri e aree delle figure piane.", keywords: ["area"] },
      { code: "SCI1.GEO.2", text: "Applicare il teorema di Pitagora e motivare i passaggi.", keywords: ["pitagora"] },
    ],
  },
  {
    code: "SCI1.SIS",
    name: "Sistemi lineari",
    description: "Sistemi di due equazioni in due incognite e modellizzazione.",
    weightHint: 10,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.SIS.1", text: "Risolvere sistemi lineari con metodi algebrici.", keywords: ["sistemi"] },
      { code: "SCI1.SIS.2", text: "Tradurre una situazione reale in un sistema lineare.", keywords: ["modellizzazione"] },
    ],
  },
  {
    code: "SCI1.PERC",
    name: "Numeri e percentuali",
    description: "Numeri razionali, percentuali e proporzioni.",
    weightHint: 10,
    difficultyMin: 1,
    difficultyMax: 2,
    objectives: [
      { code: "SCI1.PERC.1", text: "Calcolare percentuali, sconti e aumenti.", keywords: ["percentuali"] },
      { code: "SCI1.PERC.2", text: "Risolvere proporzioni e problemi di ripartizione.", keywords: ["proporzioni"] },
    ],
  },
  {
    code: "SCI1.PROB",
    name: "Probabilità e statistica",
    description: "Probabilità classica, media e rappresentazione dei dati.",
    weightHint: 10,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.PROB.1", text: "Calcolare probabilità in esperimenti equiprobabili.", keywords: ["probabilità"] },
      { code: "SCI1.PROB.2", text: "Interpretare media e frequenze di un insieme di dati.", keywords: ["statistica"] },
    ],
  },
];

const CURRICULA: CurriculumSeed[] = [
  {
    track: "classico",
    year: 1,
    subject: "matematica",
    title: "Matematica — 1ª Liceo Classico (programma dimostrativo)",
    notes: DEMO_NOTE,
    topics: CLASSICO_TOPICS,
  },
  {
    track: "scientifico",
    year: 1,
    subject: "matematica",
    title: "Matematica — 1ª Liceo Scientifico (programma dimostrativo)",
    notes: DEMO_NOTE,
    topics: SCIENTIFICO_TOPICS,
  },
];

async function upsertUser(input: {
  email: string;
  name: string;
  password: string;
  role: "admin" | "teacher";
  subjects: string[];
  tracks: string[];
}) {
  const passwordHash = await hashPassword(input.password);
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      passwordHash,
      role: input.role,
      subjects: toJson(input.subjects),
      tracks: toJson(input.tracks),
    },
    create: {
      email: input.email,
      name: input.name,
      passwordHash,
      role: input.role,
      subjects: toJson(input.subjects),
      tracks: toJson(input.tracks),
    },
  });
}

async function ensureGradeScales() {
  const existingDefault = await prisma.gradeScale.findFirst({ where: { isDefault: true } });
  if (existingDefault) {
    await prisma.gradeScale.update({
      where: { id: existingDefault.id },
      data: {
        name: "Scala dipartimento (100 punti)",
        totalPoints: 100,
        sufficiencyThreshold: 60,
        mappingJson: toJson({ mode: "lineare" }),
      },
    });
  } else {
    await prisma.gradeScale.updateMany({ data: { isDefault: false } });
    await prisma.gradeScale.create({
      data: {
        name: "Scala dipartimento (100 punti)",
        totalPoints: 100,
        sufficiencyThreshold: 60,
        mappingJson: toJson({ mode: "lineare" }),
        isDefault: true,
      },
    });
  }

  const bands = [
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
  const existingBands = await prisma.gradeScale.findFirst({ where: { name: "Scala a scaglioni (10°)" } });
  if (existingBands) {
    await prisma.gradeScale.update({
      where: { id: existingBands.id },
      data: { totalPoints: 100, sufficiencyThreshold: 60, mappingJson: toJson({ mode: "scaglioni", bands }) },
    });
  } else {
    await prisma.gradeScale.create({
      data: {
        name: "Scala a scaglioni (10°)",
        totalPoints: 100,
        sufficiencyThreshold: 60,
        mappingJson: toJson({ mode: "scaglioni", bands }),
        isDefault: false,
      },
    });
  }

  return prisma.gradeScale.findFirstOrThrow({ where: { isDefault: true } });
}

async function ensureCurriculum(seed: CurriculumSeed, authorId: string) {
  const existing = await prisma.curriculum.findUnique({
    where: {
      track_year_subject_version: {
        track: seed.track,
        year: seed.year,
        subject: seed.subject,
        version: 1,
      },
    },
  });
  if (existing) return existing;

  return prisma.curriculum.create({
    data: {
      track: seed.track,
      year: seed.year,
      subject: seed.subject,
      version: 1,
      status: "pubblicato",
      title: seed.title,
      notes: seed.notes,
      authorId,
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
  });
}

async function ensureDemoTest(input: {
  request: GenerationRequest;
  user: SessionUser;
  approved: boolean;
}): Promise<string> {
  const existing = await prisma.test.findFirst({
    where: { authorId: input.user.id, title: input.request.title },
    select: { id: true },
  });
  if (existing) return existing.id;

  const result = await generateTests({ request: input.request, user: input.user });
  if (input.approved) await approveTest(result.primaryId, input.user);
  return result.primaryId;
}

async function seedBankEntries(testIds: string[], ownerId: string) {
  await prisma.itemBankEntry.deleteMany({ where: { notes: { startsWith: "DEMO-SEED" } } });
  const items = await prisma.item.findMany({
    where: { testId: { in: testIds } },
    include: { topic: true, test: { select: { track: true, year: true, subject: true } } },
    orderBy: [{ testId: "asc" }, { order: "asc" }],
  });
  if (items.length === 0) return;

  const chosen = items.slice(0, 10);
  const ratings = [4.8, 4.5, 5, 4.2, 4.7, 4.6, 4.4, 4.9, 4.3, 4.5];
  for (let index = 0; index < chosen.length; index++) {
    const item = chosen[index];
    const snapshot = serializeBankSnapshot(item);
    await prisma.itemBankEntry.create({
      data: {
        itemSnapshotJson: toJson({ ...snapshot, prompt: item.prompt, type: item.type, points: item.points }),
        visibility: index < 2 ? "pubblico interno" : "dipartimento",
        ownerId,
        rating: ratings[index] ?? 4.5,
        ratingCount: 2 + (index % 4),
        tagsJson: toJson([
          item.test.subject,
          item.test.track,
          String(item.test.year),
          item.topic?.code ?? "generale",
          item.type,
        ]),
        notes: `DEMO-SEED — quesito di esempio ${index + 1}, condiviso con il dipartimento.`,
        sourceTestId: item.testId,
        usageCount: 0,
      },
    });
  }
}

async function main() {
  console.log("VerificheLab — seed dimostrativo");

  const admin = await upsertUser({
    email: ADMIN_EMAIL,
    name: "Direttore di Dipartimento",
    password: PASSWORD_ADMIN,
    role: "admin",
    subjects: ["matematica", "fisica"],
    tracks: ["classico", "scientifico"],
  });
  const teacher = await upsertUser({
    email: TEACHER_EMAIL,
    name: "Giulia Bianchi",
    password: PASSWORD_TEACHER,
    role: "teacher",
    subjects: ["matematica", "fisica"],
    tracks: ["classico", "scientifico"],
  });
  await upsertUser({
    email: SECOND_TEACHER_EMAIL,
    name: "Marco Rossi",
    password: PASSWORD_TEACHER,
    role: "teacher",
    subjects: ["matematica"],
    tracks: ["scientifico"],
  });

  await prisma.setting.upsert({
    where: { key: "institute.name" },
    update: { value: "Liceo Statale di Esempio" },
    create: { key: "institute.name", value: "Liceo Statale di Esempio" },
  });
  await prisma.setting.upsert({
    where: { key: "latex.engine" },
    update: { value: process.env.LATEX_ENGINE || "tectonic" },
    create: { key: "latex.engine", value: process.env.LATEX_ENGINE || "tectonic" },
  });
  await prisma.setting.upsert({
    where: { key: "ai.provider" },
    update: { value: process.env.AI_PROVIDER || "offline" },
    create: { key: "ai.provider", value: process.env.AI_PROVIDER || "offline" },
  });

  const gradeScale = await ensureGradeScales();
  console.log(`  scale di conversione pronte (predefinita: ${gradeScale.name})`);

  const classico = await ensureCurriculum(CURRICULA[0], admin.id);
  const scientifico = await ensureCurriculum(CURRICULA[1], admin.id);
  const classicoTopics = await prisma.topic.findMany({
    where: { curriculumId: classico.id },
    orderBy: { order: "asc" },
    select: { id: true, code: true },
  });
  const scientificoTopics = await prisma.topic.findMany({
    where: { curriculumId: scientifico.id },
    orderBy: { order: "asc" },
    select: { id: true, code: true },
  });

  const classicoRequest: GenerationRequest = {
    title: "Verifica dimostrativa — Equazioni e geometria (1ª Classico)",
    track: "classico",
    year: 1,
    subject: "matematica",
    curriculumId: classico.id,
    classLabel: "1ª A",
    examDate: EXAM_DATE,
    durationMin: 60,
    totalPoints: 100,
    difficultyTarget: 2,
    selectedTopics: classicoTopics.map((topic) => ({ topicId: topic.id, weight: 12.5 })),
    itemCount: 8,
    types: ["multiple_choice", "short_answer", "exercise", "proof", "problem"],
    longProblem: false,
    theoryQuestions: false,
    calculatorAllowed: false,
    formulaSheet: false,
    trigTables: false,
    noDerivatives: false,
    onlyDefinitions: false,
    simplifiedLanguage: false,
    answerSpace: true,
    versions: 1,
    vary: "numeri",
    seed: 20261112,
  };

  const scientificoRequest: GenerationRequest = {
    title: "Verifica dimostrativa — Funzioni e problemi (1ª Scientifico)",
    track: "scientifico",
    year: 1,
    subject: "matematica",
    curriculumId: scientifico.id,
    classLabel: "1ª B",
    examDate: EXAM_DATE,
    durationMin: 60,
    totalPoints: 100,
    difficultyTarget: 2.5,
    selectedTopics: scientificoTopics.map((topic) => ({ topicId: topic.id, weight: 12.5 })),
    itemCount: 8,
    types: ["multiple_choice", "short_answer", "exercise", "problem", "true_false"],
    longProblem: true,
    theoryQuestions: false,
    calculatorAllowed: false,
    formulaSheet: false,
    trigTables: false,
    noDerivatives: false,
    onlyDefinitions: false,
    simplifiedLanguage: false,
    answerSpace: true,
    versions: 1,
    vary: "numeri",
    seed: 20261113,
  };

  const teacherSession: SessionUser = {
    id: teacher.id,
    email: teacher.email,
    name: teacher.name,
    role: teacher.role,
    subjects: teacher.subjects,
    tracks: teacher.tracks,
  };

  const classicoTestId = await ensureDemoTest({
    request: classicoRequest,
    user: teacherSession,
    approved: true,
  });
  console.log(`  verifica Classico pronta: ${classicoTestId}`);

  const scientificoTestId = await ensureDemoTest({
    request: scientificoRequest,
    user: teacherSession,
    approved: true,
  });
  console.log(`  verifica Scientifico pronta: ${scientificoTestId}`);

  const generated = await prisma.test.findMany({
    where: { id: { in: [classicoTestId, scientificoTestId] } },
    include: { items: true },
  });
  for (const test of generated) {
    const points = test.items.reduce((total, item) => total + item.points, 0);
    const minutes = test.items.reduce((total, item) => total + item.estimatedMin, 0);
    if (Math.abs(points - 100) > 0.001 || Math.abs(minutes - 60) > 0.001) {
      throw new Error(`La verifica "${test.title}" non rispetta 100 pt / 60 min (${points} pt, ${minutes} min).`);
    }
  }

  await seedBankEntries([classicoTestId, scientificoTestId], teacher.id);
  console.log("  banca quesiti: 10 esempi condivisi");

  const counts = {
    utenti: await prisma.user.count(),
    programmi: await prisma.curriculum.count(),
    verifiche: await prisma.test.count(),
    quesitiBanca: await prisma.itemBankEntry.count(),
    scale: await prisma.gradeScale.count(),
  };
  console.log("Riepilogo:", counts);
  console.log("");
  console.log("Account dimostrativi:");
  console.log(`  Amministratore: ${ADMIN_EMAIL} / ${PASSWORD_ADMIN}`);
  console.log(`  Docente:        ${TEACHER_EMAIL} / ${PASSWORD_TEACHER}`);
  console.log(`  Docente:        ${SECOND_TEACHER_EMAIL} / ${PASSWORD_TEACHER}`);
}

main()
  .catch((error) => {
    console.error("Seed fallito:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
