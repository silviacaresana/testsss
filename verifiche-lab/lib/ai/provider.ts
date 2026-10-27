import type { AiConfig } from "./config";
import { estimateCostEur } from "./config";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCallResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  costEur: number;
  provider: string;
  model: string;
}

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiError(`Il provider AI non ha risposto entro ${Math.round(timeoutMs / 1000)} secondi.`);
    }
    throw new AiError(`Impossibile contattare il provider AI: ${error instanceof Error ? error.message : "errore di rete"}.`);
  } finally {
    clearTimeout(timer);
  }
}

function openAiBase(config: AiConfig): string {
  if (config.baseUrl) return config.baseUrl.replace(/\/$/, "");
  if (config.provider === "ollama") return "http://localhost:11434/v1";
  return "https://api.openai.com/v1";
}

export async function callAi(
  messages: AiMessage[],
  config: AiConfig,
  options: { model?: string; temperature?: number; maxTokens?: number } = {},
): Promise<AiCallResult> {
  const model = options.model || config.model;
  const temperature = options.temperature ?? 0.35;
  const maxTokens = options.maxTokens ?? 8000;

  if (config.provider === "offline") {
    throw new AiError("Il provider offline non effettua chiamate remote.");
  }
  if (!config.apiKey && !["ollama"].includes(config.provider)) {
    throw new AiError(
      "Manca AI_API_KEY. Configura la chiave nel file .env oppure scegli il provider offline nelle impostazioni.",
    );
  }

  if (config.provider === "anthropic") {
    const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    const conversation = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));
    const response = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, messages: conversation }),
      },
      config.timeoutMs,
    );
    if (!response.ok) throw new AiError(await providerError(response));
    const data = (await response.json()) as {
      content: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = data.content?.map((block) => block.text ?? "").join("") ?? "";
    const promptTokens = data.usage?.input_tokens ?? 0;
    const completionTokens = data.usage?.output_tokens ?? 0;
    return {
      text,
      promptTokens,
      completionTokens,
      costEur: estimateCostEur(model, promptTokens, completionTokens),
      provider: config.provider,
      model,
    };
  }

  if (config.provider === "google") {
    const key = config.apiKey;
    const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    const contents = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents,
          generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: "application/json" },
        }),
      },
      config.timeoutMs,
    );
    if (!response.ok) throw new AiError(await providerError(response));
    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    const promptTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    return {
      text,
      promptTokens,
      completionTokens,
      costEur: estimateCostEur(model, promptTokens, completionTokens),
      provider: config.provider,
      model,
    };
  }

  // OpenAI-compatible: OpenAI, Ollama, LM Studio, endpoint custom.
  const response = await fetchWithTimeout(
    `${openAiBase(config)}/chat/completions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages,
      }),
    },
    config.timeoutMs,
  );
  if (!response.ok) throw new AiError(await providerError(response));
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;
  return {
    text,
    promptTokens,
    completionTokens,
    costEur: estimateCostEur(model, promptTokens, completionTokens),
    provider: config.provider,
    model,
  };
}

async function providerError(response: Response): Promise<string> {
  let detail = "";
  try {
    const body = await response.text();
    detail = body.slice(0, 400);
  } catch {
    detail = "";
  }
  if (response.status === 401 || response.status === 403) {
    return `Il provider AI ha rifiutato le credenziali (HTTP ${response.status}). Controlla AI_API_KEY.`;
  }
  if (response.status === 429) {
    return "Il provider AI ha raggiunto il limite di richieste (HTTP 429). Riprova tra qualche minuto.";
  }
  return `Errore del provider AI (HTTP ${response.status}). ${detail}`;
}
