# VerificheLab

Generatore di verifiche di **Matematica e Fisica** per il dipartimento di un liceo italiano.
L'insegnante parte dal programma del dipartimento, configura la verifica con un wizard in sette
passaggi, rivede e corregge ogni quesito, poi esporta consegna, soluzioni e griglia di valutazione
in LaTeX e PDF.

> **L'AI propone, il docente approva.** Nessuna verifica viene pubblicata o approvata senza una
> revisione umana. Senza chiavi API funziona un generatore deterministico locale: il flusso
> completo resta utilizzabile offline.

## Indice

- [Cosa fa](#cosa-fa)
- [Avvio rapido](#avvio-rapido)
- [Credenziali demo](#credenziali-demo)
- [Flusso di lavoro](#flusso-di-lavoro)
- [Esportazione LaTeX, PDF e ZIP](#esportazione-latex-pdf-e-zip)
- [Configurazione AI](#configurazione-ai)
- [Script](#script)
- [Docker](#docker)
- [Backup e ripristino](#backup-e-ripristino)
- [Struttura del repository](#struttura-del-repository)
- [Qualità e test](#qualità-e-test)
- [Documentazione](#documentazione)
- [Limiti noti e scelte](#limiti-noti-e-scelte)

## Cosa fa

- **Programmi del dipartimento**: CRUD di curricoli, argomenti e obiettivi per Liceo Classico e
  Scientifico, anni 1–5, Matematica e Fisica; versionamento, pubblicazione, archiviazione,
  confronto tra versioni e import assistito da testo, PDF, DOCX o TXT.
- **Wizard in 7 passaggi**: contesto, programma e argomenti, struttura e tipologie, punti e durata,
  difficoltà e opzioni, anteprima della richiesta, generazione con validazione delle regole.
- **Regole didattiche**: 100 punti e 54–66 minuti per una verifica da 100 punti / 60 minuti,
  copertura degli argomenti, soluzioni e criteri obbligatori, controllo delle similarità,
  differenziazione Classico/Scientifico.
- **Editor**: modifica di ogni quesito, rigenerazione del singolo item, riequilibrio di punti e
  tempi, riordino vincolato alle sezioni, blocco dei quesiti approvati, salvataggio in banca.
- **Banca quesiti**: ricerca, filtri, visibilità privata/dipartimento/pubblico interno, valutazione,
  clonazione nelle nuove verifiche.
- **Versioni e varianti**: istantanee ripristinabili e varianti A–D con numeri, ordine o domande
  differenti.
- **Griglia e voti**: indicatori, livelli, mappatura item→indicatore, conversione in decimi con
  soglia di sufficienza e mappatura lineare o a scaglioni.
- **Esportazione**: `.tex` sempre scaricabile, PDF compilati con Tectonic o pdfLaTeX, ZIP completo,
  JSON strutturato. Se LaTeX fallisce, il log è mostrato e il sorgente resta disponibile.
- **Amministrazione**: utenti, inviti, impostazioni AI/LaTeX/istituto, statistiche, audit log.
- **Sicurezza**: accesso solo su invito, ruoli `admin`/`teacher`, sessioni in database, CSRF
  double-cookie, rate limit sul login, nessun dato di studentesse o studenti.

## Avvio rapido

Requisiti: **Node.js 24**, **npm**, un motore LaTeX (**Tectonic** consigliato, oppure pdfLaTeX).
Su Windows è possibile usare un Node portabile e Tectonic senza installazione globale.

```bash
# 1. dipendenze
npm ci

# 2. variabili d'ambiente
copy .env.example .env        # Windows
# cp .env.example .env        # macOS / Linux

# 3. database SQLite + dati dimostrativi
npm run setup

# 4. sviluppo
npm run dev
```

Apri <http://localhost:3000> e accedi con un account demo.

Per rigenerare da zero il database dimostrativo:

```bash
npm run db:reset
```

### Motore LaTeX

Il default è Tectonic:

```env
LATEX_ENGINE=tectonic
LATEX_BIN=
```

In alternativa, con pdfLaTeX installato:

```env
LATEX_ENGINE=pdflatex
LATEX_BIN=
```

`LATEX_BIN` può contenere il percorso assoluto del binario. Se il motore non è disponibile,
l'app continua a funzionare: anteprima HTML con KaTeX, download del `.tex`, messaggio esplicito
nel pannello di esportazione.

## Credenziali demo

| Ruolo | Email | Password |
| --- | --- | --- |
| Amministratore | `admin@verifichelab.local` | `Admin1234!` |
| Docente | `docente@verifichelab.local` | `Docente1234!` |
| Docente | `prof.rossi@verifichelab.local` | `Docente1234!` |

**Cambiare le password prima di qualsiasi uso reale.** Gli account sono creati dal seed e non
esiste registrazione pubblica.

## Flusso di lavoro

1. **Programmi** — il referente (o un docente) crea il curricolo del dipartimento. L'import
   assistito produce una bozza: titoli, codici, obiettivi e pesi vanno sempre rivisti. La
   pubblicazione è un atto esplicito.
2. **Nuova verifica** — il wizard guida in sette passaggi:
   contesto → programma e argomenti → struttura e tipologie → punti e durata → difficoltà e
   opzioni → riepilogo → generazione.
3. **Generazione** — il context builder seleziona programma, obiettivi e quesiti simili dalla
   banca; il generatore deterministico o l'AI produce una bozza; il rule engine normalizza punti
   e tempi, verifica copertura, soluzioni, criteri e similarità.
4. **Editor** — il docente rivede i quesiti, corregge testo e soluzioni, rigenera singoli item,
   riequilibra punti/tempi, riordina, salva versioni. L'approvazione è bloccata finché restano
   errori.
5. **Esporta** — anteprima di stampa, `.tex`, PDF, ZIP e JSON. Soluzioni e griglia sono generate
   dallo stesso modello dati, quindi numeri e punteggi restano coerenti.

## Esportazione LaTeX, PDF e ZIP

Il nome base è del tipo:

```text
verifica-matematica-1-scientifico-2026-11-12-funzioni-e-problemi-1-scie-vA
```

Il pacchetto ZIP contiene **esattamente otto file** quando la compilazione riesce:

```text
verifica-*.tex
verifica-*.pdf
soluzioni-*.tex
soluzioni-*.pdf
griglia-*.tex
griglia-*.pdf
verifica-*.json
README.txt
```

In caso di errore di compilazione, il PDF mancante è sostituito da un `.log.txt` con il log del
motore: il numero di file può quindi aumentare. Il `.tex` è comunque sempre scaricabile.

I PDF riportano il piè di pagina `Pag. X di Y` e non spezzano i quesiti a metà. I file di esempio
versionati in [`examples/`](examples/) sono la prova di compilazione: vedi
[`docs/latex.md`](docs/latex.md).

## Configurazione AI

Il default è **offline**, senza chiamate esterne:

```env
AI_PROVIDER=offline
AI_MODEL=demo-deterministico
```

Per usare un provider (OpenAI, Anthropic, Google, Ollama/LM Studio o endpoint compatibile OpenAI)
impostare in `.env`:

```env
AI_PROVIDER=openai
AI_MODEL=gpt-4.1-mini
AI_API_KEY=...
AI_MAX_COST_PER_GENERATION=0.30
AI_MONTHLY_BUDGET_EUR=30
AI_RATE_LIMIT_PER_HOUR=20
```

La chiave resta **solo lato server**. Provider, modello, budget e conservazione dei prompt sono
modificabili anche da `/amministrazione/impostazioni`. In caso di JSON invalido o errore del
provider, la pipeline ripara o ricade sul generatore deterministico senza perdere i dati del
wizard. Dettagli in [`docs/prompt-e-manutenzione.md`](docs/prompt-e-manutenzione.md).

## Script

| Comando | Funzione |
| --- | --- |
| `npm run dev` | Sviluppo su `http://localhost:3000` |
| `npm run build` | Build di produzione Next.js |
| `npm start` | Server di produzione |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict, nessuna emissione |
| `npm test` | Test Vitest (unitari + accettazione su DB demo) |
| `npm run test:e2e` | Smoke test Playwright |
| `npm run db:push` | Applica lo schema Prisma a SQLite |
| `npm run db:seed` | Seed idempotente |
| `npm run db:reset` | Reset schema + seed |
| `npm run examples` | Rigenera `.tex`, PDF, JSON e ZIP in `examples/` |
| `npm run latex:check` | Ricompila e valida tutti gli esempi |

## Docker

```bash
docker compose up --build
```

L'app è su <http://localhost:3000>; il database SQLite vive nel volume `verifiche-data`. Il
container include pdfLaTeX e i pacchetti usati dai template. Il seed demo viene eseguito al primo
avvio se `SEED_DEMO=true` (default nel compose). Per un deploy reale: cambiare `AUTH_SECRET`,
disattivare il seed demo, cambiare le password, montare un volume per `storage/`.

## Backup e ripristino

Il database è un singolo file SQLite:

```bash
# backup a caldo
copy prisma\dev.db backup\dev-2026-10-26.db

# ripristino
copy backup\dev-2026-10-26.db prisma\dev.db
```

Con Docker:

```bash
docker compose exec app sh -c "cp /data/verifiche.db /data/verifiche-backup.db"
```

I sorgenti `.tex` e i JSON esportati sono la copia più portabile dei materiali: conservarli
insieme al backup del database. Nessun dato di studenti è presente.

## Struttura del repository

```text
app/                 route Next.js (pagine e API)
components/          UI: shell, wizard, editor, banca, programmi, amministrazione
lib/
  ai/                config, provider HTTP, prompt, context builder, pipeline
  auth/              Argon2id, sessioni DB, CSRF, rate limit
  curriculum/        servizio e import assistito
  generation/        generatore deterministico, rule engine, orchestrazione
  export/            modello, template Eta, escape, compilazione, HTML/KaTeX, ZIP
  tests/             repository, permessi, serializzazione, snapshot
  pdf/               estrazione testo con pdf.js
prisma/              schema, seed, database locale
scripts/             esempi e controllo LaTeX
tests/               Vitest + Playwright
examples/            verifica completa versionata (.tex/.pdf/.json/.zip)
docs/                architettura, decisioni, guida docenti, LaTeX, roadmap
```

## Qualità e test

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run examples
npm run latex:check
```

I test coprono rule engine, conversione voti, schemi, parser dei programmi, escaping LaTeX,
permessi, accettazione 100 pt/54–66 min, presenza di soluzioni e criteri, contenuto ZIP e
`Pag. X di Y` estratto dai PDF. `npm run latex:check` ricompila ogni `.tex` da solo e verifica
log, punteggi, numero di pagine e pacchetto ZIP. Vedi [`docs/accettazione.md`](docs/accettazione.md).

## Documentazione

- [`docs/architettura.md`](docs/architettura.md) — livelli, dati, flussi, sicurezza.
- [`docs/decisioni.md`](docs/decisioni.md) — decisioni e scostamenti motivati.
- [`docs/guida-docenti.md`](docs/guida-docenti.md) — uso passo-passo.
- [`docs/latex.md`](docs/latex.md) — template e personalizzazione.
- [`docs/prompt-e-manutenzione.md`](docs/prompt-e-manutenzione.md) — prompt, provider, contratto JSON.
- [`docs/roadmap.md`](docs/roadmap.md) — milestone e prossimi passi.
- [`docs/accettazione.md`](docs/accettazione.md) — criteri verificati e comandi.
- [`AGENTS.md`](AGENTS.md) — convenzioni per agenti e manutentori.

## Limiti noti e scelte

- **SQLite** è il default per il deploy scolastico e lo sviluppo locale. Lo schema è portabile a
  PostgreSQL cambiando provider in `prisma/schema.prisma` e `DATABASE_URL`; gli array/JSON sono
  conservati come stringhe per evitare dipendenze dal tipo `Json` nativo.
- **Auth custom** (Argon2id + sessioni DB + CSRF double-cookie) invece di Auth.js: meno superficie
  di dipendenze e flusso su invito interamente controllato.
- **Adapter AI HTTP diretti** invece di Vercel AI SDK: nessun lock-in e budget/limiti espliciti.
- **Generatore deterministico** come default: la demo funziona senza rete e senza chiavi; l'AI è
  un'opzione, non un requisito.
- L'anteprima HTML con KaTeX è un fallback di lettura, **non** sostituisce il percorso `.tex` → PDF.
- I contenuti dei programmi demo sono segnaposto dichiarati, **non** programmi ministeriali.

## Licenza

Progetto interno scolastico. Prima della pubblicazione esterna verificare licenza e titolarità dei
contenuti inseriti dal dipartimento.
