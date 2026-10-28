// Validazione e normalizzazione di una verifica. Tutto ciò che arriva dal browser
// (o dall'AI) passa da qui prima di essere salvato o esportato.

import { roundQuarter, newId } from "./text.js";

export const ITEM_TYPES = ["multiple_choice", "true_false", "open", "exercise"];
export const TYPE_LABELS = {
  multiple_choice: "Risposta multipla",
  true_false: "Vero/Falso",
  open: "Risposta aperta",
  exercise: "Esercizio",
};
export const DEFAULT_LINES = { multiple_choice: 0, true_false: 0, open: 6, exercise: 8 };

export const MAX_ITEMS = 60;
export const MAX_BODY_CHARS = 300_000;

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function cleanString(value, max, label, errors, { required = false } = {}) {
  const text = value == null ? "" : String(value).replace(/\r\n/g, "\n").replace(CONTROL, "");
  if (required && text.trim() === "") errors.push(`${label}: campo obbligatorio.`);
  if (text.length > max) {
    errors.push(`${label}: massimo ${max} caratteri.`);
    return text.slice(0, max);
  }
  return text;
}

function cleanInt(value, min, max, label, errors, fallback) {
  if (value === "" || value == null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    errors.push(`${label}: deve essere un numero intero tra ${min} e ${max}.`);
    return fallback;
  }
  return n;
}

function cleanPoints(value, label, errors, { min = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > 1000) {
    errors.push(`${label}: deve essere un numero tra ${min} e 1000.`);
    return min;
  }
  return roundQuarter(n);
}

function normalizeItem(raw, index, errors) {
  const label = `Quesito ${index + 1}`;
  if (!raw || typeof raw !== "object") {
    errors.push(`${label}: non valido.`);
    return null;
  }
  const type = ITEM_TYPES.includes(raw.type) ? raw.type : null;
  if (!type) errors.push(`${label}: tipo non valido.`);
  const id = typeof raw.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(raw.id) ? raw.id : newId();

  let choices = [];
  let correct = null;
  if (type === "multiple_choice") {
    const list = Array.isArray(raw.choices) ? raw.choices : [];
    if (list.length < 2 || list.length > 8) errors.push(`${label}: servono da 2 a 8 opzioni.`);
    choices = list.slice(0, 8).map((choice, i) => cleanString(choice, 500, `${label}, opzione ${i + 1}`, errors));
    if (raw.correct != null && raw.correct !== "") {
      const n = Number(raw.correct);
      if (Number.isInteger(n) && n >= 0 && n < choices.length) correct = n;
      else errors.push(`${label}: risposta corretta non valida.`);
    }
  }
  let answer = null;
  if (type === "true_false" && typeof raw.answer === "boolean") answer = raw.answer;

  return {
    id,
    type: type ?? "exercise",
    topic: cleanString(raw.topic, 120, `${label}, argomento`, errors),
    text: cleanString(raw.text, 8000, `${label}, testo`, errors),
    points: cleanPoints(raw.points ?? 0, `${label}, punti`, errors),
    choices,
    correct,
    answer,
    solution: cleanString(raw.solution, 8000, `${label}, soluzione`, errors),
    commonErrors: cleanString(raw.commonErrors, 2000, `${label}, errori comuni`, errors),
    answerLines: cleanInt(raw.answerLines, 0, 30, `${label}, righe di risposta`, errors, DEFAULT_LINES[type] ?? 0),
  };
}

/** @returns {{ok: true, test: object} | {ok: false, errors: string[]}} */
export function normalizeTest(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Il contenuto della verifica non è valido."] };
  }
  const date = cleanString(input.date, 10, "Data", errors);
  if (date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push("Data: formato non valido (usa AAAA-MM-GG).");

  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (rawItems.length > MAX_ITEMS) errors.push(`Troppi quesiti: massimo ${MAX_ITEMS}.`);

  const test = {
    schema: 1,
    title: cleanString(input.title, 200, "Titolo", errors, { required: true }),
    institute: cleanString(input.institute, 200, "Istituto", errors),
    subject: cleanString(input.subject, 60, "Materia", errors),
    track: cleanString(input.track, 60, "Indirizzo", errors),
    year: cleanInt(input.year, 1, 5, "Anno", errors, null),
    className: cleanString(input.className, 40, "Classe", errors),
    date,
    durationMin: cleanInt(input.durationMin, 5, 600, "Durata", errors, 60),
    totalPoints: cleanPoints(input.totalPoints ?? 100, "Punteggio totale", errors, { min: 0.25 }),
    notes: cleanString(input.notes, 2000, "Note", errors),
    items: rawItems.slice(0, MAX_ITEMS).map((item, i) => normalizeItem(item, i, errors)).filter(Boolean),
  };

  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 10) };
  if (JSON.stringify(test).length > MAX_BODY_CHARS) return { ok: false, errors: ["La verifica è troppo grande."] };
  return { ok: true, test };
}

export function sumPoints(test) {
  return roundQuarter(test.items.reduce((acc, item) => acc + item.points, 0));
}

/** Ridistribuisce i punti dei quesiti in modo che la somma sia esattamente `total` (multipli di 0,25). */
export function rescalePoints(items, total) {
  const sum = items.reduce((acc, item) => acc + item.points, 0);
  if (items.length === 0 || sum <= 0) return items;
  const scale = total / sum;
  for (const item of items) item.points = Math.max(0.25, roundQuarter(item.points * scale));
  let current = items.reduce((acc, item) => acc + item.points, 0);
  for (let guard = 0; guard < 200 && Math.abs(current - total) > 0.0001; guard++) {
    const delta = roundQuarter(total - current);
    const step = delta === 0 ? Math.sign(total - current) * 0.25 : delta;
    const target = [...items].sort((a, b) => b.points - a.points).find((item) => item.points + step >= 0.25);
    if (!target) break;
    target.points = roundQuarter(target.points + step);
    current = items.reduce((acc, item) => acc + item.points, 0);
  }
  return items;
}
