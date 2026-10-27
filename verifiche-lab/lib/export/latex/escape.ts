import { DIFFICULTY_TABLE, ITEM_TYPE_VALUES, itemTypeLabel } from "@/lib/constants";

const MATH_SEGMENT = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\))/g;
const TOKEN_START = "\uE000";
const TOKEN_END = "\uE001";
const TOKEN_RE = /\uE000(\d+)\uE001/g;

function makeToken(tokens: string[], latex: string): string {
  tokens.push(latex);
  return `${TOKEN_START}${tokens.length - 1}${TOKEN_END}`;
}

function sanitizeCommon(input: string): string {
  return input
    .replace(/[\uE000\uE001]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "---")
    .replace(/\r\n/g, "\n");
}

function sanitizeText(input: string, tokens: string[]): string {
  return sanitizeCommon(input)
    .replace(/\u00b0/g, () => makeToken(tokens, "\\textdegree{}"))
    .replace(/\u00b2/g, () => makeToken(tokens, "\\textsuperscript{2}"))
    .replace(/\u00b3/g, () => makeToken(tokens, "\\textsuperscript{3}"))
    .replace(/\u00b5/g, () => makeToken(tokens, "\\textmu{}"))
    .replace(/[\u00d7\u22c5\u00b7]/g, () => makeToken(tokens, "$\\cdot$"))
    .replace(/\u00f7/g, () => makeToken(tokens, "$\\div$"))
    .replace(/\u2212/g, () => makeToken(tokens, "$-$"))
    .replace(/\u2264/g, () => makeToken(tokens, "$\\le$"))
    .replace(/\u2265/g, () => makeToken(tokens, "$\\ge$"))
    .replace(/\u2192/g, () => makeToken(tokens, "$\\to$"))
    .replace(/\u03bc/g, () => makeToken(tokens, "$\\mu$"))
    .replace(/\u03c0/g, () => makeToken(tokens, "$\\pi$"))
    .replace(/\u221a/g, () => makeToken(tokens, "$\\sqrt{\\ }$"));
}

function sanitizeMath(input: string): string {
  return sanitizeCommon(input)
    .replace(/\u00b0/g, "^\\circ")
    .replace(/\u00b2/g, "^2")
    .replace(/\u00b3/g, "^3")
    .replace(/\u00b5/g, "\\mu ")
    .replace(/[\u00d7\u22c5\u00b7]/g, "\\cdot ")
    .replace(/\u00f7/g, "\\div ")
    .replace(/\u2212/g, "-")
    .replace(/\u2264/g, "\\le ")
    .replace(/\u2265/g, "\\ge ")
    .replace(/\u2192/g, "\\to ")
    .replace(/\u03bc/g, "\\mu ")
    .replace(/\u03c0/g, "\\pi ");
}

/** Escape dei caratteri speciali LaTeX fuori dalla matematica. */
export function escapeLatexText(input: string): string {
  let result = "";
  let lastIndex = 0;
  const source = sanitizeCommon(input ?? "");
  const tokens: string[] = [];

  for (const match of source.matchAll(MATH_SEGMENT)) {
    const index = match.index ?? 0;
    result += escapePlain(source.slice(lastIndex, index), tokens);
    result += sanitizeMath(match[0]);
    lastIndex = index + match[0].length;
  }
  result += escapePlain(source.slice(lastIndex), tokens);
  return result.replace(TOKEN_RE, (_, index: string) => tokens[Number(index)] ?? "");
}

function escapePlain(segment: string, tokens: string[]): string {
  const safe = sanitizeText(segment, tokens);
  let out = "";
  for (const char of safe) {
    switch (char) {
      case "\\":
        out += "\\textbackslash{}";
        break;
      case "&":
        out += "\\&";
        break;
      case "%":
        out += "\\%";
        break;
      case "$":
        out += "\\$";
        break;
      case "#":
        out += "\\#";
        break;
      case "_":
        out += "\\_";
        break;
      case "{":
        out += "\\{";
        break;
      case "}":
        out += "\\}";
        break;
      case "~":
        out += "\\textasciitilde{}";
        break;
      case "^":
        out += "\\textasciicircum{}";
        break;
      case "\u00aa":
        out += "\\textsuperscript{a}";
        break;
      case "\u00ba":
        out += "\\textsuperscript{o}";
        break;
      default:
        out += char;
    }
  }
  return out;
}

/** Converte i punti in formato italiano per la stampa (es. 12,5). */
export function formatPoints(points: number): string {
  const rounded = Math.round(points * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0$/, "").replace(".", ",");
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
}

