// Generazione del sorgente LaTeX (.tex) di verifica e soluzioni.
// Il file prodotto è autonomo: si compila con pdflatex (due passate) o con Tectonic/Overleaf.
// Convenzione: ogni "a capo" nei testi è un nuovo paragrafo.

import { formatPoints, formatDateIt, letterFor } from "./text.js";

const PREAMBLE = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[italian]{babel}
\usepackage[a4paper,top=1.8cm,bottom=1.8cm,left=2cm,right=2cm,headheight=15pt]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{tikz}
\usepackage{pgffor}
\usepackage{enumitem}
\usepackage{fancyhdr}
\usepackage{lastpage}
\usepackage{booktabs}
\usepackage{siunitx}
\usepackage{xcolor}
\usepackage{needspace}
\usepackage{array}
\usepackage{textcomp}
\usepackage[hidelinks]{hyperref}
\sisetup{output-decimal-marker={,},group-separator={.},per-mode=symbol}
\setlength{\parindent}{0pt}
\setlength{\parskip}{3pt}
\setlist[enumerate]{itemsep=3pt,topsep=3pt,leftmargin=8mm}
\raggedbottom`;

const MACROS = String.raw`% Comandi personalizzati: modifica qui la grafica.
\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0.4pt}
\fancyfoot[C]{\small Pag. \thepage\ di \pageref{LastPage}}
\newcommand{\punti}[1]{\hfill\textbf{[#1~pt]}}
\newcommand{\riga}{\noindent\makebox[\linewidth]{\dotfill}\par\vspace{4mm}}
\newcommand{\rispostarighe}[1]{\par\vspace{1mm}\foreach \i in {1,...,#1}{\riga}}
\newcommand{\intestazione}[7]{%
  \begin{center}
    {\large\bfseries #1}\\[1mm]
    {\small #2}\\[3mm]
    {\Large\bfseries #3}\\[3mm]
    \begin{tabular}{@{}p{0.48\textwidth}p{0.48\textwidth}@{}}
      Classe: #4 & Data: #5 \\
      Tempo: #6 & Punteggio: #7 \\
    \end{tabular}
  \end{center}
}
\newcommand{\erroricomuni}[1]{%
  \par\smallskip
  \noindent\fcolorbox{black!25}{black!3}{%
    \begin{minipage}{\dimexpr\linewidth-2\fboxsep-2\fboxrule\relax}
      \small\textbf{Errori comuni attesi:} #1
    \end{minipage}}\par\smallskip
}`;

const MATH_SEGMENT = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\))/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// Comandi che non devono mai comparire dentro la matematica scritta dall'utente:
// il file potrebbe essere compilato da altri (Overleaf, PC dei colleghi).
const BLOCKED =
  /\\(input|include|includeonly|write|openout|openin|read|readline|immediate|catcode|csname|def|edef|gdef|xdef|let|futurelet|newcommand|renewcommand|providecommand|usepackage|RequirePackage|documentclass|special|directlua|ShellEscape|verbatiminput|lstinputlisting|href|url)(?![A-Za-z])/g;

const TEXT_MAP = {
  "°": "\\textdegree{}",
  "²": "\\textsuperscript{2}",
  "³": "\\textsuperscript{3}",
  "µ": "\\textmu{}",
  "×": "$\\times$",
  "⋅": "$\\cdot$",
  "·": "$\\cdot$",
  "÷": "$\\div$",
  "−": "$-$",
  "≤": "$\\le$",
  "≥": "$\\ge$",
  "≠": "$\\ne$",
  "≈": "$\\approx$",
  "±": "$\\pm$",
  "∞": "$\\infty$",
  "→": "$\\to$",
  "√": "$\\surd$",
  "π": "$\\pi$",
  "μ": "$\\mu$",
  "α": "$\\alpha$",
  "β": "$\\beta$",
  "γ": "$\\gamma$",
  "δ": "$\\delta$",
  "θ": "$\\theta$",
  "λ": "$\\lambda$",
  "σ": "$\\sigma$",
  "φ": "$\\varphi$",
  "ω": "$\\omega$",
  "Δ": "$\\Delta$",
  "Ω": "$\\Omega$",
  "€": "\\texteuro{}",
  "…": "\\ldots{}",
  "“": "\\textquotedblleft{}",
  "”": "\\textquotedblright{}",
  "‘": "`",
  "’": "'",
  "–": "--",
  "—": "---",
  " ": " ",
  '"': "\\textquotedbl{}",
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
  "ª": "\\textsuperscript{a}",
  "º": "\\textsuperscript{o}",
};

const MATH_MAP = {
  "°": "^\\circ ",
  "²": "^2",
  "³": "^3",
  "µ": "\\mu ",
  "×": "\\times ",
  "⋅": "\\cdot ",
  "·": "\\cdot ",
  "÷": "\\div ",
  "−": "-",
  "≤": "\\le ",
  "≥": "\\ge ",
  "≠": "\\ne ",
  "≈": "\\approx ",
  "±": "\\pm ",
  "∞": "\\infty ",
  "→": "\\to ",
  "√": "\\surd ",
  "π": "\\pi ",
  "μ": "\\mu ",
  "α": "\\alpha ",
  "β": "\\beta ",
  "γ": "\\gamma ",
  "δ": "\\delta ",
  "θ": "\\theta ",
  "λ": "\\lambda ",
  "σ": "\\sigma ",
  "φ": "\\varphi ",
  "ω": "\\omega ",
  "Δ": "\\Delta ",
  "Ω": "\\Omega ",
  " ": " ",
};

function escapePlain(segment) {
  let out = "";
  for (const char of segment) {
    if (Object.hasOwn(TEXT_MAP, char)) {
      out += TEXT_MAP[char];
      continue;
    }
    const code = char.codePointAt(0);
    if (char === "\n") out += char;
    else if (code < 0x20 || code === 0x7f) continue;
    else if (code > 0x17f) out += "?";
    else out += char;
  }
  return out.replace(/\n+/g, "\n\n");
}

function sanitizeMath(segment) {
  let out = "";
  for (const char of segment) {
    if (Object.hasOwn(MATH_MAP, char)) {
      out += MATH_MAP[char];
      continue;
    }
    const code = char.codePointAt(0);
    if (char === "\n") out += " ";
    else if (code < 0x20 || code === 0x7f) continue;
    else if (code > 0x17f) out += "?";
    else out += char;
  }
  return out.replace(BLOCKED, (_, name) => `\\backslash{}${name}`);
}

/** Escape dei caratteri speciali fuori dalla matematica; la matematica ($...$, $$...$$, \(...\)) passa. */
export function escapeLatex(input) {
  const source = String(input ?? "").replace(/\r\n/g, "\n").replace(CONTROL, "");
  let result = "";
  let last = 0;
  for (const match of source.matchAll(MATH_SEGMENT)) {
    const index = match.index ?? 0;
    result += escapePlain(source.slice(last, index));
    result += sanitizeMath(match[0]);
    last = index + match[0].length;
  }
  result += escapePlain(source.slice(last));
  return result;
}

function block(text) {
  return escapeLatex(text).trim();
}

function headerLines(test, doc) {
  const solutions = doc === "soluzioni";
  const subtitle = [test.track, test.subject, test.year ? `Anno ${test.year}` : ""].filter(Boolean).join(" -- ");
  const title = solutions ? `Soluzioni -- ${test.title}` : test.title;
  const arg = (value) => escapeLatex(value).trim() || "~";
  return [
    `\\intestazione{${arg(test.institute)}}{${arg(subtitle)}}{${arg(title)}}{${arg(test.className)}}{${arg(formatDateIt(test.date))}}{${test.durationMin} minuti}{${formatPoints(test.totalPoints)} punti}`,
  ];
}

/** @param {"verifica"|"soluzioni"} doc */
export function renderTex(test, doc = "verifica") {
  const solutions = doc === "soluzioni";
  const out = [PREAMBLE, MACROS, "\\begin{document}", ...headerLines(test, doc)];

  if (!solutions) {
    out.push("\\noindent Nome e cognome: \\makebox[8cm]{\\hrulefill}\\hfill Voto: \\makebox[2cm]{\\hrulefill}\\par\\vspace{3mm}");
  }
  if (test.notes.trim()) out.push(`\\noindent\\textit{${block(test.notes)}}\\par\\vspace{2mm}`);

  test.items.forEach((item, index) => {
    const n = index + 1;
    out.push("");
    out.push(`\\needspace{${solutions ? 6 : 8}\\baselineskip}`);
    const topic = item.topic.trim() ? ` \\textit{(${escapeLatex(item.topic).trim()})}` : "";
    out.push(`\\noindent\\textbf{Quesito ${n}.}${topic} \\punti{${formatPoints(item.points)}}\\par`);

    const statement = block(item.text);
    out.push(solutions ? `{\\small\\color{black!70} ${statement}\\par}` : statement);

    if (item.type === "multiple_choice") {
      out.push("\\begin{enumerate}[label=\\alph*)" + (solutions ? ",leftmargin=10mm" : "") + "]");
      for (const choice of item.choices) out.push(`\\item ${block(choice) || "~"}`);
      out.push("\\end{enumerate}");
    } else if (item.type === "true_false" && !solutions) {
      out.push("\\par\\noindent\\textbf{Vero}~$\\square$\\qquad\\textbf{Falso}~$\\square$\\par");
    }

    if (!solutions) {
      if (item.answerLines > 0) out.push(`\\rispostarighe{${item.answerLines}}`);
      return;
    }

    out.push("\\par\\smallskip\\noindent\\textbf{Soluzione.}\\par");
    out.push(item.solution.trim() ? block(item.solution) : "\\textit{(soluzione non inserita)}");
    if (item.type === "multiple_choice" && item.correct != null) {
      out.push(`\\par\\noindent\\textbf{Risposta corretta:} ${letterFor(item.correct)})\\par`);
    }
    if (item.type === "true_false" && item.answer != null) {
      out.push(`\\par\\noindent\\textbf{Risposta corretta:} ${item.answer ? "Vero" : "Falso"}\\par`);
    }
    if (item.commonErrors.trim()) out.push(`\\erroricomuni{${block(item.commonErrors)}}`);
  });

  out.push("", "\\end{document}", "");
  return out.join("\n");
}
