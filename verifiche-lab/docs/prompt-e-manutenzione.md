# Prompt, provider AI e manutenzione

Questa pagina è per chi modifica i prompt, aggiunge un provider o tocca il contratto JSON. Il
principio è: **l'AI produce una bozza strutturata; il codice la valida, la ripara o la scarta.**

## Dove stanno i prompt

```text
prompts/
  generation.md        prompt principale di generazione
  critic.md            revisione critica della bozza
  repair.md            riparazione di JSON/regole non valide
  schema.json          contratto JSON (JSON Schema)
  styles/
    classico.md        profilo di stile per il Liceo Classico
    scientifico.md     profilo di stile per il Liceo Scientifico
```

I file sono letti a runtime da `lib/ai/context.ts` con `fs.readFileSync`. Non vengono importati
nel bundle client: restano lato server. Se un file manca, il codice usa un fallback vuoto e il
prompt risulta incompleto: verificare sempre i log dopo un deploy.

### Segnaposto

| Segnaposto | Valore |
| --- | --- |
| `{{materia}}` | Matematica / Fisica |
| `{{indirizzo}}` | Liceo Classico / Scientifico |
| `{{anno}}` | 1–5 |
| `{{punti}}` | totale punti |
| `{{minuti}}` | durata |
| `{{difficolta}}` | difficoltà target 1–5 |
| `{{mix}}` | tipologie richieste |
| `{{numeroQuesiti}}` | numero item |
| `{{vincoli}}` | opzioni didattiche attive |
| `{{profilo}}` | contenuto di `styles/*.md` |
| `{{contesto}}` | curriculum selezionato |
| `{{esempi}}` | quesiti approvati dalla banca |
| `{{antiRipetizione}}` | consegne recenti da evitare |
| `{{schema}}` | contratto JSON |
| `{{errori}}`, `{{risposta}}` | solo riparazione |

## Contratto JSON

Lo schema è in `prompts/schema.json` e la validazione runtime in `lib/schemas.ts`
(`generatedTestSchema`). Il contratto è **stabile**: se cambia, vanno aggiornati insieme:

1. `prompts/schema.json`;
2. `lib/schemas.ts` (Zod);
3. `prompts/generation.md` e `prompts/repair.md`;
4. `lib/ai/pipeline.ts` (normalizzazione e riparazione);
5. i test di contratto e il seed, se usano il formato.

Campi principali:

```json
{
  "meta": {
    "title": "…",
    "track": "classico | scientifico",
    "year": 1,
    "subject": "matematica | fisica",
    "duration_min": 60,
    "total_points": 100,
    "difficulty_target": 3,
    "calculator_allowed": false
  },
  "sections": [{ "id": "s1", "title": "…", "description": "…" }],
  "items": [
    {
      "id": "i1",
      "section_id": "s1",
      "type": "multiple_choice",
      "prompt": "…",
      "options": ["…", "…", "…", "…"],
      "correct_option": 0,
      "points": 4,
      "difficulty": 1,
      "estimated_min": 2,
      "topic_code": "EQ1",
      "objectives": ["EQ1.1"],
      "solution_steps": ["…"],
      "grading_criteria": ["…"],
      "common_errors": ["…"],
      "hints": [],
      "answer_space": "none",
      "is_locked": false
    }
  ],
  "rubric": {
    "indicators": ["Conoscenze"],
    "item_mapping": { "i1": ["Conoscenze"] },
    "levels": [{ "level": 1, "label": "Iniziale", "descriptor": "…" }]
  }
}
```

Regole non negoziabili:

- `topic_code` deve esistere nel curriculum selezionato;
- ogni `objectives[*]` deve appartenere al topic;
- `solution_steps` e `grading_criteria` non possono essere vuoti;
- i punti sono multipli di `0,25`;
- la somma dei punti è il totale richiesto;
- la somma dei tempi è entro il ±10% della durata;
- la scelta multipla ha quattro opzioni e un indice valido;
- nessun testo fuori dal JSON.

## Pipeline

`lib/ai/pipeline.ts`:

