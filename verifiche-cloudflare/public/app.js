// Interfaccia: JavaScript semplice, senza librerie. Tutto il testo dell'utente passa da
// textContent/value (mai innerHTML), così non serve fidarsi dei contenuti salvati.

const TYPE_LABELS = {
  multiple_choice: "Scelta multipla",
  true_false: "Vero/Falso",
  open: "Domanda aperta",
  exercise: "Esercizio",
};
const EXPORTS = [
  ["zip", "Tutto (ZIP)"],
  ["tex", ".tex"],
  ["tex-soluzioni", ".tex soluzioni"],
  ["docx", ".docx"],
  ["docx-soluzioni", ".docx soluzioni"],
  ["json", ".json"],
];

const app = document.getElementById("app");
const dlg = document.getElementById("dlg");
const toastEl = document.getElementById("toast");
let me = { institute: "" };
let current = null; // { record, dirty }
let toastTimer;

/* ---------- utilità ---------- */

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key in el && key !== "list") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 4000);
}

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* risposta non JSON */
  }
  if (!response.ok) {
    const error = new Error(data?.error ?? `Errore ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function errorBox(error) {
  const list = error.data?.errors;
  return h(
    "div",
    { class: "card errors", role: "alert" },
    h("strong", {}, error.message),
    Array.isArray(list) && list.length ? h("ul", {}, list.map((e) => h("li", {}, e))) : null,
  );
}

function fmtDate(iso) {
  const d = new Date(String(iso).replace(" ", "T") + (String(iso).includes("Z") || String(iso).includes("+") ? "" : "Z"));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

function field(label, input, hint) {
  return h("div", {}, h("label", {}, label, input), hint ? h("p", { class: "hint" }, hint) : null);
}

/* ---------- elenco ---------- */

async function showList() {
  current = null;
  app.replaceChildren(h("p", {}, "Caricamento…"));
  let tests;
  try {
    tests = (await api("/tests")).tests;
  } catch (error) {
    app.replaceChildren(errorBox(error));
    return;
  }
  const fileInput = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: importJson });
  app.replaceChildren(
    h("h1", {}, "Le verifiche"),
    h(
      "div",
      { class: "bar" },
      h("button", { class: "primary", onclick: openNewDialog }, "Nuova verifica"),
      h("button", { onclick: () => fileInput.click() }, "Importa JSON"),
      fileInput,
    ),
    tests.length === 0
      ? h("div", { class: "card empty" }, "Nessuna verifica salvata. Creane una con «Nuova verifica».")
      : h(
          "ul",
          { class: "list" },
          tests.map((t) =>
            h(
              "li",
              { class: "card row" },
              h(
                "div",
                {},
                h("a", { class: "title", href: `#/t/${t.id}` }, t.title),
                h(
                  "div",
                  { class: "meta" },
                  [t.subject, t.track, t.year ? `classe ${t.year}ª` : "", `${t.itemCount} quesiti`, `${t.totalPoints} punti`, fmtDate(t.updatedAt)]
                    .filter(Boolean)
                    .join(" · "),
                ),
              ),
              h(
                "div",
                { class: "tools" },
                h("a", { class: "btn small", href: `/api/tests/${t.id}/export?format=zip`, download: "" }, "ZIP"),
                h("button", { class: "small", onclick: () => duplicate(t.id) }, "Duplica"),
                h("button", { class: "small danger", onclick: () => remove(t) }, "Elimina"),
              ),
            ),
          ),
        ),
  );
}

async function duplicate(id) {
  try {
    const { record } = await api(`/tests/${id}/duplicate`, { method: "POST", body: {} });
    location.hash = `#/t/${record.id}`;
  } catch (error) {
    toast(error.message);
  }
}

async function remove(t) {
  if (!confirm(`Eliminare «${t.title}»? Non si può annullare.`)) return;
  try {
    await api(`/tests/${t.id}`, { method: "DELETE" });
    toast("Verifica eliminata.");
    showList();
  } catch (error) {
    toast(error.message);
  }
}

