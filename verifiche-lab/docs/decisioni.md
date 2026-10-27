# Decisioni di progetto

Questo documento registra le scelte tecniche e gli **scostamenti motivati** rispetto al prompt
iniziale. Ogni decisione indica il contesto, l'alternativa scartata e l'impatto.

## Sintesi

| # | Decisione | Alternativa scartata | Motivo |
| --- | --- | --- | --- |
| 1 | SQLite come database default | PostgreSQL 16 obbligatorio | Deploy scolastico e demo senza servizi esterni; schema portabile |
| 2 | Auth custom Argon2id + sessioni DB + CSRF double-cookie | Auth.js / NextAuth | Controllo completo del flusso su invito, meno dipendenze, audit esplicito |
| 3 | Adapter HTTP diretti verso i provider AI | Vercel AI SDK | Nessun lock-in, budget/limiti e riparazione JSON controllati |
| 4 | Generatore offline deterministico come default | Chiave AI obbligatoria | Il flusso completo funziona senza rete e senza costi |
| 5 | Template LaTeX con Eta + KaTeX per l'anteprima | Renderer alternativi / solo HTML | `.tex` è il deliverable; l'anteprima è un fallback di lettura |
| 6 | Array/JSON come `String` in Prisma | Tipo `Json` nativo | Portabilità SQLite/PostgreSQL senza migrazioni condizionali |
| 7 | ZIP con 8 file su compilazione riuscita | ZIP con 9 file | 3 `.tex` + 3 `.pdf` + `verifica.json` + `README.txt` = 8 |
| 8 | `pdfjs-dist` per estrarre testo dai PDF | `pdf-parse` | `pdf-parse@1.1.4` falliva su PDF Tectonic |
| 9 | Seed demo con due verifiche (Classico e Scientifico) | Una sola verifica | Dimostra la differenza di indirizzo e il confronto |
| 10 | Cache anteprima in memoria | Storage esterno | Semplice per singolo processo; documentato come limite |

## 1. Database: SQLite invece di PostgreSQL

**Contesto.** Il prompt indicava PostgreSQL 16 e Docker Compose. Il deploy tipico è un server
scolastico o un PC di dipartimento, spesso senza un DBA.

**Decisione.** SQLite è il default (`DATABASE_URL="file:./dev.db"`, provider `sqlite`). Lo schema
non usa tipi specifici di PostgreSQL: array e oggetti sono stringhe JSON. Il passaggio a
PostgreSQL richiede il cambio del provider in `prisma/schema.prisma`, di `DATABASE_URL` e una
migrazione.

**Conseguenze.**

- Backup = copia di un file.
- Nessun servizio database da avviare in locale.
- Le query Prisma restano le stesse; non ci sono query SQL native.
- In un deploy multi-utente intenso, PostgreSQL è raccomandato.

**Non è una rinuncia al modello dati**: i 17 modelli e le relazioni sono quelli del progetto.

## 2. Autenticazione: Argon2id + sessioni DB + CSRF double-cookie

**Contesto.** Il prompt citava Auth.js. Il flusso richiesto è chiuso: nessuna registrazione
pubblica, inviti creati dall'admin, ruoli semplici, audit.

**Decisione.**

- Hash Argon2id con parametri espliciti (`lib/auth/password.ts`).
- Token di sessione casuale, salvato solo come SHA-256, con scadenza e revoca.
- Cookie `vl_session` `HttpOnly` + cookie `vl_csrf` leggibile dal client; ogni mutazione invia
  `x-csrf-token` e il server confronta i valori.
- Inviti con token hashato, monouso, scadenza 7 giorni.
- Rate limit sul login in memoria.

**Perché.** Auth.js avrebbe aggiunto un'astrazione e un flusso OAuth non necessario, rendendo
meno diretto il controllo di inviti, ruoli e audit. La superficie è piccola e testata.

**Limite noto.** Il rate limit in memoria non è condiviso tra istanze; per un deploy multi-istanza
serve Redis o un reverse proxy con limiti.

## 3. AI: adapter HTTP diretti, non Vercel AI SDK

**Decisione.** `lib/ai/provider.ts` chiama direttamente le API OpenAI-compatibili, Anthropic,
Google e Ollama/LM Studio. Il contratto è JSON, validato con Zod, con riparazione e fallback.

**Perché.** Il progetto ha bisogno di: preventivo di costo, limite per generazione, budget
mensile, timeout, log del provider e riparazione del JSON. Un SDK generalista avrebbe nascosto
proprio i punti da controllare.

**Conseguenze.** Ogni nuovo provider richiede un piccolo adapter e un test; in cambio non ci sono
breaking change di SDK nel percorso critico.

## 4. Generatore deterministico come default

**Decisione.** `AI_PROVIDER=offline` è il default. Il generatore locale produce bozze coerenti con
curriculum, tipologie, difficoltà e regole; l'AI è opzionale.

**Perché.**

- La demo e la valutazione funzionano senza chiavi e senza rete.
- La scuola può usare il prodotto anche con policy che vietano servizi AI esterni.
- In caso di errore del provider, il flusso non si interrompe.
- I test di accettazione sono deterministici.

