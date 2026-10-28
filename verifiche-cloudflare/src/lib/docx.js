// Generazione di un file Word (.docx) di verifica o soluzioni, senza librerie esterne.
// Limite noto: la matematica non diventa "equazione di Word". Le formule LaTeX ($...$)
// vengono convertite in testo leggibile con simboli Unicode (x², ½ → (1)/(2), √, π, ≤ ...).

import { makeZip } from "./zip.js";
import { formatPoints, formatDateIt, letterFor } from "./text.js";

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const esc = (value) =>
  String(value ?? "")
    .replace(XML_BAD, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", n: "ⁿ", "(": "⁽", ")": "⁾" };
const SUB = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "(": "₍", ")": "₎" };

const COMMANDS = {
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠",
  approx: "≈", sim: "∼", to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftrightarrow: "⇔", infty: "∞",
  pi: "π", alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", theta: "θ", lambda: "λ",
  mu: "μ", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", varphi: "φ", omega: "ω", Delta: "Δ", Omega: "Ω", Sigma: "Σ",
  circ: "°", degree: "°", sum: "Σ", int: "∫", surd: "√", ldots: "…", dots: "…", cdots: "⋯", in: "∈", notin: "∉",
  subset: "⊂", cup: "∪", cap: "∩", forall: "∀", exists: "∃", sin: "sin", cos: "cos", tan: "tan", log: "log",
  ln: "ln", lim: "lim", max: "max", min: "min", perp: "⊥", parallel: "∥", angle: "∠", triangle: "△",
  quad: "  ", qquad: "    ",
};

function scripts(text, marker, map) {
  const re = new RegExp(`\\${marker}(?:\\{([^{}]*)\\}|(\\\\?[A-Za-z0-9+\\-]))`, "g");
  return text.replace(re, (_, group, single) => {
    const body = group ?? single;
    const converted = [...body].map((ch) => map[ch]);
    return converted.every(Boolean) ? converted.join("") : `${marker}(${body})`;
  });
}

function mathToPlain(math) {
  let s = math;
  for (let i = 0; i < 6; i++) s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)").replace(/\\sqrt\s*([A-Za-z0-9])/g, "√$1");
  s = s.replace(/\\(?:mathrm|mathbf|mathit|text|textbf|operatorname|mathbb)\s*\{([^{}]*)\}/g, "$1");
  s = s.replace(/\\(?:left|right|bigl|bigr|Big|big)\b\s*/g, "").replace(/\\[,;:! ]/g, " ");
  s = s.replace(/\\([A-Za-z]+)/g, (_, name) => (Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : name));
  s = scripts(s, "^", SUP);
  s = scripts(s, "_", SUB);
  return s.replace(/[{}]/g, "").replace(/\s{2,}/g, " ").trim();
}

/** Converte le formule LaTeX di un testo in testo semplice con simboli Unicode. */
export function latexToPlain(input) {
  return String(input ?? "").replace(
    /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g,
    (_, a, b, c) => mathToPlain(a ?? b ?? c),
  );
}

function run(text, { bold = false, italic = false, size = 0, color = "" } = {}) {
  const props = `${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}${size ? `<w:sz w:val="${size}"/>` : ""}`;
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function para(runs, { align = "", indent = 0, after = 120, keepNext = false, ruled = false, tabRight = 0 } = {}) {
  const dotted = '<w:pBdr><w:bottom w:val="dotted" w:sz="6" w:space="1" w:color="808080"/><w:between w:val="dotted" w:sz="6" w:space="1" w:color="808080"/></w:pBdr>';
  const tabs = tabRight ? `<w:tabs><w:tab w:val="right" w:pos="${tabRight}"/></w:tabs>` : "";
  const props =
    `${keepNext ? "<w:keepNext/>" : ""}${ruled ? dotted : ""}${tabs}` +
    `<w:spacing w:after="${after}"/>${indent ? `<w:ind w:left="${indent}"/>` : ""}${align ? `<w:jc w:val="${align}"/>` : ""}`;
  return `<w:p><w:pPr>${props}</w:pPr>${runs}</w:p>`;
}

function textParagraphs(text, options = {}) {
  return latexToPlain(text)
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => para(run(line, options.run), options.para));
}

