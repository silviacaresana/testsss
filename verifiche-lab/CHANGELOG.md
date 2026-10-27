# Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il progetto usa
[Conventional Commits](https://www.conventionalcommits.org/).

## [Non rilasciato]

### Aggiunto

- MVP completo: autenticazione su invito, ruoli, dashboard, profilo.
- CRUD dei programmi con argomenti, obiettivi, versioni, pubblicazione, archiviazione e diff.
- Import assistito da testo, TXT, MD, DOCX e PDF, con parser deterministico e fallback AI.
- Wizard in 7 passaggi con stima di costo e tempo.
- Generatore deterministico offline e adapter AI diretti (OpenAI, Anthropic, Google, Ollama,
  endpoint compatibili).
- Rule engine con normalizzazione di punti e tempi, copertura, soluzioni, criteri, similarità.
- Editor con modifica item, rigenerazione, duplicazione, riordino, riequilibrio, blocco.
- Anteprima PDF o HTML + KaTeX.
- Template LaTeX per verifica, soluzioni e griglia; 9 tipi di quesito; `Pag. X di Y`.
- Export `.tex`, PDF, ZIP e JSON; ZIP con 8 file; log e `.tex` scaricabile in caso di errore.
- Banca quesiti con visibilità, ricerca, rating e clonazione.
- Versioni ripristinabili e varianti A–D.
- Griglia con indicatori, livelli, mappatura e conversione in decimi (lineare o a scaglioni).
- Amministrazione: utenti, inviti, impostazioni AI/LaTeX/istituto, log, statistiche.
- Seed demo: 3 utenti, 2 programmi, 2 verifiche 100 pt/60 min, 10 quesiti in banca.
- Esempi versionati in `examples/` con `.tex`, `.pdf`, `.json` e ZIP.
- Test Vitest (regole, voti, schemi, parser, escaping, permessi, contratto AI, accettazione).
- Smoke test Playwright.
- Dockerfile e Docker Compose con pdfLaTeX.
- CI GitHub Actions, template issue/PR.
- Documentazione in italiano: architettura, decisioni, guida docenti, LaTeX, prompt, roadmap,
  accettazione, AGENTS.

### Corretto

- **Escape LaTeX**: i comandi generati per `°`, `²`, `³`, `µ`, `×`, `÷`, `−`, `≤`, `≥`, `→`, `μ`,
  `π`, `√` non vengono più doppiamente escapati; erano resi come testo letterale.
- **Import programmi**: le intestazioni in stile “Equazioni e disequazioni” seguite da un elenco
  vengono riconosciute; il titolo del documento non assorbe il primo argomento.
- **Controllo PDF**: migrazione da `pdf-parse` a `pdfjs-dist`; regex tollerante a `Pag. 3 di4`.
- **ZIP**: numero atteso corretto a 8 file (3 `.tex` + 3 `.pdf` + JSON + README).
- **Test E2E**: selettore password non ambiguo e timeout adeguato alla prima compilazione dev.

### Modificato

- `pdfjs-dist` è una dipendenza di produzione; rimosso `pdf-parse`.
- Cache anteprima in memoria, 24 voci, 10 minuti.

### Sicurezza

- Argon2id, sessioni hashatte, CSRF double-cookie, rate limit login, audit log.
- Nessun dato di studentesse o studenti.
- Nessuna registrazione pubblica; account creati dall'admin o tramite invito.

## Note

- SQLite è il default; PostgreSQL è supportato cambiando provider Prisma e `DATABASE_URL`.
- Il generatore offline è il default per garantire il funzionamento senza rete.
