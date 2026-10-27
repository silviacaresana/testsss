export const TRACKS = [
  { value: "classico", label: "Liceo Classico" },
  { value: "scientifico", label: "Liceo Scientifico" },
] as const;

export const SUBJECTS = [
  { value: "matematica", label: "Matematica" },
  { value: "fisica", label: "Fisica" },
] as const;

export const YEARS = [1, 2, 3, 4, 5] as const;

export const ITEM_TYPES = [
  { value: "multiple_choice", label: "Scelta multipla" },
  { value: "true_false", label: "Vero/Falso" },
  { value: "short_answer", label: "Risposta breve" },
  { value: "open_answer", label: "Risposta aperta" },
  { value: "exercise", label: "Esercizio" },
  { value: "problem", label: "Problema" },
  { value: "graph", label: "Grafico" },
  { value: "lab_data", label: "Analisi dati" },
  { value: "proof", label: "Dimostrazione" },
] as const;

export type ItemType = (typeof ITEM_TYPES)[number]["value"];

export const ANSWER_SPACES = [
  { value: "none", label: "Nessuno" },
  { value: "lined", label: "Righe" },
  { value: "grid", label: "Griglia" },
  { value: "box", label: "Riquadro" },
] as const;

export const VISIBILITIES = [
  { value: "privato", label: "Privato" },
  { value: "dipartimento", label: "Dipartimento" },
  { value: "pubblico interno", label: "Pubblico interno" },
] as const;

export const CURRICULUM_STATUS = ["bozza", "pubblicato", "archiviato"] as const;
export const TEST_STATUS = ["bozza", "approvata"] as const;
export const ROLES = ["admin", "teacher"] as const;

export const DEFAULT_INDICATORS = [
  "Conoscenze",
  "Abilità procedurali",
  "Risoluzione di problemi",
  "Linguaggio e argomentazione",
] as const;

export const DEFAULT_LEVELS = [
  { level: 1, label: "Iniziale", descriptor: "Conoscenze frammentarie e applicazione guidata con errori frequenti." },
  { level: 2, label: "Base", descriptor: "Conoscenze essenziali e applicazione corretta in situazioni note." },
  { level: 3, label: "Intermedio", descriptor: "Conoscenze solide, procedure corrette e motivazione adeguata." },
  { level: 4, label: "Avanzato", descriptor: "Padronanza completa, autonomia, argomentazione rigorosa." },
] as const;

export const DIFFICULTY_TABLE = [
  { level: 1, label: "Riconoscimento", min: 2, max: 4 },
  { level: 2, label: "Applicazione standard", min: 4, max: 6 },
  { level: 3, label: "Due/tre passaggi", min: 6, max: 10 },
  { level: 4, label: "Problema articolato", min: 10, max: 15 },
  { level: 5, label: "Problema aperto", min: 15, max: 25 },
] as const;

export function labelFor(list: readonly { value: string; label: string }[], value: string): string {
  return list.find((entry) => entry.value === value)?.label ?? value;
}

export function trackLabel(track: string): string {
  return track === "classico" ? "Liceo Classico" : track === "scientifico" ? "Liceo Scientifico" : track;
}

export function subjectLabel(subject: string): string {
  return subject === "fisica" ? "Fisica" : "Matematica";
}

export function itemTypeLabel(type: string): string {
  return labelFor(ITEM_TYPES, type);
}

export const ITEM_TYPE_VALUES = ITEM_TYPES.map((t) => t.value);
