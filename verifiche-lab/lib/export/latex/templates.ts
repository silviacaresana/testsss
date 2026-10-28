import { staticFiles, templates } from "@/lib/generated/assets";

/**
 * Rendering dei template LaTeX senza Eta a runtime.
 *
 * I template sono compilati in anticipo da scripts/embed-assets.mjs (Cloudflare Workers non
 * permette di compilare codice da stringhe). Le funzioni generate si aspettano di essere
 * chiamate con `this` = un oggetto con `config.escapeFunction` e `config.filterFunction`;
 * la configurazione usata (autoEscape: false) non le invoca mai, ma devono esistere.
 */

const context = {
  config: {
    escapeFunction: (value: unknown) => String(value),
    filterFunction: (value: unknown) => value,
  },
  render(): never {
    throw new Error("include/layout nei template LaTeX non sono supportati.");
  },
  renderAsync(): never {
    throw new Error("include/layout nei template LaTeX non sono supportati.");
  },
};

export function renderTemplate(name: string, data: unknown): string {
  const template = templates[name];
  if (!template) throw new Error(`Template LaTeX non trovato: ${name}`);
  return template.call(context, data, {});
}

export function staticFile(name: string): string {
  const content = staticFiles[name];
  if (content === undefined) throw new Error(`File LaTeX statico non trovato: ${name}`);
  return content;
}