```text
buildGenerationContext → callAi → parseAiJson → generatedTestSchema
  → normalizeGeneratedMeta → applyRules
  → se errori: buildRepairPrompt → callAi → parse/validate → applyRules
  → se ancora errori: GenerationFailedError
  → in ogni caso: fallback deterministico a livello di servizio
```

- `normalizeGeneratedMeta` impone track, anno, materia, punti e durata richiesti, anche se il
  modello li sbaglia.
- La riparazione è limitata (un tentativo) per non bruciare budget.
- Gli errori sono tradotti in messaggi comprensibili; i dati del wizard non vengono cancellati.
- `AiRunLog` conserva provider, modello, token, costo stimato, durata, stato (`ok`, `errore`,
  `riparata`) ed eventuale estratto del prompt se `retainPrompts` è attivo.
- Il costo è stimato con `lib/ai/config.ts`; il budget mensile e il limite per generazione sono
  controllati prima della chiamata.

## Provider

`lib/ai/provider.ts` implementa adapter HTTP diretti:

| Provider | Endpoint / note |
| --- | --- |
| `openai` | Chat Completions, `response_format` JSON quando disponibile |
| `anthropic` | Messages API, system separato |
| `google` | Generative Language API |
| `ollama` | endpoint locale compatibile OpenAI |
| `custom` | qualsiasi endpoint compatibile OpenAI |
| `offline` | nessuna chiamata: `generateDeterministic` |

Per aggiungerne uno:

1. aggiungere il valore in `AI_PROVIDERS` (`lib/ai/config.ts`);
2. implementare il ramo in `callAi` con timeout e messaggi di errore chiari;
3. aggiungere la variabile in `.env.example` e nella pagina admin;
4. testare con una risposta valida, una JSON invalida e un timeout.

La chiave API è letta **solo** da `process.env.AI_API_KEY` lato server. Non va mai inserita nel
client, in un prompt o in un log.

## Modificare i prompt

1. Aprire il file in `prompts/`.
2. Mantenere i segnaposto esistenti e l'istruzione “restituisci solo JSON”.
3. Se si aggiunge un vincolo, aggiungere anche la validazione corrispondente nel rule engine o
   nello schema: un prompt non è una garanzia.
4. Provare con `AI_PROVIDER=offline` (deve continuare a funzionare) e con un provider reale.
5. Verificare che una risposta invalida venga riparata o gestita senza perdita di dati.
6. Aggiornare questo documento e `CHANGELOG.md`.

### Stile Classico vs Scientifico

`styles/classico.md` enfatizza giustificazione, dimostrazione, linguaggio e meno calcolo;
`styles/scientifico.md` enfatizza modellizzazione, calcolo, grafici e problemi. Il profilo è
inserito nel prompt, ma la differenza è anche nel generatore deterministico e nel seed: le due
verifiche demo sono volutamente diverse.

## Test da eseguire dopo una modifica

```bash
npm run lint
npm run typecheck
npm test
npm run examples
npm run latex:check
```

I test esistenti coprono schemi, regole, escaping, parser, permessi e accettazione. Per il
contratto AI aggiungere fixture di risposte valide/invalide in `tests/` e testare `parseAiJson`,
la riparazione e il fallback.

## Costi e limiti

- `AI_MAX_COST_PER_GENERATION` (default 0,30 €) blocca le richieste troppo care.
- `AI_MONTHLY_BUDGET_EUR` (default 30 €) è verificato sul totale del mese.
- `AI_RATE_LIMIT_PER_HOUR` (default 20) limita le generazioni per utente.
- `AI_TIMEOUT_MS` (default 90 000) evita chiamate appese.
- Il costo è una **stima**, non una fattura: il provider può applicare prezzi diversi.

## Cosa non fare

- Non hardcodare chiavi, modelli o prompt nel client.
- Non modificare lo schema senza aggiornare Zod e i template.
- Non fidarsi del JSON del modello: validare sempre.
- Non eliminare il fallback deterministico: è la garanzia di funzionamento offline.
- Non inserire dati personali di studenti nei prompt o negli esempi della banca.
