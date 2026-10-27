import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface CompileResult {
  ok: boolean;
  pdf: Buffer | null;
  log: string;
  engine: string;
  durationMs: number;
  timedOut: boolean;
  unavailable: boolean;
}

export interface CompileOptions {
  sourceDateEpoch?: number;
  extraFiles?: { name: string; path: string }[];
  keepDir?: boolean;
  timeoutMs?: number;
}

function storageRoot(): string {
  return process.env.STORAGE_DIR || path.join(process.cwd(), "storage");
}

function engineName(): string {
  return (process.env.LATEX_ENGINE || "tectonic").toLowerCase();
}

function engineBinary(): string {
  const configured = process.env.LATEX_BIN?.trim();
  if (configured) return configured;
  if (engineName() === "latexmk") return "latexmk";
  if (engineName() === "pdflatex") return "pdflatex";
  return "tectonic";
}

function tail(text: string, lines = 30): string {
  const clean = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  return clean.slice(-lines).join("\n");
}

function run(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; output: string; timedOut: boolean; missing: boolean }> {
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    let missing = false;
    let child;
    try {
      child = spawn(command, args, { cwd, env, windowsHide: true, shell: false });
    } catch {
      resolve({ code: -1, output: `Impossibile avviare ${command}`, timedOut: false, missing: true });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") missing = true;
      output += `\n${error.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output, timedOut, missing });
    });
  });
}

let availability: { engine: string; ok: boolean; checkedAt: number; message: string } | null = null;

export async function latexAvailability(force = false): Promise<{ engine: string; ok: boolean; message: string }> {
  const engine = engineName();
  if (!force && availability && availability.engine === engine && Date.now() - availability.checkedAt < 60_000) {
    return availability;
  }
  const binary = engineBinary();
  if (binary.includes(path.sep) && !fs.existsSync(binary)) {
    availability = { engine, ok: false, checkedAt: Date.now(), message: `Binario LaTeX non trovato: ${binary}` };
    return availability;
  }
  const result = await run(binary, ["--version"], process.cwd(), 8_000, process.env);
  const ok = !result.missing && result.code === 0;
  availability = {
    engine,
    ok,
    checkedAt: Date.now(),
    message: ok ? `${engine} disponibile` : `Motore LaTeX non disponibile (${binary}). Il sorgente .tex resta scaricabile.`,
  };
  return availability;
}

export async function compileLatex(source: string, options: CompileOptions = {}): Promise<CompileResult> {
  const engine = engineName();
  const binary = engineBinary();
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? Number(process.env.LATEX_TIMEOUT_MS || 60_000);
  const root = path.join(storageRoot(), "tmp");
  await fsp.mkdir(root, { recursive: true });
  const jobDir = await fsp.mkdtemp(path.join(root, `${engine}-`));
  const sourceDateEpoch =
    options.sourceDateEpoch ?? Math.floor(new Date("2024-01-01T00:00:00Z").getTime() / 1000);

  try {
    await fsp.writeFile(path.join(jobDir, "main.tex"), source, "utf8");
    for (const file of options.extraFiles ?? []) {
      if (fs.existsSync(file.path)) {
        await fsp.copyFile(file.path, path.join(jobDir, file.name));
      }
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TEXMFOUTPUT: jobDir,
      SOURCE_DATE_EPOCH: String(sourceDateEpoch),
      openin_any: "p",
      openout_any: "p",
      max_print_line: "1000",
    };

    let output = "";
    let timedOut = false;
    let missing = false;

    if (engine === "tectonic") {
      const first = await run(
        binary,
        ["-X", "compile", "main.tex", "--outdir", ".", "--keep-logs"],
        jobDir,
        timeoutMs,
        env,
      );
      output += first.output;
      timedOut ||= first.timedOut;
      missing ||= first.missing;
    } else if (engine === "latexmk") {
      const first = await run(
        binary,
        ["-pdf", "-interaction=nonstopmode", "-no-shell-escape", "-file-line-error", "main.tex"],
        jobDir,
        timeoutMs,
        env,
      );
      output += first.output;
      timedOut ||= first.timedOut;
      missing ||= first.missing;
    } else {
      for (let pass = 0; pass < 2; pass++) {
        const result = await run(
          binary,
          ["-interaction=nonstopmode", "-no-shell-escape", "-file-line-error", "-output-directory=.", "main.tex"],
          jobDir,
          timeoutMs,
          env,
        );
        output += result.output;
        timedOut ||= result.timedOut;
        missing ||= result.missing;
        if (result.missing) break;
      }
    }

    const logFile = path.join(jobDir, "main.log");
    if (fs.existsSync(logFile)) {
      const logText = await fsp.readFile(logFile, "utf8");
      output += `\n${logText}`;
    }

    const pdfPath = path.join(jobDir, "main.pdf");
    const pdfExists = fs.existsSync(pdfPath);
    const pdf = pdfExists ? await fsp.readFile(pdfPath) : null;
    const ok = Boolean(pdf && pdf.length > 100) && !missing;
    const cleaned = tail(output.replaceAll(jobDir, "."), 30);

    return {
      ok,
      pdf,
      log: missing
        ? `Motore LaTeX non trovato (${binary}). Installa tectonic oppure imposta LATEX_BIN nel file .env. Il .tex è comunque scaricabile.`
        : cleaned || (ok ? "Compilazione completata." : "Compilazione fallita senza log."),
      engine,
      durationMs: Date.now() - started,
      timedOut,
      unavailable: missing,
    };
  } finally {
    if (!options.keepDir) {
      await fsp.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export function engineVersionLabel(): string {
  return engineName();
}

export function tempRoot(): string {
  return path.join(os.tmpdir(), "verifichelab");
}
