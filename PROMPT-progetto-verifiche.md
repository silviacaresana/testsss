# Prompt per AI — "VerificheLab"

> **Come si usa questo file**
> Incolla tutto il contenuto di questo documento (dalla sezione 1 in poi) come messaggio iniziale
> a un agente di coding (Claude Code, Cursor, Codex, Copilot Workspace, OpenCode, ecc.).
> Il documento è scritto come specifica di progetto: l'agente deve costruire il repository,
> non solo descriverlo. Se l'agente ha un limite di contesto, puoi dargli le sezioni in blocco,
> ma **non tagliare le sezioni 3, 6, 7 e 16**: sono il cuore del progetto.

---

## 1. Obiettivo

Costruisci da zero, in un repository Git, un'applicazione web chiamata **VerificheLab**:
uno strumento interno per i docenti di **Matematica e Fisica** di un dipartimento, che genera
**verifiche scolastiche pronte da stampare** a partire dai programmi didattici del dipartimento,
differenziate per **Liceo Classico** e **Liceo Scientifico**, dalla **prima alla quinta**.

Input tipico del docente:

- indirizzo (Classico / Scientifico), anno (1–5), materia (Matematica / Fisica);
- argomenti da includere, scelti dal programma del dipartimento (con eventuali pesi);
- **punteggio totale** della verifica (es. 100, 60, 10) e **durata in minuti** (es. 60, 90, 120);
- tipologie di quesiti desiderate, difficoltà media, vincoli (calcolatrice sì/no, formulario, ecc.);
- numero di versioni (A/B) per ridurre le copiature.

Output atteso — per **ogni** verifica l'app deve produrre sia il **sorgente LaTeX (`.tex`)** sia il
**PDF compilato (`.pdf`)**:

1. `verifica.tex` + `verifica.pdf`: la verifica impaginata in A4, pronta da fotocopiare;
2. `soluzioni.tex` + `soluzioni.pdf`: le **soluzioni svolte**;
3. `griglia.tex` + `griglia.pdf`: la **griglia di valutazione** (indicatori, descrittori,
   punteggi, conversione in voto);
4. `verifica.json` (dati strutturati, per modifiche e rigenerazioni) e lo storico delle versioni.

L'app **non** è un chatbot generico: è un flusso guidato con validazione automatica,
banca di quesiti riutilizzabili e revisione tra colleghi.

---

## 2. Principi guida (vincolanti)

1. **Il programma del dipartimento è la fonte di verità.** Nessun contenuto deve essere
   inventato fuori dai topic/obiettivi selezionati. I programmi li inserisce il dipartimento
   (import da testo/PDF/Word, con revisione umana).
2. **L'AI propone, il docente approva.** Nessuna verifica è "ufficiale" finché un docente non
   la valida. Ogni item generato è modificabile e rigenerabile singolarmente.
3. **La matematica deve essere corretta.** Ogni item passa controlli automatici (somma punti,
   coerenza dei dati, esistenza della soluzione, unità di misura) e un passaggio di
   "revisione critica" prima di essere mostrato.
4. **Prima la stampa, e in LaTeX.** Il PDF è il prodotto principale, ma deve essere generato
   dal sorgente `.tex` versionato e sempre scaricabile: margini, font, spazi per lo
   svolgimento, interruzioni di pagina, intestazione, numerazione. Il `.tex` è un deliverable
   di prima classe, non un extra.
5. **Nessun dato di studenti.** Solo account docenti. Niente nomi, voti o dati di minori nel
   database (evita tutto il problema GDPR/consenso). È un requisito, non una preferenza.
6. **Deve funzionare su PC scolastici modesti**, in rete locale, senza dipendenze esotiche.
7. **Italiano** in tutta la UI, nel codice dei contenuti e nella documentazione.

---

## 3. Funzionalità richieste

### 3.1 MVP (da consegnare funzionante)

**A. Autenticazione e ruoli**
- Login docenti (email + password, oppure magic link).
- Ruoli: `admin` (referente di dipartimento) e `teacher`.
- Nessuna registrazione pubblica: l'admin invita/crea gli account.
- Profilo docente: nome visualizzato, materia/e, indirizzi seguiti.

**B. Programmi del dipartimento (curricula)**
- Entità `Curriculum`: indirizzo (`classico` | `scientifico`), anno (1–5), materia
  (`matematica` | `fisica`), versione, stato (`bozza` | `pubblicato`), autore, note.
- Dentro il curriculum: `Topic` (macro-argomento) → `LearningObjective` (obiettivo specifico),
  con prerequisiti, parole chiave, livello di difficoltà tipico, indicazione di "argomento
  portante" o "secondario".
- Editor manuale (CRUD) + **import assistito**: il docente incolla il testo del programma
  (o carica PDF/DOCX), l'AI lo struttura in topic/obiettivi, il docente rivede e corregge,
  poi pubblica. L'import non pubblica mai automaticamente.
- Confronto tra versioni del curriculum.