async function importJson(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 400_000) throw new Error("File troppo grande.");
    const data = JSON.parse(await file.text());
    const { record } = await api("/tests", { method: "POST", body: { test: data.test ?? data } });
    location.hash = `#/t/${record.id}`;
  } catch (error) {
    toast(error instanceof SyntaxError ? "Il file non è un JSON valido." : error.data?.errors?.[0] ?? error.message);
  }
}

/* ---------- nuova verifica ---------- */

function openNewDialog() {
  const f = {
    mode: h("select", { name: "mode" }, h("option", { value: "draft" }, "Bozza automatica"), h("option", { value: "empty" }, "Verifica vuota")),
    title: h("input", { name: "title", maxLength: 200 }),
    subject: h("select", { name: "subject" }, h("option", { value: "matematica" }, "Matematica"), h("option", { value: "fisica" }, "Fisica")),
    track: h("select", { name: "track" }, h("option", { value: "scientifico" }, "Liceo Scientifico"), h("option", { value: "classico" }, "Liceo Classico")),
    year: h("select", { name: "year" }, [1, 2, 3, 4, 5].map((n) => h("option", { value: n, selected: n === 3 }, `${n}ª`))),
    className: h("input", { name: "className", maxLength: 40, placeholder: "es. 3A" }),
    topics: h("textarea", { name: "topics", placeholder: "es. derivate, limiti, equazioni di secondo grado", rows: 3 }),
    items: h("input", { name: "items", type: "number", min: 1, max: 30, value: 8 }),
    durationMin: h("input", { name: "durationMin", type: "number", min: 5, max: 600, value: 60 }),
    totalPoints: h("input", { name: "totalPoints", type: "number", min: 1, max: 1000, value: 100 }),
  };
  const message = h("div");
  const draftOnly = h(
    "div",
    { class: "grid wide" },
    field("Argomenti (separati da virgola)", f.topics, "Per ogni argomento riconosciuto (derivate, integrali, moto, ecc.) creo quesiti con numeri casuali."),
    field("Numero di quesiti", f.items),
  );
  const toggle = () => (draftOnly.hidden = f.mode.value !== "draft");
  f.mode.addEventListener("change", toggle);
  const submit = h("button", { class: "primary", type: "submit" }, "Crea");

  const form = h(
    "form",
    {
      method: "dialog",
      onsubmit: async (event) => {
        event.preventDefault();
        submit.disabled = true;
        message.replaceChildren();
        try {
          const base = {
            subject: f.subject.value,
            track: f.track.value,
            year: Number(f.year.value),
            title: f.title.value,
            className: f.className.value,
            durationMin: Number(f.durationMin.value),
            totalPoints: Number(f.totalPoints.value),
            institute: me.institute ?? "",
          };
          let test;
          if (f.mode.value === "draft") {
            const draft = await api("/draft", { method: "POST", body: { ...base, topics: f.topics.value, items: Number(f.items.value) } });
            test = draft.test;
            sessionStorageSafe("warnings", JSON.stringify(draft.warnings ?? []));
          } else {
            test = { ...base, title: base.title || "Nuova verifica", subject: base.subject, notes: "", items: [] };
          }
          const { record } = await api("/tests", { method: "POST", body: { test } });
          dlg.close();
          location.hash = `#/t/${record.id}`;
        } catch (error) {
          message.replaceChildren(errorBox(error));
          submit.disabled = false;
        }
      },
    },
    h("h2", { style: "margin-top:0" }, "Nuova verifica"),
    field("Come iniziare", f.mode),
    field("Titolo (facoltativo)", f.title),
    h("div", { class: "grid" }, field("Materia", f.subject), field("Indirizzo", f.track), field("Anno", f.year), field("Classe", f.className)),
    draftOnly,
    h("div", { class: "grid" }, field("Durata (minuti)", f.durationMin), field("Punteggio totale", f.totalPoints)),
    message,
    h("div", { class: "actions" }, h("button", { type: "button", onclick: () => dlg.close() }, "Annulla"), submit),
  );
  dlg.replaceChildren(form);
  dlg.showModal();
  f.mode.focus();
}

function sessionStorageSafe(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* storage non disponibile: pazienza */
  }
}
function takeSession(key) {
  try {
    const v = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return v;
  } catch {
    return null;
  }
}

