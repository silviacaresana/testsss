# Architettura

VerificheLab è una web app **Next.js 15 (App Router) + React 19 + TypeScript strict**, con
persistenza Prisma/SQLite e generazione LaTeX lato server. L'unità centrale non è il testo libero
prodotto dall'AI, ma un **modello dati strutturato** da cui derivano anteprima, PDF, soluzioni,
griglia e JSON.

## 1. Livelli

```text
┌──────────────────────────────────────────────────────────────┐
│ UI (App Router, Server Components + Client Components)       │
│ dashboard · programmi · wizard · editor · banca · admin       │
└──────────────────────────────┬───────────────────────────────┘
                               │ fetch JSON same-origin + CSRF
┌──────────────────────────────▼───────────────────────────────┐
│ API Route Handlers (app/api/**)                              │
│ guardApi: sessione → ruolo → CSRF → Zod                      │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ Servizi di dominio (lib/**)                                  │
│ curriculum · generation · tests/repository · bank · grading  │
│ admin · export · ai                                           │
└───────────────┬──────────────────────────────┬───────────────┘
                │ Prisma                       │ child_process
┌───────────────▼──────────────┐  ┌────────────▼───────────────┐
│ SQLite (default) / Postgres  │  │ Tectonic / pdfLaTeX        │
│ 17 modelli, JSON come String │  │ .tex → .pdf, log, timeout  │
└──────────────────────────────┘  └────────────────────────────┘
```

### Perché questa separazione

- Le regole didattiche e i permessi vivono nei servizi, non nelle route o nei componenti: sono
  testabili senza browser.
- Le route sono sottili: parsing, autorizzazione, chiamata al servizio, risposta normalizzata.
- L'editor client riceve un `SerializedTest` e sostituisce lo stato locale con la risposta delle
  API; non dipende da `router.refresh()` per ogni modifica.
- L'export non legge lo stato del browser: rilegge la verifica dal database, così il PDF è sempre
  riproducibile e coerente con l'ultima versione salvata.

## 2. Modello dati

| Modello | Ruolo |
| --- | --- |
| `User` | Docente/admin; `subjects` e `tracks` sono JSON serializzati in `String` |
| `Session` | Token di sessione hashato (SHA-256), scadenza, revoca |
| `Invite` | Invito a uso singolo, token hashato, scadenza 7 giorni |
| `Curriculum` | Programma per indirizzo/anno/materia, versione, stato |
| `Topic` | Argomento del programma, pesi e fascia di difficoltà |
| `LearningObjective` | Obiettivo operativo, prerequisiti e keyword |
| `Test` | Verifica: contesto, punti, durata, opzioni, stato, provider AI |
| `Section` | Raggruppamento stampabile dei quesiti |
| `Item` | Quesito: tipo, testo, opzioni, punti, difficoltà, soluzione, criteri |
| `GradeScale` | Scala di conversione punti→decimi, lineare o a scaglioni |
| `Rubric` | Indicatori, livelli, mappatura item→indicatori |
| `ItemBankEntry` | Snapshot di quesito riutilizzabile, visibilità e rating |
| `GenerationRun` | Richiesta, esito, provider, costo stimato, durata |
| `Export` | Storico esportazioni, formato, esito, estratto del log |
| `TestVersion` | Istantanea JSON ripristinabile |
| `AuditLog` | Azioni rilevanti con metadati |
| `Setting` | Impostazioni AI, LaTeX e istituto modificabili da admin |

### Convenzioni

- Gli array e gli oggetti sono salvati come **stringhe JSON** (`String`) e letti con
  `parseJson`/`toJson`. Questo mantiene lo schema portabile tra SQLite e PostgreSQL senza il tipo
  `Json` nativo.
- Gli importi sono in euro e arrotondati a 4 decimali; i punti sono multipli di `0,25`.
- Le date sono `DateTime`; nelle risposte API sono ISO 8601.
- I nomi file sono derivati da materia, indirizzo, anno, data e titolo, con suffisso variante.

