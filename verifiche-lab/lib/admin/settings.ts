import { prisma } from "@/lib/db";
import { getAiConfig, AI_PROVIDERS } from "@/lib/ai/config";

export interface SettingField {
  key: string;
  label: string;
  group: "istituto" | "ai" | "latex";
  type: "text" | "number" | "select" | "boolean";
  help?: string;
  options?: { value: string; label: string }[];
  secret?: boolean;
}

export const SETTING_FIELDS: SettingField[] = [
  {
    key: "institute.name",
    label: "Nome dell'istituto",
    group: "istituto",
    type: "text",
    help: "Compare nell'intestazione di verifiche, soluzioni e griglie.",
  },
  {
    key: "institute.logoPath",
    label: "Percorso del logo",
    group: "istituto",
    type: "text",
    help: "Percorso assoluto o relativo a un PNG/JPG sul server (facoltativo).",
  },
  {
    key: "ai.provider",
    label: "Provider AI",
    group: "ai",
    type: "select",
    options: AI_PROVIDERS.map((provider) => ({ value: provider.value, label: provider.label })),
    help: "«Offline» usa il generatore deterministico: nessuna chiave richiesta.",
  },
  {
    key: "ai.model",
    label: "Modello",
    group: "ai",
    type: "text",
    help: "Es. gpt-4.1-mini, claude-sonnet-4, llama3.1. Non usato in modalità offline.",
  },
  {
    key: "ai.criticModel",
    label: "Modello revisore (facoltativo)",
    group: "ai",
    type: "text",
    help: "Se indicato, un secondo passaggio controlla la correttezza degli item.",
  },
  {
    key: "ai.baseUrl",
    label: "URL base personalizzato",
    group: "ai",
    type: "text",
    help: "Per provider compatibili OpenAI o istanze locali (Ollama, LM Studio).",
  },
  {
    key: "ai.monthlyBudget",
    label: "Budget mensile (EUR)",
    group: "ai",
    type: "number",
  },
  {
    key: "ai.rateLimit",
    label: "Generazioni massime all'ora (per docente)",
    group: "ai",
    type: "number",
  },
  {
    key: "ai.retainPrompts",
    label: "Conserva l'estratto dei prompt nei log",
    group: "ai",
    type: "boolean",
  },
  {
    key: "latex.engine",
    label: "Motore LaTeX",
    group: "latex",
    type: "select",
    options: [
      { value: "tectonic", label: "Tectonic" },
      { value: "pdflatex", label: "pdflatex" },
      { value: "latexmk", label: "latexmk" },
    ],
  },
];

const FIELD_BY_KEY = new Map(SETTING_FIELDS.map((field) => [field.key, field]));

export function maskApiKey(): string {
  const key = process.env.AI_API_KEY ?? "";
  if (!key) return "non configurata";
  if (key.length <= 8) return "********";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export async function getSettingsForAdmin() {
  const config = await getAiConfig();
  const rows = await prisma.setting.findMany();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const current: Record<string, string> = {
    "institute.name": stored["institute.name"] ?? process.env.INSTITUTE_NAME ?? "",
    "institute.logoPath": stored["institute.logoPath"] ?? process.env.INSTITUTE_LOGO_PATH ?? "",
    "ai.provider": config.provider,
    "ai.model": config.model,
    "ai.criticModel": config.criticModel,
    "ai.baseUrl": config.baseUrl,
    "ai.monthlyBudget": String(config.monthlyBudget),
    "ai.rateLimit": String(config.rateLimitPerHour),
    "ai.retainPrompts": String(config.retainPrompts),
    "latex.engine": config.latexEngine,
  };
  return {
    fields: SETTING_FIELDS,
    values: current,
    apiKeyMasked: maskApiKey(),
    envProvider: process.env.AI_PROVIDER ?? "offline",
  };
}

export function validateSettings(input: Record<string, unknown>): { key: string; value: string }[] {
  const updates: { key: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(input)) {
    const field = FIELD_BY_KEY.get(key);
    if (!field) continue;
    if (field.type === "boolean") {
      updates.push({ key, value: raw === true || raw === "true" ? "true" : "false" });
      continue;
    }
    if (field.type === "number") {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) throw new Error(`Valore non valido per «${field.label}».`);
      updates.push({ key, value: String(value) });
      continue;
    }
    if (field.type === "select") {
      const value = String(raw ?? "");
      if (!field.options?.some((option) => option.value === value)) {
        throw new Error(`Scelta non valida per «${field.label}».`);
      }
      updates.push({ key, value });
      continue;
    }
    const value = String(raw ?? "").trim();
    if (value.length > 500) throw new Error(`Il campo «${field.label}» è troppo lungo.`);
    updates.push({ key, value });
  }
  if (updates.length === 0) throw new Error("Nessuna impostazione riconosciuta da salvare.");
  return updates;
}

export async function saveSettings(input: Record<string, unknown>) {
  const updates = validateSettings(input);
  await prisma.$transaction(
    updates.map((update) =>
      prisma.setting.upsert({
        where: { key: update.key },
        update: { value: update.value },
        create: { key: update.key, value: update.value },
      }),
    ),
  );
  return updates.length;
}