/* ---------- editor ---------- */

async function showEditor(id) {
  app.replaceChildren(h("p", {}, "Caricamento…"));
  let record;
  try {
    record = (await api(`/tests/${id}`)).record;
  } catch (error) {
    app.replaceChildren(errorBox(error), h("a", { href: "#/" }, "← Torna all'elenco"));
    return;
  }
  let warnings = [];
  try {
    warnings = JSON.parse(takeSession("warnings") ?? "[]");
  } catch {
    warnings = [];
  }
  current = { record, dirty: false };
  renderEditor(warnings);
}

function markDirty() {
  if (!current) return;
  current.dirty = true;
  const s = document.getElementById("status");
  if (s) {
    s.textContent = "Modifiche non salvate";
    s.className = "dirty";
  }
}

function bind(input, obj, key, { number = false, nullable = false } = {}) {
  input.addEventListener("input", () => {
    const v = input.value;
    obj[key] = number ? (v === "" ? (nullable ? null : 0) : Number(v.replace(",", "."))) : v;
    markDirty();
  });
  return input;
}

function renderEditor(warnings = []) {
  const { record } = current;
  const test = record.test;
  const status = h("span", { id: "status", class: "saved" }, `Salvata (revisione ${record.revision})`);
  const message = h("div", { id: "message" });

  const header = h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "grid" },
      h("div", { class: "wide" }, field("Titolo", bind(h("input", { value: test.title, maxLength: 200 }), test, "title"))),
      field("Istituto", bind(h("input", { value: test.institute ?? "", maxLength: 200 }), test, "institute")),
      field("Materia", bind(h("input", { value: test.subject ?? "", maxLength: 80 }), test, "subject")),
      field("Indirizzo", bind(h("input", { value: test.track ?? "", maxLength: 80 }), test, "track")),
      field("Anno (1-5)", bind(h("input", { type: "number", min: 1, max: 5, value: test.year ?? "" }), test, "year", { number: true, nullable: true })),
      field("Classe", bind(h("input", { value: test.className ?? "", maxLength: 40 }), test, "className")),
      field("Data", bind(h("input", { type: "date", value: test.date ?? "" }), test, "date")),
      field("Durata (min)", bind(h("input", { type: "number", min: 5, max: 600, value: test.durationMin }), test, "durationMin", { number: true })),
      field("Punteggio totale", bind(h("input", { type: "number", min: 1, step: "any", value: test.totalPoints }), test, "totalPoints", { number: true })),
      h("div", { class: "wide" }, field("Note per gli studenti", bind(h("textarea", { value: test.notes ?? "", rows: 2 }), test, "notes"))),
    ),
  );

  const itemsBox = h("div", { id: "items" });
  const sum = h("span", { class: "meta", id: "sum" });
  const draw = () => {
    itemsBox.replaceChildren(...test.items.map((item, i) => itemCard(test, item, i, draw)));
    const total = test.items.reduce((acc, it) => acc + (Number(it.points) || 0), 0);
    sum.textContent = `${test.items.length} quesiti · somma punti ${Math.round(total * 100) / 100} / ${test.totalPoints}`;
  };
  current.redraw = draw;

  const addButtons = Object.entries(TYPE_LABELS).map(([type, label]) =>
    h("button", { class: "small", onclick: () => { test.items.push(newItem(type)); markDirty(); draw(); } }, `+ ${label}`),
  );

  app.replaceChildren(
    ...[
    h("p", {}, h("a", { href: "#/" }, "← Tutte le verifiche")),
    warnings.length ? h("div", { class: "card notice" }, h("strong", {}, "Da rivedere"), h("ul", {}, warnings.map((w) => h("li", {}, w)))) : null,
    header,
    h("h2", {}, "Quesiti"),
    h("div", { class: "bar" }, sum, h("span", { class: "grow" }), h("button", { onclick: rebalance }, "Ridistribuisci i punti")),
    itemsBox,
    h("div", { class: "bar" }, addButtons),
    h(
      "div",
      { class: "card" },
      h("div", { class: "bar" }, h("button", { class: "primary", id: "save", onclick: save }, "Salva"), status),
      message,
    ),
    h("h2", {}, "Scarica"),
    h("div", { class: "card" }, h("div", { class: "exports", id: "exports" }), h("p", { class: "hint" }, "I file scaricati riflettono l'ultima versione salvata. Il PDF si ottiene compilando il .tex (pdflatex o Overleaf) o esportando dal .docx.")),

    ].filter(Boolean),
  );
  draw();
  drawExports();
}

