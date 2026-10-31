// Bozza automatica offline: costruisce una verifica a partire da materia, indirizzo, anno e
// argomenti scritti dal docente, usando le "famiglie" di esercizi di families.js.
// Nessuna chiamata esterna: a parità di parametri e di seme il risultato è identico.
// È solo una bozza: il docente la rivede e la corregge nell'editor.

import { MATH_FAMILIES, PHYSICS_FAMILIES, selectFamily, mulberry32, shuffle } from "./families.js";
import { normalizeTest, rescalePoints } from "./validate.js";

export const SUBJECTS = ["matematica", "fisica"];
export const TRACKS = ["classico", "scientifico"];
export const MAX_TOPICS = 12;
export const MAX_DRAFT_ITEMS = 30;

const SUBJECT_LABEL = { matematica: "Matematica", fisica: "Fisica" };
const TRACK_LABEL = { classico: "Liceo Classico", scientifico: "Liceo Scientifico" };

// Alternanza dei tipi di quesito e peso relativo dei punti.
const MIX = ["multiple_choice", "exercise", "true_false", "exercise", "multiple_choice", "open"];
const WEIGHT = { multiple_choice: 2, true_false: 1, exercise: 4, open: 4 };

/** Nomi degli argomenti per cui esistono esercizi preconfezionati, utili come suggerimenti. */
export function topicSuggestions() {
  return {
    matematica: MATH_FAMILIES.map((family) => family.name),
    fisica: PHYSICS_FAMILIES.map((family) => family.name),
  };
}

function oneLine(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function splitTopics(value) {
  const list = Array.isArray(value) ? value : String(value ?? "").split(/[\n;,]+/);
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    const text = oneLine(entry, 120);
    const key = text.toLowerCase();
    if (text.length >= 2 && !seen.has(key)) {
      seen.add(key);
      out.push(text);
    }
  }
  return out;
}

function intIn(value, [min, max], fallback, label, errors) {
  if (value === "" || value == null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    errors.push(`${label}: deve essere un numero intero tra ${min} e ${max}.`);
    return fallback;
  }
  return n;
}

/** @returns {{ok: true, params: object} | {ok: false, errors: string[]}} */
export function validateDraftParams(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Parametri non validi."] };
  }
  const errors = [];
  if (!SUBJECTS.includes(input.subject)) errors.push("Materia non valida.");
  if (!TRACKS.includes(input.track)) errors.push("Indirizzo non valido.");
  const year = intIn(input.year, [1, 5], null, "Anno", errors);
  if (year == null && !errors.some((e) => e.startsWith("Anno"))) errors.push("Anno: campo obbligatorio.");

  const topics = splitTopics(input.topics);
  if (topics.length === 0) errors.push("Inserisci almeno un argomento.");
  if (topics.length > MAX_TOPICS) errors.push(`Troppi argomenti: massimo ${MAX_TOPICS}.`);

  const items = intIn(input.items, [1, MAX_DRAFT_ITEMS], 8, "Numero di quesiti", errors);
  const durationMin = intIn(input.durationMin, [5, 600], 60, "Durata", errors);
  const totalPoints = intIn(input.totalPoints, [1, 1000], 100, "Punteggio totale", errors);
  const seed = intIn(input.seed, [0, 2 ** 31 - 1], null, "Seme", errors);

  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 10) };
  return {
    ok: true,
    params: {
      subject: input.subject,
      track: input.track,
      year,
      topics,
      items,
      durationMin,
      totalPoints,
      seed,
      title: oneLine(input.title, 200),
      institute: oneLine(input.institute, 200),
      className: oneLine(input.className, 40),
      date: oneLine(input.date, 10),
    },
  };
}

function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
}

function build(kind, built, rng, topic, familyName) {
  const steps = (built.steps ?? []).map((step, i) => `${i + 1}. ${step}`).join("\n");
  const solution = [steps, built.result ? `Risultato: ${built.result}` : ""].filter(Boolean).join("\n");
  const common = { topic, solution, commonErrors: (built.errors ?? []).join("; ") };
  const prompt = built.exercisePrompt;

  if (kind === "multiple_choice") {
    // Il risultato può avere la forma "$f'(3) = 93$" mentre le alternative sono "$99$":
    // si tiene solo il membro di destra, altrimenti la risposta giusta si riconoscerebbe dal formato.
    let right = built.result;
    const distractors = built.distractors ?? [];
    const m = typeof right === "string" ? right.match(/^\$[^$=]*=\s*([^$=]+)\$$/) : null;
    if (m && !distractors.some((d) => String(d).includes("="))) right = `$${m[1].trim()}$`;
    const unique = [...new Set([right, ...distractors].filter(Boolean))].slice(0, 4);
    if (unique.length >= 2 && right) {
      const choices = shuffle(rng, unique);
      return { type: "multiple_choice", text: prompt, choices, correct: choices.indexOf(right), ...common };
    }
    kind = "exercise";
  }
  if (kind === "true_false") {
    const wrong = (built.distractors ?? []).find((d) => d && d !== built.result);
    if (familyName !== "concettuale" && built.result && wrong) {
      const isTrue = rng() < 0.5;
      return {
        type: "true_false",
        text: `${prompt}\nAffermazione: il risultato è ${isTrue ? built.result : wrong}.`,
        answer: isTrue,
        ...common,
      };
    }
    kind = familyName === "concettuale" ? "open" : "exercise";
  }
  if (kind === "open") {
    return { type: "open", text: built.proofPrompt ?? prompt, answerLines: 8, ...common };
  }
  return { type: "exercise", text: prompt, answerLines: 8, ...common };
}

/**
 * @param {object} params risultato di validateDraftParams
 * @returns {{test: object, warnings: string[]}}
 */
export function generateDraft(params) {
  const seed = params.seed ?? randomSeed();
  const request = { subject: params.subject, noDerivatives: false };
  const warnings = [];
  const unknown = new Set();
  const usedTexts = new Set();
  const items = [];

  for (let index = 0; index < params.items; index++) {
    const topic = params.topics[index % params.topics.length];
    const family = selectFamily({ name: topic, description: "", objectives: [] }, request);
    if (family.name === "concettuale") unknown.add(topic);

    let item = null;
    for (let attempt = 0; attempt < 6 && !item; attempt++) {
      const rng = mulberry32((seed + index * 9973 + attempt * 104729) >>> 0);
      const built = family.build(rng, index + attempt);
      const candidate = build(MIX[index % MIX.length], built, rng, topic, family.name);
      if (!usedTexts.has(candidate.text) || attempt === 5) {
        usedTexts.add(candidate.text);
        item = candidate;
      }
    }
    items.push({ ...item, points: WEIGHT[item.type] ?? 2 });
  }

  rescalePoints(items, params.totalPoints);

  for (const topic of unknown) {
    warnings.push(`Per «${topic}» non ho esercizi preconfezionati: ho inserito una domanda generica da riscrivere.`);
  }

  const title =
    params.title ||
    `Verifica di ${SUBJECT_LABEL[params.subject]} - ${TRACK_LABEL[params.track]}, classe ${params.year}ª`;
  const result = normalizeTest({
    title,
    institute: params.institute,
    subject: SUBJECT_LABEL[params.subject].toLowerCase(),
    track: params.track,
    year: params.year,
    className: params.className,
    date: params.date,
    durationMin: params.durationMin,
    totalPoints: params.totalPoints,
    notes: "",
    items,
  });
  if (!result.ok) throw new Error(`Bozza non valida: ${result.errors.join(" ")}`);
  return { test: result.test, warnings };
}