**C. Wizard di generazione** (il cuore dell'app)
Passo-passo, con riepilogo finale:
1. Indirizzo, anno, materia, titolo, data (opzionale), classe (testo libero, opzionale).
2. Argomenti: selezione multipla dall'albero del curriculum + peso/percentuale per argomento.
3. Struttura: numero di esercizi, mix di tipologie, difficoltà media (scala 1–5), eventuale
   presenza di un problema "lungo" e di domande teoriche.
4. Punteggio totale (intero o con decimali .25/.5) e **durata in minuti**.
5. Vincoli: calcolatrice, formulario, tavole goniometriche, "senza derivate", "solo
   definizioni", linguaggio semplificato (DSA), spazio per lo svolgimento.
6. Versioni: quante (1–4) e cosa variare (numeri / ordine / domande).
7. Genera → anteprima con punteggio e tempo stimato → modifica/approva.

**D. Motore di generazione con validazione**
- Prompt costruito dal curriculum + profilo di stile (Classico/Scientifico) + vincoli +
  esempi (few-shot) presi dalla banca quesiti del dipartimento.
- Output **JSON strutturato** e validato con schema (Zod/Pydantic). Se non valido: riparazione
  automatica (max 2 tentativi) con elenco degli errori.
- Controlli bloccanti: somma dei punteggi = totale richiesto (tolleranza 0); tempo stimato
  entro ±10% della durata; copertura di tutti i topic selezionati; nessun item duplicato
  (similarità testuale); ogni item ha soluzione e criteri di punteggio.
- Controlli di qualità (warning, non bloccanti): ambiguità, dati non realistici, unità di
  misura mancanti, soluzione che non torna, difficoltà incoerente, eccesso di calcolo.

**E. Editor della verifica**
- Modifica inline di consegne, opzioni, punteggi, soluzioni.
- Rigenera singolo item mantenendo tipo/punti/topic; blocca gli item che non vuoi toccare.
- Riordina, duplica, elimina; ricalcolo automatico del punteggio con riequilibrio assistito.
- Anteprima "come stampa" in tempo reale: mostra il **PDF compilato** in un iframe con debounce
  (fallback HTML + KaTeX se il motore LaTeX non è disponibile).
- Salvataggio automatico, storico versioni, duplicazione di una verifica esistente.

**F. Esportazione: sorgente LaTeX + PDF compilato (obbligatorio nell'MVP)**
- Ogni verifica produce un **pacchetto di esportazione** scaricabile come ZIP o come singoli file:
  - `verifica.tex` + `verifica.pdf`
  - `soluzioni.tex` + `soluzioni.pdf`
  - `griglia.tex` + `griglia.pdf`
  - `verifica.json` (dati strutturati, per rieditare senza rifare la generazione)
  - `README.txt` con il comando di compilazione
- Endpoint `POST /api/tests/:id/export` con `format=tex|pdf|zip|json`; il download ZIP contiene
  tutto il pacchetto. Nome file:
  `verifica-{materia}-{anno}-{track}-{data}-{slug}-v{A}.tex`.
- Header configurabile: istituto, indirizzo, classe, materia, data, tempo, punteggio,
  "nome e cognome", spazio per il voto, soglia di sufficienza, eventuale logo.
- Impaginazione: nessun item spezzato tra due pagine, spazi per lo svolgimento, riquadri per
  i risultati, griglia per i grafici dove serve, numerazione "Pag. X di Y".
- Export `.docx` facoltativo (v1), per chi corregge in Word.

**F.1 Regole per il sorgente `.tex`**
- Il `.tex` deve essere **autonomo e compilabile** con `pdflatex` (due passate) oppure
  `tectonic`, senza file esterni obbligatori e usando solo pacchetti di TeX Live.
- Template parametrici in `lib/export/latex/`: `main.tex.tmpl`, `preamble.tex`, `macros.tex`,
  `header.tex`, un parziale per tipologia di item (`item-multiple-choice.tex`,
  `item-open.tex`, `item-problem.tex`, `item-graph.tex`…), `solutions.tex.tmpl`,
  `rubric.tex.tmpl`. Rendering con un template engine (Eta/Handlebars), **escape** dei
  caratteri speciali (`& % $ # _ { } ~ ^ \`) nel testo non matematico.
- Preambolo: `article` 11pt A4, `geometry` (margini 2 cm), `babel[italian]`, `fontenc[T1]`,
  `inputenc[utf8]`, `amsmath`, `amssymb`, `graphicx`, `tikz`, `enumitem`, `fancyhdr`,
  `lastpage`, `booktabs`, `siunitx`, `multicol`, `xcolor`, `needspace`.
- Comandi custom: `\punti{}`, `\spaziorisposta{}`, `\intestazione{}`, `\titolosezione{}`,
  `\soluzione{}`, così il dipartimento può cambiare la grafica agendo su `macros.tex`.
- Soluzioni: stesso ordine e stessa numerazione della verifica, passaggi in `enumerate`,
  criteri di punteggio in tabella, errori comuni in un box.
- Griglia: tabella `booktabs` indicatori × livelli con descrittori, punteggi per item e
  conversione in voto.
- Compilazione server-side in un container con **TeX Live** (schema `texlive-latex-extra` +
  `texlive-lang-italian`) oppure con il binario **Tectonic**. Timeout 60 s, directory
  temporanea, **nessun shell escape** (`-no-shell-escape`, `openin_any=p`, `openout_any=p`).
- Se la compilazione fallisce: salva comunque il `.tex`, mostra le ultime 30 righe del log e
  offri il download del sorgente; il flusso non si blocca. Il fallback HTML→Chromium è
  ammesso solo come riserva, non come percorso principale.
- Il `.tex` è deterministico: stessi dati → stesso contenuto; usa `\pdfinfo` con titolo e
  autore, niente date dinamiche non fissate.
- Le formule arrivano già in LaTeX dal JSON (`$...$`): il generatore `.tex` non le riconverte,
  fa solo escaping del testo normale.

**G. Banca quesiti e condivisione**
- Ogni item generato può essere salvato nella banca del dipartimento con tag (anno, materia,
  topic, difficoltà, tipo, autore).
- Ricerca/filtri; clona in una nuova verifica; "mi piace"/valutazione a stelle; note.
- Visibilità: `privato` | `dipartimento` | `pubblico interno`.
- Le verifiche approvate sono riutilizzabili come modello.

**H. Griglia di valutazione**
- Indicatori configurabili (default: *Conoscenze*, *Abilità procedurali*, *Risoluzione di
  problemi*, *Linguaggio e argomentazione*).
- Ogni item è mappato su uno o più indicatori.
- Livelli 1–4 con descrittori testuali; punteggio per indicatore calcolato dagli item.
- Tabella di conversione punteggio → voto in decimi, configurabile per verifica
  (soglia sufficienza, scala lineare o a scaglioni).

**I. Impostazioni e amministrazione**
- Gestione docenti, ruoli, inviti.
- Scelta del provider/modello AI (vedi §11) e limiti di spesa mensili.
- Gestione curricula e pubblicazione.
- Log delle generazioni (chi, quando, modello, token, costo stimato) — **senza** il testo
  completo se l'admin disattiva la conservazione.

### 3.2 v1 (dopo l'MVP)

- Versioni A/B con chiave risposte separata e "antitrucco" (numeri diversi, stesso scheletro).
- Revisione tra pari: stato `draft → in revisione → approvata`, commenti per item.
- Variante semplificata per DSA/BES (font, interlinea, linguaggio, tempo maggiorato indicato).
- Import massivo dei programmi (cartella di file) con report di ciò che non è stato capito.
- Statistiche: copertura del curriculum, topic più usati, tempo medio per item.
- Template di verifica per tipo (compito di recupero, simulazione esame, prova di laboratorio).
- PWA installabile e stampa diretta da tablet.

### 3.3 v2 (non nel primo rilascio)

- Portale anonimo di autovalutazione per studenti (solo se esplicitamente richiesto e con
  valutazione privacy a parte).
- Correzione assistita di elaborati scansionati.
- Integrazione con registro elettronico.

---

## 4. Modello dati (minimo)

Usa migrazioni versionate. Nomi in inglese nel codice, label in italiano nella UI.

```
User(id, email, password_hash, name, role, subjects[], tracks[], created_at, last_login)
Invite(id, email, role, token, expires_at, created_by)

Curriculum(id, track, year, subject, version, status, title, notes, author_id,
           published_at, created_at, updated_at)
Topic(id, curriculum_id, parent_id?, code, name, description, weight_hint,
      difficulty_min, difficulty_max, is_core, order)
LearningObjective(id, topic_id, code, text, prerequisites[], keywords[])

Test(id, title, track, year, subject, class_label, exam_date, duration_min,
     total_points, difficulty_target, calculator_allowed, formula_sheet,
     language_level, status, author_id, curriculum_id, created_at, updated_at,
     grade_scale_id?, ai_model, ai_cost_estimate, parent_test_id?)
Section(id, test_id, title, description, order)
Item(id, test_id, section_id?, type, prompt, options?, correct_option?,
     points, difficulty, estimated_min, topic_id?, objectives[],
     solution_steps[], grading_criteria[], common_errors[], hints[],
     answer_space, figure_spec?, source, is_locked, order, ai_generated,
     variant_group?, created_at, updated_at)
GradeScale(id, name, total_points, sufficiency_threshold, mapping_json, is_default)
Rubric(id, test_id, indicators_json, levels_json, item_mapping_json)
ItemBankEntry(id, item_snapshot_json, visibility, owner_id, rating, tags[],
              usage_count, created_at)
GenerationRun(id, user_id, test_id?, provider, model, prompt_tokens,
              completion_tokens, cost_estimate, status, errors_json, created_at)
Export(id, test_id, format, kind, file_path, engine, engine_version,
       status, log_excerpt, created_at)
AuditLog(id, user_id, action, entity, entity_id, meta_json, created_at)
```

`Item.type` ∈ `multiple_choice | true_false | short_answer | open_answer | exercise |
problem | graph | lab_data | proof`.

`figure_spec` descrive figure geometriche in modo dichiarativo (es.
`{kind:"triangle", vertices:{...}, labels:{...}}`) così possono essere renderizzate in SVG
senza immagini raster.

---

## 5. Flusso di generazione (pipeline)

```
[Wizard] → GenerationRequest (validato)
   → ContextBuilder
        curriculum slice (topic + obiettivi selezionati)
        profilo di stile (track + materia + anno)
        vincoli e formato
        few-shot: 3–6 item approvati pertinenti dalla banca
        regole anti-ripetizione (hash/embedding degli ultimi item usati)
   → LLM call #1 (structured output)
   → Schema validation (Zod/Pydantic)
   → Rule engine (punteggi, tempi, copertura, duplicati, unità)
        ├─ errori bloccanti → repair prompt con lista errori → LLM call #2/#3 (max 2)
        └─ ok → LLM call "critic" (opzionale, configurabile)
                 verifica: solubilità, unicità della soluzione, dati coerenti,
                 difficoltà dichiarata vs reale, linguaggio
   → bozza Test + Item + Rubric
   → editor umano → approvazione → export
```

Registra ogni chiamata in `GenerationRun` con costi e durata. Se il provider non risponde,
mostra un errore chiaro e non perdere i dati inseriti nel wizard (bozza locale).

**Idempotenza:** lo stesso `GenerationRequest` con lo stesso seed deve produrre la stessa
verifica (passa un `seed` al provider quando supportato; altrimenti salvalo nei metadati).

---

## 6. Regole didattiche (importantissime)

### 6.1 Differenza Classico vs Scientifico

Il programma selezionato determina i contenuti; il **profilo di stile** determina la forma.

**Liceo Classico — profilo `classico`**
- Meno calcolo meccanico, più **ragionamento, giustificazione, collegamenti**.
- Preferisci: geometria euclidea con dimostrazioni brevi, proporzioni, probabilità
  descrittiva, funzioni semplici e loro grafici, lettura di testi matematici, storia delle
  idee (solo se nel programma).
- Evita: conti lunghi, parametri multipli, derivate/integrali se non esplicitamente nel
  programma selezionato.
- Domande tipiche: "Spiega perché...", "È vero che...? Motiva", "Trova l'errore nel
  procedimento", "Costruisci un esempio/controesempio".
- Fisica: prevalenza di fenomeni, misure semplici, proporzionalità, rappresentazione grafica;
  calcolo numerico contenuto.

**Liceo Scientifico — profilo `scientifico`**
- Piena padronanza tecnica, problemi **multi-passo**, discussione di parametri.
- Preferisci: algebra, trigonometria, funzioni, limiti/derivate/integrali (se nel programma),
  geometria analitica, probabilità e statistica, fisica con dati sperimentali, grafici,
  vettori, incertezze.
- Domande tipiche: "Determina...", "Discuti al variare di k...", "Verifica che...",
  "Risolvi e commenta il risultato", problemi con più richieste collegate.
- Fisica: legge oraria, conservazione, circuiti, ottica geometrica, errori e cifre
  significative, lettura di tabelle.

### 6.2 Regole di materia

**Matematica**
- Ogni esercizio deve essere risolvibile con gli strumenti del programma selezionato.
- Numeri "puliti" per default (risultati interi o frazioni semplici), salvo richiesta esplicita
  di calcolo con decimali.
- Specifica sempre il dominio quando rilevante; niente notazione ambigua.
- Una sola interpretazione possibile: vieta "trovare" senza dire cosa; indica se serve
  giustificare.
- Soluzioni: passaggi numerati, non solo risultato. Evidenzia i passaggi che assegnano punti.
- Nei quiz a scelta multipla: 4 opzioni, una sola corretta, distrattori plausibili basati su
  errori comuni, nessun "tutte le precedenti".

**Fisica**
- Unità SI sempre indicate; cifre significative coerenti con i dati.
- `g = 9,81 m/s²` salvo diversa indicazione, e dichiaralo nella consegna.
- Dichiara esplicitamente le idealizzazioni ("trascura l'attrito", "conduttori ideali").
- Dati realistici; niente risultati assurdi (auto a 500 m/s, temperature negative impossibili).
- Dove utile: schema del sistema, tabella dati, grafico da interpretare.
- Errori: distingui errori casuali/sistematici, propagazione semplice.

### 6.3 Scala di difficoltà (1–5)

| Livello | Descrizione | Tempo tipico per item |
|---|---|---|
| 1 | riconoscimento, definizione, applicazione diretta | 2–4 min |
| 2 | applicazione standard in un passaggio | 4–6 min |
| 3 | due/tre passaggi, scelta della strategia | 6–10 min |
| 4 | problema articolato, più concetti collegati | 10–15 min |
| 5 | problema aperto, discussione, generalizzazione | 15–25 min |

Il tempo stimato per item deve essere coerente con questa tabella e con la tipologia; la somma
dei tempi stimati deve stare entro ±10% della durata richiesta (il tempo di "copia e riordino"
è incluso).

### 6.4 Punteggi

- Punteggi in punti interi o con decimali `.25`/`.5`.
- Default: quiz 1–2 pt, risposta breve 2–3 pt, esercizio 4–8 pt, problema 10–20 pt,
  dimostrazione 6–10 pt (scalati sul totale).
- Il totale **deve** coincidere con quello richiesto: se non coincide, normalizza
  proporzionalmente e registra l'aggiustamento.
- Ogni item ha criteri di attribuzione del punteggio (es. "2 pt per l'impostazione, 1 pt per
  il calcolo, 1 pt per l'unità di misura").
- Prevedi la possibilità di un bonus facoltativo, esplicitamente marcato e non conteggiato
  nel totale.

---

## 7. Contenuti e stile dei testi generati

- Italiano scolastico corretto, frasi brevi, niente anglicismi inutili.
- Consegne con verbo operativo all'inizio: *Calcola, Determina, Dimostra, Spiega, Rappresenta,
  Confronta, Giustifica*.
- Intestazione di ogni item: numero, punteggio tra parentesi quadre, difficoltà non mostrata
  agli studenti.
- Non usare riferimenti a persone reali, marchi, luoghi identificabili.
- Niente immagini raster: solo SVG generati da specifica dichiarativa.
- Lunghezza: la verifica deve essere **realisticamente completabile** nel tempo richiesto.
  Meglio 5 esercizi fatti bene che 12 impossibili.
- Le soluzioni devono essere **svolte**, non solo "risposta: 42". Includi il ragionamento.
- Includi 2–4 "errori comuni attesi" per item: servono alla griglia e alla correzione.

---

## 8. Interfaccia e UX

- Layout desktop-first ma responsive; utilizzabile da tablet.
- Navigazione: *Dashboard · Nuova verifica · Le mie verifiche · Banca quesiti · Programmi ·
  Impostazioni*.
- Wizard a 7 passi con barra di avanzamento, riepilogo laterale sempre visibile, possibilità
  di tornare indietro senza perdere dati.
- Editor a due colonne: a sinistra struttura/item, a destra anteprima di stampa.
- Stati vuoti utili, messaggi di errore in italiano che spiegano **cosa fare**.
- Accessibilità: contrasto WCAG AA, focus visibile, navigazione da tastiera, `aria-label`,
  rispetto di `prefers-reduced-motion`.
- Tema chiaro di default; tema scuro opzionale.
- Mostra sempre costo/tempo stimato della generazione prima di avviarla.

---

## 9. Stack tecnico richiesto

Preferenza (se non diversamente indicato):

- **Next.js 15+ (App Router) + TypeScript strict**
- **Tailwind CSS + shadcn/ui** (componenti accessibili)
- **PostgreSQL 16 + Prisma** (migrazioni versionate, seed)
- **Auth.js** (Credentials + magic link) con sessioni server-side
- **Vercel AI SDK** con adapter per almeno: OpenAI, Anthropic, Google, e un endpoint
  OpenAI-compatible locale (Ollama/LM Studio) per l'uso offline nella rete scolastica
- **Zod** per schemi e validazione
- **KaTeX** per le formule nell'anteprima web (no MathJax lato client se evitabile)
- **LaTeX (Tectonic o TeX Live)** per generare i `.tex` e compilarli in PDF lato server;
  **Playwright/Chromium** solo come fallback per l'anteprima HTML→PDF
- **Vitest** per unit test, **Playwright** per E2E
- **Docker Compose** (app + postgres + toolchain LaTeX) per il deploy su server scolastico
- **GitHub Actions**: lint, typecheck, test, build, compilazione dei fixture `.tex`

Struttura del repository (monolite, non monorepo se non serve):

```
verifiche-lab/
├─ app/                     # rotte Next.js
│  ├─ (auth)/login/
│  ├─ (app)/dashboard/
│  ├─ (app)/tests/new/      # wizard
│  ├─ (app)/tests/[id]/     # editor + anteprima
│  ├─ (app)/bank/
│  ├─ (app)/curricula/
│  ├─ (app)/settings/
│  └─ api/
├─ components/              # UI riutilizzabile
├─ lib/
│  ├─ ai/                   # provider, prompt, schema, repair, critic
│  ├─ generation/           # rule engine, scoring, time budget
│  ├─ export/               # template LaTeX, compilazione PDF, pacchetto ZIP
│  ├─ curriculum/           # import e normalizzazione
│  ├─ auth/
│  └─ db/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ prompts/                 # prompt versionati (.md/.ts), non hardcoded ovunque
├─ docs/                    # architettura, ADR, guida docenti
├─ examples/                # verifiche demo: .tex, .pdf, .json
├─ tests/
├─ docker-compose.yml
├─ Dockerfile
├─ .env.example
├─ AGENTS.md
└─ README.md
```

Se il deploy è su Vercel + database gestito, documenta la variante; il percorso principale
resta Docker Compose su server della scuola.

---

## 10. Configurazione AI

```env
AI_PROVIDER=openai            # openai | anthropic | google | ollama | custom
AI_MODEL=gpt-4.1-mini
AI_MODEL_CRITIC=              # opzionale, modello più forte per la revisione
AI_API_KEY=
AI_BASE_URL=                  # per endpoint compatibili OpenAI
AI_MAX_COST_PER_GENERATION=0.30   # EUR, blocco preventivo
AI_TIMEOUT_MS=90000

LATEX_ENGINE=tectonic          # tectonic | pdflatex | latexmk
LATEX_TIMEOUT_MS=60000
LATEX_DEFAULT_FONT=            # vuoto = font standard; es. "newtxtext,newtxmath"
INSTITUTE_NAME=
INSTITUTE_LOGO_PATH=
```

- Le chiavi stanno **solo** lato server, mai nel client.
- L'admin può cambiare modello da UI; il modello usato è salvato su `Test.ai_model`.
- Se `AI_MODEL_CRITIC` è vuoto, salta la revisione critica.
- Rate limit per utente (es. 20 generazioni/ora) e quota mensile configurabile.
- Logga token e costo stimato per generazione; mostra il totale mensile in dashboard admin.
- Fallback: se il provider primario fallisce, ritenta una volta; poi errore esplicito.

---

## 11. Sicurezza, privacy, robustezza

- Password con Argon2id; sessioni httpOnly, `SameSite=Lax`, scadenza.
- CSRF protection sulle mutazioni; validazione server-side di **ogni** input (Zod).
- Controllo permessi su ogni query (un docente non vede le verifiche private di un altro).
- Nessun dato personale di studenti. Il campo "classe" è testo libero e opzionale; avvisa di
  non inserire nomi.
- Backup documentato del database; export completo dei dati in JSON.
- Log di audit per azioni sensibili (creazione utenti, pubblicazione curricula, export).
- Sanitizzazione dell'output AI prima del rendering (no HTML arbitrario; markdown ristretto).
- Le formule matematiche passano da KaTeX con `trust: false`.

---

## 12. Qualità e test

- **Unit test**: rule engine (punteggi, tempi, copertura), parser dei programmi, conversione voti.
- **Test di contratto**: lo schema JSON di generazione è stabile; fixture di risposte AI valide
  e non valide.
- **E2E** (Playwright): login → crea curriculum → genera → modifica → esporta `.tex` + `.pdf`.
- **Test di non-regressione sul PDF**: snapshot del testo estratto dal PDF (non pixel-perfect).
- **Test LaTeX**: i fixture in `tests/fixtures/latex/` vengono compilati con `tectonic` in CI;
  il job fallisce se il log contiene `!` o `Error`. Verifica che il PDF contenga i punteggi,
  i titoli delle sezioni e "Pag. 1 di N".
- **Test di escaping**: caratteri `& % $ # _ { } ~ ^ \` e lettere accentate non rompono la
  compilazione.
- Coverage minima 70% su `lib/generation` e `lib/ai`.
- Seed di demo: un curriculum di Matematica per la 1ª Classico e 1ª Scientifico (contenuti
  segnaposto ben strutturati, non programmi ministeriali inventati), 10 item di esempio,
  una verifica completa.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` devono passare.

---

## 13. Git e collaborazione

Il repository deve partire già organizzato:

- `main` protetta; lavora su branch `feat/...`, `fix/...`, `docs/...`.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- `.github/ISSUE_TEMPLATE/user-story.md` e `bug-report.md`.
- `.github/pull_request_template.md` con checklist (test, accessibilità, italiano, nessun
  segreto, migrazione inclusa).
- `.github/workflows/ci.yml`.
- `CHANGELOG.md` con Keep a Changelog.
- `.gitignore` completo (`.env`, `node_modules`, `.next`, `exports/`, `tmp/`, upload); i PDF
  dentro `examples/` invece si versionano di proposito.
- `AGENTS.md` con: come avviare, convenzioni di codice, dove stanno i prompt, regole per non
  rompere il formato JSON, cosa non committare.

Crea anche le issue iniziali (titolo + descrizione + criteri di accettazione) per le milestone
qui sotto, così il lavoro è tracciabile.

---

## 14. Milestone

**M0 — Fondamenta (1–2 giorni)**
Repo, CI, Docker Compose, Prisma, auth, layout, pagina dashboard vuota, `.env.example`,
README con avvio in 5 comandi.

**M1 — Programmi**
CRUD curriculum/topic/obiettivi, versioning, import assistito, UI di revisione, seed demo.

**M2 — Generazione**
Wizard completo, context builder, schema JSON, chiamata AI, rule engine, repair, anteprima
grezza. Test sul rule engine.

**M3 — Editor e stampa**
Editor item, anteprima di stampa, generazione `.tex` (verifica + soluzioni + griglia),
compilazione PDF, conversione voti, export JSON e ZIP. Test: il `.tex` di esempio compila
senza errori in CI.

**M4 — Banca e condivisione**
Salvataggio in banca, ricerca, clonazione, visibilità, approvazione, versioni A/B.

**M5 — Rifinitura**
Accessibilità, performance, gestione errori, documentazione docente (con screenshot),
backup, deploy su server scolastico, test E2E completi.

---

## 15. Criteri di accettazione (verificabili)

1. Da zero a verifica stampabile in **meno di 5 minuti**, senza toccare il codice.
2. Dato un curriculum di 1ª Scientifico e i topic "equazioni di primo grado" + "problemi",
   con 100 punti e 60 minuti, la verifica generata ha **esattamente 100 punti** e tempo
   stimato tra 54 e 66 minuti.
3. Ogni item ha soluzione svolta e criteri di punteggio.
4. La verifica per il Classico sullo stesso topic risulta **visibilmente diversa** nello stile
   (meno calcolo, più giustificazione) e lo si vede nel confronto affiancato.
5. Modificando i punti di un item, il totale si ricalcola e l'app propone come riequilibrare.
6. Il PDF non spezza un esercizio a metà e riporta "Pag. X di Y".
7. Il PDF soluzioni contiene gli stessi numeri della verifica.
8. La griglia calcola il voto in decimi e rispetta la soglia di sufficienza impostata.
9. Un docente non può leggere una verifica privata di un altro (test automatico).
10. Se l'AI restituisce JSON invalido, l'app ripara o mostra un errore comprensibile senza
    perdere i dati del wizard.
11. `docker compose up` su una macchina pulita avvia l'app e il database; il README basta.
12. Tutti i comandi di CI passano su `main`.
13. Il `.tex` scaricato compila **senza errori** con `pdflatex -interaction=nonstopmode`
    (due passate) e con `tectonic`, e il `.pdf` prodotto contiene gli stessi item, punteggi,
    numerazione e "Pag. X di Y" della verifica.
14. Il pacchetto ZIP contiene i sei file attesi (`verifica.tex/.pdf`, `soluzioni.tex/.pdf`,
    `griglia.tex/.pdf`) più `verifica.json` e `README.txt`.
15. Se la compilazione LaTeX fallisce, l'app mostra il log e permette di scaricare il `.tex`
    senza perdere la verifica.

---

## 16. Cosa NON fare

- Non costruire un chatbot libero: il valore è il flusso guidato e la validazione.
- Non inventare programmi ministeriali: usa solo ciò che il dipartimento inserisce.
- Non salvare dati di studenti.
- Non hardcodare chiavi API, prompt o nomi di modelli nel client.
- Non generare immagini raster o usare materiale protetto da copyright.
- Non permettere la pubblicazione di una verifica senza revisione umana.
- Non introdurre dipendenze pesanti non necessarie (niente editor di testo proprietari,
  niente renderer matematici alternativi).
- Non tradurre la UI in inglese "per comodità".
- Non generare il PDF solo da HTML: il percorso principale è `.tex` → PDF, e il `.tex` deve
  restare scaricabile e compilabile a mano.
- Non dichiarare "fatto" ciò che non è testato.

---

## 17. Deliverable finali

1. Repository Git completo e funzionante, con storia di commit sensata.
2. `README.md`: cos'è, screenshot, avvio locale, deploy, configurazione AI, backup,
   compilazione LaTeX.
3. `docs/architettura.md`, `docs/prompt-e-manutenzione.md`, `docs/guida-docenti.md` (in
   italiano, passo-passo, con immagini) e `docs/latex.md` (come personalizzare il template).
4. `AGENTS.md` per gli agenti AI futuri.
5. Seed demo e almeno una verifica completa in `examples/` con **`.tex`, `.pdf` e `.json`**
   per verifica, soluzioni e griglia.
6. Issue e milestone create su GitHub (o file `docs/roadmap.md` se non c'è accesso remoto).
7. Breve relazione finale: cosa è stato fatto, cosa manca, limiti noti, prossimi passi.

---

## Appendice A — Formato JSON di risposta dell'AI (contratto)

```json
{
  "meta": {
    "title": "Verifica di Matematica — Equazioni di primo grado",
    "track": "scientifico",
    "year": 1,
    "subject": "matematica",
    "duration_min": 60,
    "total_points": 100,
    "difficulty_target": 2.5,
    "calculator_allowed": false
  },
  "sections": [
    { "id": "s1", "title": "Quesiti a risposta chiusa", "description": "Una sola risposta corretta." }
  ],
  "items": [
    {
      "id": "i1",
      "section_id": "s1",
      "type": "multiple_choice",
      "prompt": "Quale dei seguenti valori è soluzione dell'equazione $3x-5=7$?",
      "options": ["$x=2$", "$x=3$", "$x=4$", "$x=6$"],
      "correct_option": 2,
      "points": 4,
      "difficulty": 1,
      "estimated_min": 2,
      "topic_code": "EQ1",
      "objectives": ["EQ1.2"],
      "solution_steps": ["$3x=7+5=12$", "$x=12/3=4$"],
      "grading_criteria": ["4 pt risposta corretta", "0 pt risposta errata"],
      "common_errors": ["Errore di segno nel trasporto", "Divisione per 3 non eseguita"],
      "answer_space": "none",
      "is_locked": false
    },
    {
      "id": "i2",
      "section_id": "s2",
      "type": "problem",
      "prompt": "Un rettangolo ha perimetro $34\\,\\mathrm{cm}$ e base che supera l'altezza di $5\\,\\mathrm{cm}$. Determina le dimensioni e l'area.",
      "options": null,
      "correct_option": null,
      "points": 20,
      "difficulty": 3,
      "estimated_min": 12,
      "topic_code": "PROB1",
      "objectives": ["PROB1.1", "PROB1.3"],
      "solution_steps": [
        "Indica con $h$ l'altezza e con $h+5$ la base.",
        "Imposta $2(h+h+5)=34$.",
        "Risolvi: $4h+10=34 \\Rightarrow h=6$.",
        "Base $=11$, area $=66\\,\\mathrm{cm}^2$."
      ],
      "grading_criteria": [
        "4 pt impostazione delle incognite",
        "6 pt equazione corretta",
        "6 pt risoluzione",
        "2 pt area con unità di misura",
        "2 pt commento di coerenza"
      ],
      "common_errors": ["Dimenticare il fattore 2 nel perimetro", "Unità di misura assenti"],
      "answer_space": "lined",
      "is_locked": false
    }
  ],
  "rubric": {
    "indicators": ["Conoscenze", "Abilità procedurali", "Risoluzione di problemi", "Linguaggio e argomentazione"],
    "item_mapping": { "i1": ["Conoscenze"], "i2": ["Abilità procedurali", "Risoluzione di problemi"] },
    "levels": [
      { "level": 1, "label": "Iniziale", "descriptor": "..." },
      { "level": 2, "label": "Base", "descriptor": "..." },
      { "level": 3, "label": "Intermedio", "descriptor": "..." },
      { "level": 4, "label": "Avanzato", "descriptor": "..." }
    ]
  }
}
```

Regole del contratto: nessun campo extra obbligatorio, `points` numerico, `correct_option`
indice 0-based, formule in LaTeX tra `$...$`, testo in italiano, `topic_code` e `objectives`
devono esistere nel curriculum passato nel contesto.

---

## Appendice B — Bozza di system prompt del generatore

```text
Sei un docente esperto di {materia} del {indirizzo}, anno {anno}, in un liceo italiano.
Devi produrre una verifica scolastica in italiano, destinata alla stampa.

VINCOLI OBBLIGATORI
- Usa esclusivamente i topic e gli obiettivi forniti nel CONTESTO. Non introdurre argomenti
  non presenti.
- Punteggio totale: {punti} punti, ripartiti esattamente. Durata: {minuti} minuti.
- Difficoltà media target: {difficolta}/5. Tipologie richieste: {mix}.
- Vincoli didattici: {vincoli}.
- Ogni item deve avere: consegna non ambigua, soluzione svolta, criteri di punteggio,
  errori comuni attesi.
- Formule in LaTeX tra $...$. Unità SI. Numeri realistici.
- Non usare nomi di persone reali, marchi o immagini.
- Rispetta il profilo di stile dell'indirizzo: {profilo_stile}.

CONTESTO
{curriculum_slice}
{esempi_approvati}
{regole_anti_ripetizione}

OUTPUT
Restituisci SOLO un oggetto JSON conforme allo schema fornito. Nessun testo fuori dal JSON.
```

Il profilo di stile va in un file separato e versionato (`prompts/styles/classico.md`,
`prompts/styles/scientifico.md`), così il dipartimento può modificarlo senza toccare il codice.

---

## Appendice C — Esempio di `.tex` generato (riferimento per il template)

Questo è il livello di qualità atteso. Il generatore deve produrre un file simile per ogni
verifica, con i dati reali al posto dei segnaposto.

```latex
% !TEX program = pdflatex
\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[italian]{babel}
\usepackage[a4paper,top=2cm,bottom=2cm,left=2cm,right=2cm,headheight=15pt]{geometry}
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
\usepackage[hidelinks]{hyperref}

\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\small Istituto ______ -- Liceo Scientifico}
\fancyhead[R]{\small Matematica -- 12/11/2026}
\fancyfoot[C]{\small Pag. \thepage\ di \pageref{LastPage}}

\setlength{\parindent}{0pt}
\setlist[enumerate]{itemsep=6pt,topsep=4pt,leftmargin=8mm}

\newcommand{\punti}[1]{\hfill\textbf{[#1~pt]}}
\newcommand{\riga}{\noindent\makebox[\linewidth]{\dotfill}\par\vspace{4mm}}
\newcommand{\rispostarighe}[1]{\par\vspace{2mm}\foreach \i in {1,...,#1}{\riga}}

\begin{document}

\begin{center}
  {\Large\bfseries Verifica di Matematica}\\[2mm]
  {\large Equazioni e problemi di primo grado}\\[4mm]
  \begin{tabular}{@{}ll@{}}
    Indirizzo: & Liceo Scientifico \\
    Classe:    & 1\textsuperscript{a} \quad Data: 12/11/2026 \\
    Tempo:     & 60 minuti \quad Punteggio: 100 \\
  \end{tabular}
\end{center}

\vspace{3mm}
Nome e cognome: \dotfill \hfill Voto: \dotfill
\vspace{2mm}

\hrule
\vspace{4mm}

\section*{Quesiti a risposta chiusa}

\begin{enumerate}[label=\arabic*)]
  \needspace{5\baselineskip}
  \item Quale dei seguenti valori è soluzione dell'equazione $3x-5=7$? \punti{4}
  \begin{enumerate}[label=\Alph*),itemsep=2pt]
    \item $x=2$
    \item $x=3$
    \item $x=4$
    \item $x=6$
  \end{enumerate}
\end{enumerate}

\section*{Problemi}

\begin{enumerate}[label=\arabic*),resume]
  \needspace{14\baselineskip}
  \item Un rettangolo ha perimetro \SI{34}{cm} e la base supera l'altezza di \SI{5}{cm}.
        Determina le dimensioni e l'area del rettangolo. \punti{20}
  \rispostarighe{8}
\end{enumerate}

\end{document}
```

Estratto del file `soluzioni.tex` (stessa numerazione, stessi punteggi):

```latex
\section*{Soluzioni}

\subsection*{Quesito 1}
$3x-5=7 \;\Rightarrow\; 3x=12 \;\Rightarrow\; x=4$.\quad Risposta: \textbf{C}.
\begin{itemize}[leftmargin=6mm]
  \item 4 pt risposta corretta; 0 pt risposta errata.
\end{itemize}

\subsection*{Quesito 2}
Indichiamo con $h$ l'altezza e con $h+5$ la base. Dal perimetro:
\[
  2\bigl(h+(h+5)\bigr)=34 \;\Rightarrow\; 4h+10=34 \;\Rightarrow\; h=6.
\]
Quindi base $=\SI{11}{cm}$, area $=\SI{66}{cm^2}$.
\begin{itemize}[leftmargin=6mm]
  \item 4 pt impostazione delle incognite; 6 pt equazione; 6 pt risoluzione;
        2 pt area con unità; 2 pt commento di coerenza.
\end{itemize}
```

Requisiti impliciti nell'esempio: `\needspace` prima di ogni item, `\punti{}` sempre presente,
numerazione ripresa tra sezioni con `resume`, unità con `siunitx`, nessun carattere speciale
non protetto, nessuna dipendenza da immagini esterne.

---

## 18. Prima di iniziare

1. Proponi in 10 righe l'architettura che intendi adottare e le eventuali deviazioni da questa
   specifica, con motivazione.
2. Elenca le domande bloccanti (massimo 5). Se non ce ne sono, parti.
3. Crea il repository e la struttura, poi procedi milestone per milestone, fermandoti a
   mostrare un risultato funzionante alla fine di ciascuna.
4. Non chiedere conferme per dettagli implementativi minori: scegli l'opzione più semplice e
   documentala in `docs/decisioni.md` (ADR brevi).