export function answerLinesFor(type: string, difficulty: number, enabled: boolean): number {
  if (!enabled) return 0;
  if (type === "multiple_choice" || type === "true_false") return 0;
  const table = DIFFICULTY_TABLE.find((row) => row.level === clampDifficulty(difficulty));
  const base = table ? table.max : 6;
  const lines: Record<string, number> = {
    short_answer: Math.max(2, Math.round(base / 2)),
    open_answer: Math.max(4, base),
    exercise: Math.max(5, base),
    problem: Math.max(8, base + 2),
    proof: Math.max(7, base + 1),
    graph: 0,
    lab_data: Math.max(5, base),
  };
  return Math.min(18, lines[type] ?? 4);
}

function clampDifficulty(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value || 3)));
}

/** Figure dichiarative → codice TikZ. Nessuna immagine raster. */
export function figureTikz(spec: unknown): string | null {
  if (!spec || typeof spec !== "object") return null;
  const data = spec as Record<string, unknown>;
  const kind = String(data.kind ?? "");

  if (kind === "cartesian") {
    return "\\grigliacartesiana";
  }
  if (kind === "grid") {
    return "\\griglia";
  }
  if (kind === "triangle") {
    const labels = (data.labels ?? {}) as Record<string, string>;
    const a = escapeLatexText(labels.A ?? "A");
    const b = escapeLatexText(labels.B ?? "B");
    const c = escapeLatexText(labels.C ?? "C");
    const right = data.right === true;
    const body = right
      ? "\\draw[thick] (0,0) -- (6,0) -- (0,4) -- cycle;"
      : "\\draw[thick] (0,0) -- (6,0) -- (4.5,4) -- cycle;";
    return [
      "\\par\\noindent\\begin{tikzpicture}[scale=0.75]",
      body,
      "\\node[below] at (3,0) {$" + escapeLatexText(labels.base ?? "b") + "$};",
      right
        ? "\\node[left] at (0,2) {$" + escapeLatexText(labels.height ?? "h") + "$};"
        : "\\node[above left] at (2.2,2) {$" + escapeLatexText(labels.side ?? "c") + "$};",
      right ? "\\draw (0.4,0) -- (0.4,0.4) -- (0,0.4);" : "",
      "\\node[below left] at (0,0) {$" + a + "$};",
      "\\node[below right] at (6,0) {$" + b + "$};",
      right
        ? "\\node[above left] at (0,4) {$" + c + "$};"
        : "\\node[above right] at (4.5,4) {$" + c + "$};",
      "\\end{tikzpicture}\\par",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (kind === "free_body") {
    const labels = (Array.isArray(data.forces) ? data.forces : []) as { label?: string; direction?: string }[];
    const arrows = labels
      .slice(0, 5)
      .map((force, index) => {
        const angle = (index * 360) / Math.max(1, labels.length);
        return `\\draw[->,thick] (0,0) -- (${(2.2 * Math.cos((angle * Math.PI) / 180)).toFixed(2)},${(
          2.2 * Math.sin((angle * Math.PI) / 180)
        ).toFixed(2)}) node[above] {$${escapeLatexText(force.label ?? "F")}$};`;
      })
      .join("\n");
    return `\\par\\noindent\\begin{tikzpicture}\n\\filldraw[black!80] (0,0) circle (2pt);\n${arrows}\n\\end{tikzpicture}\\par`;
  }
  if (kind === "circuit") {
    return [
      "\\par\\noindent\\begin{tikzpicture}[scale=0.9]",
      "\\draw[thick] (0,0) rectangle (8,4);",
      "\\draw[thick] (2,4) -- (2,4.6); \\draw[thick] (2.4,4) -- (2.4,4.6);",
      "\\node[above] at (2.2,4.6) {$\\mathcal{E}$};",
      "\\draw[thick] (5,4) rectangle (6.5,3.6);",
      "\\node at (5.75,3.8) {$R$};",
      "\\end{tikzpicture}\\par",
    ].join("\n");
  }
  if (kind === "data_table") {
    const head = (Array.isArray(data.head) ? data.head : []).slice(0, 6);
    const rows = (Array.isArray(data.rows) ? data.rows : []).slice(0, 12);
    if (head.length === 0) return null;
    const cols = head.map(() => "c").join("");
    return [
      "\\par\\noindent",
      `\\begin{tabular}{@{}${cols}@{}}`,
      "\\toprule",
      head.map((cell) => escapeLatexText(String(cell))).join(" & ") + " \\\\",
      "\\midrule",
      ...rows.map((row) =>
        (Array.isArray(row) ? row : []).map((cell) => escapeLatexText(String(cell))).join(" & ") + " \\\\",
      ),
      "\\bottomrule",
      "\\end{tabular}\\par",
    ].join("\n");
  }
  return null;
}

export function isValidItemType(value: string): boolean {
  return (ITEM_TYPE_VALUES as string[]).includes(value);
}

export { itemTypeLabel };