function drawExports() {
  const box = document.getElementById("exports");
  if (!box || !current) return;
  box.replaceChildren(
    ...EXPORTS.map(([format, label]) =>
      h("a", { class: "btn", href: `/api/tests/${current.record.id}/export?format=${format}`, download: "" }, label),
    ),
  );
}

function newItem(type) {
  const base = { id: crypto.randomUUID().replace(/-/g, "").slice(0, 12), type, topic: "", text: "", points: 5, solution: "", commonErrors: "", answerLines: type === "exercise" ? 8 : type === "open" ? 6 : 0 };
  if (type === "multiple_choice") return { ...base, choices: ["", "", "", ""], correct: 0 };
  if (type === "true_false") return { ...base, choices: [], answer: true };
  return { ...base, choices: [] };
}

function itemCard(test, item, index, redraw) {
  const move = (delta) => {
    const j = index + delta;
    if (j < 0 || j >= test.items.length) return;
    [test.items[index], test.items[j]] = [test.items[j], test.items[index]];
    markDirty();
    redraw();
  };
  const typeSelect = h(
    "select",
    {
      onchange: (e) => {
        item.type = e.target.value;
        if (item.type === "multiple_choice" && (!item.choices || item.choices.length < 2)) {
          item.choices = ["", "", "", ""];
          item.correct = 0;
        }
        if (item.type === "true_false" && typeof item.answer !== "boolean") item.answer = true;
        markDirty();
        redraw();
      },
    },
    Object.entries(TYPE_LABELS).map(([value, label]) => h("option", { value, selected: value === item.type }, label)),
  );

  const parts = [
    h(
      "header",
      {},
      h("strong", {}, `Quesito ${index + 1}`),
      h(
        "div",
        { class: "tools" },
        h("button", { class: "small", onclick: () => move(-1), disabled: index === 0, "aria-label": "Sposta su" }, "↑"),
        h("button", { class: "small", onclick: () => move(1), disabled: index === test.items.length - 1, "aria-label": "Sposta giù" }, "↓"),
        h("button", { class: "small", onclick: () => { test.items.splice(index + 1, 0, { ...structuredClone(item), id: crypto.randomUUID().replace(/-/g, "").slice(0, 12) }); markDirty(); redraw(); } }, "Duplica"),
        h("button", { class: "small danger", onclick: () => { test.items.splice(index, 1); markDirty(); redraw(); } }, "Elimina"),
      ),
    ),
    h(
      "div",
      { class: "grid" },
      field("Tipo", typeSelect),
      field("Argomento", bind(h("input", { value: item.topic ?? "", maxLength: 200 }), item, "topic")),
      field("Punti", bind(h("input", { type: "number", min: 0, step: "any", value: item.points }), item, "points", { number: true })),
      h("div", { class: "wide" }, field("Testo (le formule si scrivono in LaTeX tra $…$)", bind(h("textarea", { value: item.text ?? "" }), item, "text"))),
    ),
  ];

  if (item.type === "multiple_choice") {
    const box = h("div");
    const paint = () =>
      box.replaceChildren(
        ...item.choices.map((choice, k) =>
          h(
            "div",
            { class: "choice" },
            h("input", { type: "radio", name: `c-${item.id}`, checked: item.correct === k, "aria-label": `Opzione ${k + 1} corretta`, onchange: () => { item.correct = k; markDirty(); } }),
            h("input", { type: "text", value: choice, maxLength: 500, "aria-label": `Opzione ${k + 1}` }),
            h("button", { class: "small danger", type: "button", disabled: item.choices.length <= 2, onclick: () => { item.choices.splice(k, 1); if (item.correct === k) item.correct = 0; else if (item.correct > k) item.correct--; markDirty(); paint(); } }, "✕"),
          ),
        ),
        item.choices.length < 8 ? h("button", { class: "small", type: "button", onclick: () => { item.choices.push(""); markDirty(); paint(); } }, "+ opzione") : null,
      );
    paint();
    box.addEventListener("input", (e) => {
      if (e.target.type !== "text") return;
      const inputs = [...box.querySelectorAll("input[type=text]")];
      item.choices[inputs.indexOf(e.target)] = e.target.value;
      markDirty();
    });
    parts.push(h("div", {}, h("label", {}, "Opzioni (seleziona quella corretta)"), box));
  } else if (item.type === "true_false") {
    parts.push(
      field(
        "Risposta corretta",
        h(
          "select",
          { onchange: (e) => { item.answer = e.target.value === "true"; markDirty(); } },
          h("option", { value: "true", selected: item.answer === true }, "Vero"),
          h("option", { value: "false", selected: item.answer === false }, "Falso"),
        ),
      ),
    );
  } else {
    parts.push(field("Righe di spazio per la risposta", bind(h("input", { type: "number", min: 0, max: 30, value: item.answerLines ?? 0 }), item, "answerLines", { number: true })));
  }

  parts.push(
    field("Soluzione (solo nel fascicolo soluzioni)", bind(h("textarea", { value: item.solution ?? "" }), item, "solution")),
    field("Errori frequenti", bind(h("input", { value: item.commonErrors ?? "" }), item, "commonErrors")),
  );
  return h("section", { class: "card item" }, parts);
}

