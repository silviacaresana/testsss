import { prisma } from "@/lib/db";

export interface AiConfig {
  provider: string;
  model: string;
  criticModel: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxCostPerGeneration: number;
  monthlyBudget: number;
  rateLimitPerHour: number;
  retainPrompts: boolean;
  latexEngine: string;
}

async function settingMap(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function getAiConfig(): Promise<AiConfig> {
  const settings = await settingMap();
  return {
    provider: settings["ai.provider"] || process.env.AI_PROVIDER || "offline",
    model: settings["ai.model"] || process.env.AI_MODEL || "demo-deterministico",
    criticModel: settings["ai.criticModel"] ?? process.env.AI_MODEL_CRITIC ?? "",
    apiKey: process.env.AI_API_KEY || "",
    baseUrl: settings["ai.baseUrl"] || process.env.AI_BASE_URL || "",
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 90_000),
    maxCostPerGeneration: Number(process.env.AI_MAX_COST_PER_GENERATION || 0.3),
    monthlyBudget: Number(settings["ai.monthlyBudget"] || process.env.AI_MONTHLY_BUDGET_EUR || 30),
    rateLimitPerHour: Number(settings["ai.rateLimit"] || process.env.AI_RATE_LIMIT_PER_HOUR || 20),
    retainPrompts: (settings["ai.retainPrompts"] ?? "true") !== "false",
    latexEngine: settings["latex.engine"] || process.env.LATEX_ENGINE || "tectonic",
  };
}

export async function getInstituteSettings(): Promise<{ name: string; logoPath: string }> {
  const settings = await settingMap();
  return {
    name: settings["institute.name"] || process.env.INSTITUTE_NAME || "Istituto scolastico",
    logoPath: settings["institute.logoPath"] || process.env.INSTITUTE_LOGO_PATH || "",
  };
}

const PRICING_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-5-haiku": { input: 0.8, output: 4 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
};

export function estimateCostEur(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = PRICING_USD_PER_MILLION[model] ?? { input: 0.5, output: 1.5 };
  const usd = (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output;
  return Math.round(usd * 0.92 * 10_000) / 10_000;
}

export function estimateGenerationCost(model: string, promptChars: number, itemCount: number): number {
  const promptTokens = Math.ceil(promptChars / 4);
  const completionTokens = 700 + itemCount * 320;
  return estimateCostEur(model, promptTokens, completionTokens);
}

export const AI_PROVIDERS = [
  { value: "offline", label: "Offline (generatore deterministico)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "ollama", label: "Ollama / LM Studio (locale)" },
  { value: "custom", label: "Endpoint compatibile OpenAI" },
] as const;
