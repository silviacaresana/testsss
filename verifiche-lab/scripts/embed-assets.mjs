#!/usr/bin/env node
/**
 * Incorpora nel codice i file che l'app leggeva dal disco: template LaTeX, preambolo, macro e
 * prompt. Cloudflare Workers non ha un filesystem e vieta `new Function`/`eval`, quindi:
 *
 *  - i file di testo (preamble.tex, macros.tex, prompts/**) diventano stringhe;
 *  - i template Eta (*.tmpl) vengono compilati QUI, in Node, e inseriti come funzioni JavaScript.
 *
 * Output: lib/generated/assets.ts (ignorato da Git, rigenerato da predev/prebuild/pretest/…).
 * Richiede il pacchetto «eta» (già tra le dipendenze di sviluppo).
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Eta } from "eta";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const latexDir = join(root, "lib", "export", "latex");
const promptsDir = join(root, "prompts");
const outFile = join(root, "lib", "generated", "assets.ts");

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const posix = (path) => path.split(sep).join("/");

// Stessa configurazione che l'app usava a runtime (lib/export/latex/index.ts).
const eta = new Eta({ autoEscape: false, autoTrim: false });
if (typeof eta.compileToString !== "function") {
  throw new Error(
    "La versione di «eta» installata non espone compileToString: controlla la versione (serve la 3.x).",
  );
}

const staticFiles = {};
const templateSources = {};
for (const file of walk(latexDir)) {
  const name = posix(relative(latexDir, file));
  if (name.endsWith(".tmpl")) templateSources[name] = readFileSync(file, "utf8");
  else if (name.endsWith(".tex")) staticFiles[name] = readFileSync(file, "utf8");
}

const prompts = {};
for (const file of walk(promptsDir)) {
  prompts[posix(relative(promptsDir, file))] = readFileSync(file, "utf8");
}

const compiled = Object.entries(templateSources)
  .map(([name, source]) => {
    const body = eta.compileToString(source);
    return `  ${JSON.stringify(name)}: function (it, options) {\n${body}\n  },`;
  })
  .join("\n");

const output = `// @ts-nocheck
/* AUTO-GENERATO da scripts/embed-assets.mjs: non modificare e non committare. */

export const staticFiles: Record<string, string> = ${JSON.stringify(staticFiles, null, 2)};

export const prompts: Record<string, string> = ${JSON.stringify(prompts, null, 2)};

export const templates: Record<string, (it: unknown, options?: unknown) => string> = {
${compiled}
};
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, output, "utf8");
console.log(
  `embed-assets: ${Object.keys(templateSources).length} template, ${Object.keys(staticFiles).length} file statici, ` +
    `${Object.keys(prompts).length} prompt → ${posix(relative(root, outFile))}`,
);