function bodyXml(test, doc) {
  const solutions = doc === "soluzioni";
  const out = [];
  const subtitle = [test.track, test.subject, test.year ? `Anno ${test.year}` : ""].filter(Boolean).join(" — ");
  const title = solutions ? `Soluzioni — ${test.title}` : test.title;

  if (test.institute.trim()) out.push(para(run(test.institute, { bold: true, size: 26 }), { align: "center", after: 40 }));
  if (subtitle) out.push(para(run(subtitle, { size: 20 }), { align: "center", after: 120 }));
  out.push(para(run(title, { bold: true, size: 32 }), { align: "center", after: 160 }));
  const details = [
    test.className.trim() ? `Classe: ${test.className}` : "",
    formatDateIt(test.date) ? `Data: ${formatDateIt(test.date)}` : "",
    `Tempo: ${test.durationMin} minuti`,
    `Punteggio: ${formatPoints(test.totalPoints)} punti`,
  ].filter(Boolean);
  out.push(para(run(details.join("     ")), { align: "center", after: 200 }));
  if (!solutions) out.push(para(run("Nome e cognome: ______________________________        Voto: ________"), { after: 200 }));
  if (test.notes.trim()) out.push(...textParagraphs(test.notes, { run: { italic: true }, para: { after: 80 } }));

  test.items.forEach((item, index) => {
    const topic = item.topic.trim() ? `  (${item.topic})` : "";
    out.push(
      para(`${run(`Quesito ${index + 1}.`, { bold: true })}${run(topic, { italic: true })}<w:r><w:tab/></w:r>${run(`[${formatPoints(item.points)} pt]`, { bold: true })}`, {
        keepNext: true,
        after: 60,
        tabRight: 9638,
      }),
    );
    out.push(...textParagraphs(item.text, { run: solutions ? { color: "595959", size: 20 } : {}, para: { after: 80 } }));

    if (item.type === "multiple_choice") {
      item.choices.forEach((choice, i) => {
        out.push(para(run(`${letterFor(i)}) `, { bold: true }) + run(latexToPlain(choice)), { indent: 360, after: 40 }));
      });
    } else if (item.type === "true_false" && !solutions) {
      out.push(para(run("☐ Vero        ☐ Falso"), { indent: 360, after: 80 }));
    }

    if (!solutions) {
      for (let i = 0; i < item.answerLines; i++) out.push(para("", { ruled: true, after: 200 }));
      out.push(para("", { after: 120 }));
      return;
    }

    out.push(para(run("Soluzione.", { bold: true }), { after: 40 }));
    if (item.solution.trim()) out.push(...textParagraphs(item.solution, { para: { after: 60 } }));
    else out.push(para(run("(soluzione non inserita)", { italic: true }), { after: 60 }));
    if (item.type === "multiple_choice" && item.correct != null) {
      out.push(para(run("Risposta corretta: ", { bold: true }) + run(`${letterFor(item.correct)})`), { after: 60 }));
    }
    if (item.type === "true_false" && item.answer != null) {
      out.push(para(run("Risposta corretta: ", { bold: true }) + run(item.answer ? "Vero" : "Falso"), { after: 60 }));
    }
    if (item.commonErrors.trim()) {
      out.push(para(run("Errori comuni attesi: ", { bold: true, size: 20 }) + run(latexToPlain(item.commonErrors), { size: 20 }), { after: 60 }));
    }
    out.push(para("", { after: 120 }));
  });

  return out.join("");
}

/** @param {"verifica"|"soluzioni"} doc @returns {Uint8Array} */
export function buildDocx(test, doc = "verifica") {
  const document =
    `${XML_HEAD}<w:document ${W_NS} ${R_NS}><w:body>${bodyXml(test, doc)}` +
    '<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="567" w:gutter="0"/></w:sectPr>' +
    "</w:body></w:document>";

  const styles =
    `${XML_HEAD}<w:styles ${W_NS}><w:docDefaults><w:rPrDefault><w:rPr>` +
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="it-IT"/>' +
    '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>';

  const footer =
    `${XML_HEAD}<w:ftr ${W_NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>` +
    '<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">Pag. </w:t></w:r>' +
    '<w:fldSimple w:instr=" PAGE "><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>' +
    '<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve"> di </w:t></w:r>' +
    '<w:fldSimple w:instr=" NUMPAGES "><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>';

  const contentTypes =
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>';

  const rootRels =
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

  const documentRels =
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>';

  return makeZip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels },
    { name: "word/document.xml", data: document },
    { name: "word/_rels/document.xml.rels", data: documentRels },
    { name: "word/styles.xml", data: styles },
    { name: "word/footer1.xml", data: footer },
  ]);
}