async function rebalance() {
  if (!current) return;
  try {
    const { test } = await api("/rescale", { method: "POST", body: { test: current.record.test } });
    current.record.test.items.forEach((it, i) => (it.points = test.items[i]?.points ?? it.points));
    markDirty();
    current.redraw();
    toast("Punti ridistribuiti sul totale.");
  } catch (error) {
    toast(error.data?.errors?.[0] ?? error.message);
  }
}

async function save() {
  if (!current) return;
  const button = document.getElementById("save");
  const message = document.getElementById("message");
  const status = document.getElementById("status");
  button.disabled = true;
  message.replaceChildren();
  try {
    const { record } = await api(`/tests/${current.record.id}`, {
      method: "PUT",
      body: { revision: current.record.revision, test: current.record.test },
    });
    current.record = record;
    current.dirty = false;
    status.textContent = `Salvata (revisione ${record.revision})`;
    status.className = "saved";
    current.redraw();
    toast("Salvata.");
  } catch (error) {
    if (error.status === 409 && error.data?.record) {
      message.replaceChildren(
        h(
          "div",
          { class: "card errors", role: "alert" },
          h("strong", {}, error.message),
          h("p", {}, "Puoi caricare la versione salvata (perdi le modifiche qui) oppure sovrascriverla con la tua."),
          h(
            "div",
            { class: "actions" },
            h("button", { onclick: () => { current.record = error.data.record; current.dirty = false; renderEditor(); } }, "Carica la versione salvata"),
            h("button", { class: "danger", onclick: () => { current.record.revision = error.data.record.revision; save(); } }, "Sovrascrivi con la mia"),
          ),
        ),
      );
    } else {
      message.replaceChildren(errorBox(error));
    }
  } finally {
    button.disabled = false;
  }
}

/* ---------- avvio ---------- */

function route() {
  if (current?.dirty && !confirm("Ci sono modifiche non salvate. Uscire comunque?")) {
    history.replaceState(null, "", `#/t/${current.record.id}`);
    return;
  }
  const match = location.hash.match(/^#\/t\/([A-Za-z0-9_-]+)$/);
  if (match) showEditor(match[1]);
  else showList();
}

window.addEventListener("beforeunload", (event) => {
  if (current?.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("hashchange", route);

try {
  me = await api("/me");
  document.getElementById("who").textContent = [me.institute, me.email].filter(Boolean).join(" · ");
} catch {
  /* se /api/me fallisce, le altre chiamate mostreranno l'errore */
}
route();