## 3. Autenticazione e sicurezza

- **Password**: Argon2id (`@node-rs/argon2`, memory 19 MiB, time 2, parallelism 1).
- **Sessione**: token casuale 256 bit, salvato solo come SHA-256 in `Session`; cookie `HttpOnly`,
  `SameSite=Lax`, `Secure` in produzione.
- **CSRF**: double-cookie. Il client legge `vl_csrf`, invia `x-csrf-token`; il server confronta i
  due valori con confronto a tempo costante.
- **Ruoli**: `admin` e `teacher`. L'admin vede tutto; il docente vede le proprie verifiche e i
  modelli condivisi. `canAccessTest` e `canEditTest` sono funzioni pure testate.
- **Inviti**: nessuna registrazione pubblica. L'admin crea un invito o un account; il token è
  hashato, monouso e scade.
- **Rate limit**: login per IP/email in memoria, sufficiente per un singolo processo; in un
  deploy multi-istanza va sostituito con Redis o middleware dedicato.
- **Audit**: login, generazione, approvazione, export, modifiche admin e operazioni sensibili.
- **Dati**: nessun campo per studentesse/studenti, voti individuali o identificativi di classe
  nominali. `classLabel` è un'etichetta libera della classe, non un registro.

## 4. Pipeline di generazione

```text
Wizard (7 step)
  → POST /api/tests/estimate        stima costo/tempo
  → POST /api/tests/generate
      1. validazione Zod della richiesta
      2. loadCurriculum + selectedTopicContexts
      3. context builder: programma, obiettivi, esempi dalla banca
      4. provider:
           offline → generateDeterministic (seed, varianti)
           AI      → generateWithAi (JSON contract, retry/repair, budget)
      5. applyRules: punti, tempi, copertura, soluzioni, criteri, similarità
      6. persistenza: Test + Section + Item + Rubric + GenerationRun
      7. varianti A–D (numeri/ordine/domande) se richieste
  → redirect a /verifiche/{primaryId}?nuova=1
```

### Rule engine

Il rule engine è la fonte di verità sulle regole didattiche:

- punteggio totale esatto (normalizzazione proporzionale a quarti di punto);
- tempo stimato entro ±10% della durata, con normalizzazione a minuti interi;
- copertura di tutti gli argomenti selezionati;
- ogni quesito deve avere soluzione svolta e criteri di punteggio;
- topic e obiettivi devono appartenere al programma;
- scelta multipla con quattro opzioni e risposta valida;
- similarità testuale: errore sopra il 95%, avviso sopra l'85%;
- coerenza tra difficoltà dichiarata e tempo stimato;
- unità di misura per la Fisica (avviso).

Gli errori bloccano l'approvazione; gli avvisi restano visibili al docente. Il client disabilita
il pulsante di approvazione sugli errori rilevati, ma il server rivalida sempre.

### Generatore deterministico

`lib/generation/deterministic.ts` produce quesiti coerenti con tipo, difficoltà, argomento e
vincoli, usando template didattici e un seed. Non inventa programmi ministeriali: lavora solo sui
topic e sugli obiettivi presenti nel curriculum. È il default (`AI_PROVIDER=offline`) e la rete di
sicurezza quando l'AI fallisce.

## 5. Export LaTeX

```text
Test + Section + Item + Rubric + GradeScale
  → buildExportModel (lib/export/model.ts)
  → template Eta (lib/export/latex/*.tmpl)
  → verifica.tex / soluzioni.tex / griglia.tex
  → compileLatex (Tectonic o pdfLaTeX, 2 passate, timeout)
  → PDF oppure log + .tex scaricabile
  → ZIP: 3 .tex + 3 .pdf + 1 .json + README.txt
```

- I template sono **autonomi**: preamble, macro e header sono inclusi nel sorgente.
- `escapeLatexText` protegge i caratteri speciali fuori dalla matematica e preserva i segmenti
  `$...$`, `$$...$$`, `\(...\)`; i comandi generati internamente sono protetti con token.