**Limite.** La qualità disciplinare delle bozze offline è quella di template didattici, non di un
modello linguistico. Il docente deve sempre rivedere. Con un provider configurato, la pipeline
usa l'AI e mantiene lo stesso contract.

## 5. LaTeX con Eta e anteprima KaTeX

**Decisione.** I documenti sono generati da template Eta (`lib/export/latex/*.tmpl`) che includono
preamble, macro e header. L'anteprima server-side è HTML + KaTeX; se il motore LaTeX è disponibile
mostra anche il PDF.

**Perché.**

- Il `.tex` è un deliverable di prima classe: deve compilare da solo.
- Eta è leggero e permette partial per tipo di quesito.
- KaTeX dà una lettura immediata senza dipendere da un motore installato.
- Il percorso di stampa resta `.tex` → PDF, non HTML → PDF.

**Conseguenze.** Le modifiche ai template vanno verificate con `npm run examples && npm run
latex:check`. L'anteprima HTML non è una rappresentazione pixel-perfect del PDF.

## 6. JSON come stringhe

**Decisione.** `options`, `objectives`, `solutionSteps`, `gradingCriteria`, `commonErrors`,
`hints`, `figureSpec`, `indicatorsJson`, `levelsJson`, `itemMappingJson`, `mappingJson`,
`subjects`, `tracks` sono `String` con serializzazione JSON.

**Perché.** SQLite non ha un tipo JSON nativo e Prisma non lo emula in modo identico a PostgreSQL.
Le stringhe rendono lo schema identico sui due database e i servizi usano un unico
`parseJson`/`toJson`.

**Conseguenze.** Le query non possono filtrare dentro il JSON a livello SQL; i filtri applicativi
avvengono in memoria o su colonne dedicate. Per il volume di un dipartimento è sufficiente.

## 7. ZIP: otto file

**Decisione.** Su compilazione riuscita il pacchetto contiene:

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

**Perché.** Il prompt parla di “sei file attesi più `verifica.json` e `README.txt`”: 6 + 1 + 1 = 8.
Una versione precedente del controllo usava 9 per un errore aritmetico; è stata corretta in
`lib/export/service.ts` e in `scripts/check-latex.ts`, con un test di accettazione che verifica
gli otto nomi.

**Fallimenti.** Se un PDF non compila, al suo posto compare un `.log.txt`; il numero di file può
aumentare. Il `.tex` resta sempre presente e scaricabile.

## 8. Estrazione testo PDF: pdfjs-dist

**Decisione.** `lib/pdf/text.ts` usa il build legacy di `pdfjs-dist` sia per l'import dei programmi
sia per il controllo qualità degli esempi. `pdf-parse` è stato rimosso.

**Perché.** `pdf-parse@1.1.4` falliva con `Invalid PDF structure` su alcuni PDF prodotti da
Tectonic. `pdfjs-dist` estrae correttamente tutte le pagine, conserva il testo del piè di pagina e
permette di contare le pagine.

**Conseguenze.** `pdfjs-dist` è una dipendenza di produzione (non solo dev), perché serve alla
route di import. Il modulo è caricato dinamicamente e inserito in `serverExternalPackages`.

## 9. Due verifiche demo

**Decisione.** Il seed crea una verifica completa per la 1ª Classico e una per la 1ª Scientifico,
entrambe da 100 punti / 60 minuti, più dieci quesiti in banca.

**Perché.** Il criterio di accettazione chiede che il Classico risulti visibilmente diverso dallo
Scientifico. Due verifiche versionate in `examples/` rendono il confronto immediato e verificabile
senza generare nulla.

## 10. Altre scelte

- **Nessun dato di studenti**: il modello non ha tabelle per studenti, voti individuali o registri.
  `classLabel` è solo un'etichetta di classe.
- **Nessuna registrazione pubblica**: solo account creati dall'admin o inviti.
- **Approvazione umana**: il pulsante è bloccato sugli errori, ma il server rivalida; non esiste
  un percorso automatico che porti una verifica a `approvata`.
- **Versioni**: snapshot JSON completi, non diff incrementali; semplicità e ripristino affidabile.
- **Cache anteprima**: in memoria, 24 voci, 10 minuti; adatta a un singolo processo.
- **Nome file**: include materia, indirizzo, anno, data, titolo e variante, per evitare collisioni
  nei download e nei pacchetti.
- **Nessun editor rich text proprietario**: textarea + Markdown/LaTeX leggero, come richiesto.
- **Italiano ovunque**: UI, messaggi di errore, documentazione, commenti di dominio.

## Scostamenti non adottati

- Non è stato introdotto un database vettoriale per la similarità: il confronto Jaccard sui token
  è sufficiente per il volume e resta spiegabile.
- Non è stato aggiunto un job queue: la generazione e la compilazione sono sincrone con timeout;
  per un uso intenso si può estrarre un worker.
- Non è stato incluso un sistema di notifiche email: gli inviti restituiscono il link, che l'admin
  condivide con il canale che preferisce.
