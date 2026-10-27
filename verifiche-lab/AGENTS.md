# AGENTS.md

Istruzioni per agenti AI e manutentori che lavorano su VerificheLab.

## Obiettivo del progetto

Web app per il dipartimento di Matematica e Fisica di un liceo: genera verifiche stampabili
(LaTeX/PDF), soluzioni e griglie a partire dai programmi del dipartimento, con revisione umana
obbligatoria. UI, contenuti e documentazione sono **in italiano**.

## Avvio

```bash
npm ci
cp .env.example .env
npm run setup      # db push + seed
npm run dev
```

Serve Node 24 e un motore LaTeX (Tectonic consigliato, pdfLaTeX supportato). Se il motore manca,
l'app deve restare utilizzabile: `.tex` scaricabile e anteprima HTML.

## Comandi di verifica

Prima di considerare concluso un lavoro:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run examples
npm run latex:check
```

Non dichiarare “fatto” ciò che non è stato eseguito. Se un comando non è eseguibile
nell'ambiente, scriverlo esplicitamente e indicare il motivo.

## Struttura

- `app/` — pagine e route API Next.js. Le route sono sottili.
- `components/` — UI. Server Components per il caricamento, Client Components per l'interazione.
- `lib/` — dominio: `ai`, `auth`, `curriculum`, `generation`, `export`, `tests`, `bank`,
  `grade-scale`, `admin`, `pdf`.
- `prisma/` — schema e seed.
- `prompts/` — prompt e JSON Schema (solo server).
- `lib/export/latex/` — template Eta e preamble.
- `tests/` — Vitest (`*.test.ts`) e Playwright (`tests/e2e/*.spec.ts`).
- `examples/` — esempi versionati di proposito (PDF inclusi).
- `docs/` — architettura, decisioni, guide.

## Convenzioni

- TypeScript strict; evitare `any` non motivati.
- Italiano per UI, messaggi, commenti di dominio e documentazione.
- Import alias `@/`.
- Componenti UI proprietari in `components/ui`; non introdurre librerie di componenti pesanti.
- Array/JSON nel database sono `String`: usare `parseJson`/`toJson`.
- Punti: multipli di `0,25`. Tempi: minuti interi.
- Tipi quesito canonici: `multiple_choice`, `true_false`, `short_answer`, `open_answer`,
  `exercise`, `problem`, `graph`, `lab_data`, `proof` (con underscore).
- Le mutazioni API passano da `guardApi` (sessione, ruolo, CSRF, Zod).
- Non usare `router.refresh()` nell'editor: sostituire lo stato con la risposta API.
- Non inserire dati di studentesse o studenti.

## Regole per non rompere il contratto JSON

Il contratto è formato da:

1. `prompts/schema.json`;
2. `generatedTestSchema` in `lib/schemas.ts`;
3. normalizzazione/riparazione in `lib/ai/pipeline.ts`;
4. template e persistenza.

Se cambi uno di questi, aggiorna **tutti** gli altri e aggiungi un test. Non eliminare
`solution_steps` o `grading_criteria`: sono obbligatori. Non cambiare i nomi dei campi senza una
migrazione dei dati e degli esempi.

## LaTeX

- I template devono restare **autonomi**: preamble, macro e header inclusi.
- Ogni `.tex` deve compilare da solo con Tectonic e con due passate pdfLaTeX.
- Il piè di pagina `Pag. X di Y` deve restare su ogni pagina.
- Non generare PDF solo da HTML.
- Dopo una modifica: `npm run examples && npm run latex:check`.
- L'escape dei caratteri speciali è in `lib/export/latex/escape.ts`: i comandi generati
  internamente usano token, non vanno escapati due volte.
- Il tipo quesito mappa il partial sostituendo `_` con `-`.

## AI

- La chiave API è solo server-side.
- Il default è `AI_PROVIDER=offline`; ogni modifica deve funzionare anche offline.
- Il JSON del modello non è attendibile: validare, riparare, poi applicare il rule engine.
- Non hardcodare modelli o prompt nel client.
- Documentare i costi stimati e i limiti.

## Database

- SQLite è il default; non usare funzionalità specifiche di PostgreSQL.
- Non committare `prisma/dev.db`, `.env`, `storage/`, `test-results/`, `playwright-report/`.
- I PDF in `examples/` si versionano di proposito; gli altri PDF sono ignorati.
- Il seed è idempotente: non duplicare curricula/verifiche demo.

## Test

- Unitari: rule engine, grading, schemi, parser, escaping, permessi, contratto AI.
- Accettazione: DB demo, 100 pt/60 min, ZIP 8 file, PDF `Pag. X di Y`.
- E2E: login, dashboard, apertura verifica.
- Aggiungere un test per ogni bug corretto.
- Non modificare i test per farli passare senza risolvere la causa.

## Cosa non committare

- `.env`, chiavi API, segreti.
- `node_modules/`, `.next/`, `storage/`, database locale.
- Screenshot di errore o artifact Playwright.
- File temporanei o script scratch (`scripts/_*`).

## Stile dei commit

Conventional Commits:

```text
feat: aggiunge il confronto tra versioni
fix: corregge l'escape di ° nei testi LaTeX
docs: aggiorna la guida docenti
test: copre il fallback JSON invalido
chore: aggiorna le dipendenze
```

Un commit = una modifica coerente. Aggiornare `CHANGELOG.md` per cambi visibili.

## Documentazione da aggiornare

- Nuova funzione utente → `docs/guida-docenti.md` e `README.md`.
- Scelta tecnica o scostamento → `docs/decisioni.md`.
- Cambio di flusso/architettura → `docs/architettura.md`.
- Template/pacchetti LaTeX → `docs/latex.md`.
- Prompt/provider/schema → `docs/prompt-e-manutenzione.md`.
- Milestone → `docs/roadmap.md`.
- Criteri verificati → `docs/accettazione.md`.