- Il piè di pagina usa `lastpage`: `Pag. X di Y` su ogni pagina.
- `needspace` evita di spezzare un quesito a metà.
- In caso di errore il log è conservato in `Export.logExcerpt`; il `.tex` viene restituito comunque.
- L'anteprima server-side usa HTML + KaTeX come fallback leggibile; non è il percorso di stampa.

Dettagli e personalizzazione in [`latex.md`](latex.md).

## 6. API principali

| Area | Route |
| --- | --- |
| Auth | `POST /api/auth/login`, `/logout`, `GET /csrf`, `PATCH /profile`, `POST /auth/invite` |
| Programmi | `GET/POST /api/curricula`, `GET/PUT/DELETE /api/curricula/[id]`, `publish`, `archive`, `new-version`, `diff`, `POST /import` |
| Verifiche | `GET/POST /api/tests`, `POST /estimate`, `POST /generate`, `GET/PATCH/DELETE /api/tests/[id]` |
| Quesiti | `POST /items`, `PATCH/DELETE /items/[itemId]`, `regenerate`, `duplicate`, `bank` |
| Struttura | `reorder`, `rebalance`, `status`, `duplicate`, `variants` |
| Versioni | `GET/POST /versions`, `POST /versions/[versionId]/restore` |
| Griglia | `GET/PUT /rubric` |
| Export | `GET /export?format=tex/pdf/zip/json`, `GET /preview`, `GET /json` |
| Banca | `GET/POST /api/bank`, `GET/PATCH/DELETE /api/bank/[id]`, `POST /rating` |
| Scale | `GET/POST /api/grade-scales`, `GET/PATCH/DELETE /api/grade-scales/[id]` |
| Admin | `settings`, `users`, `users/[id]`, `logs`, `stats`, `invites`, `invites/[id]` |

Tutte le mutazioni passano da `guardApi` (sessione + CSRF, ruolo dove richiesto). Gli errori sono
JSON con `error` e, per Zod, `issues`.

## 7. Frontend

- Shell con sidebar, header e area contenuti; palette “carta calda”, verde profondo, ambra.
- Server Components per i caricamenti iniziali; Client Components per wizard, editor, banca,
  programmi e amministrazione.
- Wizard a 7 passaggi con stato locale e validazione progressiva.
- Editor a schede: Quesiti, Anteprima, Griglia, Versioni, Esporta.
- Componenti UI proprietari e piccoli (`Button`, `Card`, `Field`, `Modal`, `Notice`, `Badge`).
- Accessibilità: label esplicite, focus visibile, contrasto, testi in italiano, icone con
  `aria-hidden` quando decorative.

## 8. Deployment

- **Locale/scuola**: Node 24 + SQLite + Tectonic o pdfLaTeX.
- **Docker**: immagine Node con pdfLaTeX e pacchetti TeX; volume per database e `storage/`.
- **PostgreSQL**: cambio provider Prisma e `DATABASE_URL`; gli array restano stringhe JSON.
- **Storage**: `storage/tmp` per compilazioni, cache anteprima in memoria (24 voci, 10 minuti).
  In un deploy multi-istanza la cache va esternalizzata.
- **Osservabilità**: audit log su database; log applicativi su stdout. Non è incluso un APM.

## 9. Punti di estensione

- Nuovo provider AI: aggiungere un adapter in `lib/ai/provider.ts` e la voce in `AI_PROVIDERS`.
- Nuovo tipo quesito: valore in `lib/constants.ts`, schema in `lib/schemas.ts`, template
  `item-*.tex.tmpl`, ramo nel generatore deterministico e nell'editor.
- Nuova regola didattica: funzione nel rule engine + test unitario.
- Nuovo formato di export: ramo in `lib/export/service.ts` e route dedicata.
- PostgreSQL: provider Prisma, `DATABASE_URL`, eventuale migrazione; i servizi non cambiano.
