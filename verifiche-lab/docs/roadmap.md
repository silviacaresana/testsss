# Roadmap

Stato aggiornato al **26 ottobre 2026**. Il progetto è un MVP completo e verificato; le voci
“dopo l'MVP” sono pianificate, non implementate.

## M0 — Fondamenta ✅

- Repository Next.js 15 / React 19 / TypeScript strict.
- Prisma + SQLite, schema completo, seed idempotente.
- Auth con Argon2id, sessioni DB, CSRF, inviti, rate limit.
- Shell UI, login, dashboard, `.env.example`.
- Docker Compose, CI, README e documentazione di base.

## M1 — Programmi ✅

- CRUD curriculum, argomenti, obiettivi.
- Versionamento, pubblicazione, archiviazione, confronto versioni.
- Import assistito da testo/PDF/DOCX/TXT con parser deterministico e fallback AI.
- UI di revisione con editor degli argomenti e obiettivi.
- Seed: 1ª Classico e 1ª Scientifico, Matematica, contenuti segnaposto dichiarati.

## M2 — Generazione ✅

- Wizard in 7 passaggi con stima costo/tempo.
- Context builder: curriculum, obiettivi, banca, anti-ripetizione, stile per indirizzo.
- Contratto JSON + validazione Zod + riparazione.
- Generatore deterministico offline come default.
- Rule engine: 100 pt, 54–66 min, copertura, soluzioni, criteri, similarità.
- Persistenza verifica/sezioni/item/rubrica/run.
- Test unitari su regole e contratto.

## M3 — Editor e stampa ✅

- Editor a schede con modifica di tutti i campi.
- Rigenerazione singolo item, duplicazione, salvataggio in banca.
- Riequilibrio punti/tempi, riordino vincolato, blocco item.
- Anteprima PDF o fallback HTML + KaTeX.
- Template LaTeX per verifica, soluzioni, griglia; 9 tipi di quesito.
- Compilazione Tectonic/pdfLaTeX, log, `.tex` sempre scaricabile.
- Export `.tex`, PDF, ZIP (8 file), JSON.
- Griglia e conversione in decimi.
- Esempi versionati in `examples/` e controllo automatico.

## M4 — Banca e condivisione ✅

- Banca con visibilità privata/dipartimento/pubblico interno.
- Ricerca, filtri, rating, clonazione, eliminazione dei propri.
- Versioni e varianti A–D.
- Approvazione umana con blocco sugli errori.
- Permessi testati: nessun accesso alle verifiche private di altri.

## M5 — Rifinitura ✅ (MVP)

- UI accessibile e interamente in italiano.
- Gestione errori con messaggi comprensibili.
- Audit log, statistiche, impostazioni istituto/AI/LaTeX.
- Test E2E Playwright (login, dashboard, apertura verifica).
- Documentazione: architettura, decisioni, guida docenti, LaTeX, prompt, accettazione.
- Immagini della guida (dove presenti).
- Backup SQLite e deploy Docker.

## Dopo l'MVP (v1)

- [ ] OCR per programmi scansionati (PDF immagine).
- [ ] Notifiche email per inviti e scadenze.
- [ ] Confronto affiancato Classico/Scientifico nell'editor (oggi si confrontano due verifiche).
- [ ] Import di verifiche da `.json` esportato.
- [ ] Firma digitale / metadati PDF opzionali.
- [ ] Esportazione `.docx` per i consigli di classe che lo richiedono.
- [ ] Worker separato per generazioni e compilazioni lunghe.
- [ ] Cache anteprima su storage condiviso per deploy multi-istanza.
- [ ] Rate limit distribuito (Redis).
- [ ] Copertura test ≥ 70% misurata su `lib/generation` e `lib/ai`.
- [ ] Accessibilità certificata (WCAG 2.1 AA) con audit esterno.
- [ ] Localizzazione inglese (solo se richiesta; la UI resta italiana di default).

## Idee v2 (non pianificate)

- Suggerimenti di programmazione didattica basati sull'archivio.
- Analisi degli errori ricorrenti per classe (senza dati personali).
- Banca quesiti con ricerca semantica.
- Integrazione con registro elettronico (da valutare per privacy e compliance).

## Debito tecnico noto

- `npm audit` segnala vulnerabilità in dipendenze di sviluppo; valutare aggiornamenti periodici.
- Il rate limit del login è in memoria.
- La cache dell'anteprima è in memoria.
- Il generatore deterministico è volutamente semplice: non sostituisce la revisione disciplinare.
- La copertura non è ancora misurata con soglia automatica.
- Il confronto tra varianti è a livello di titolo/metadati, non diff testuale.

## Come contribuire

Vedi [`AGENTS.md`](../AGENTS.md) e [`docs/prompt-e-manutenzione.md`](prompt-e-manutenzione.md).
Ogni modifica deve superare lint, typecheck, test, build e controllo LaTeX.
