# Criteri di accettazione — verifica

Data: **26 ottobre 2026**. Comandi eseguiti sul repository, con database demo e Tectonic.

| # | Criterio | Esito | Evidenza |
| --- | --- | --- | --- |
| 1 | Da zero a verifica stampabile in meno di 5 minuti, senza toccare il codice | ⚠️ | Flusso demo predisposto (seed + verifica pronta + export); non cronometrato in questo ambiente. |
| 2 | 100 punti e 54–66 minuti per una verifica 100 pt / 60 min | ✅ | `tests/rule-engine.test.ts`, `tests/acceptance.test.ts`; due demo a 100/60. |
| 3 | Ogni item ha soluzione svolta e criteri | ✅ | `tests/rule-engine.test.ts`, `tests/acceptance.test.ts`, schema Zod. |
| 4 | Classico visibilmente diverso dallo Scientifico | ✅ | Due verifiche demo in `examples/1-classico` e `examples/1-scientifico`; stili in `prompts/styles`. |
| 5 | Modifica punti → ricalcolo e proposta di riequilibrio | ✅ | `POST /api/tests/[id]/rebalance`, pulsante nell'editor, test rule engine. |
| 6 | PDF non spezza un esercizio e riporta `Pag. X di Y` | ✅ | `needspace` nei template; `scripts/check-latex.ts` su tutti i PDF. |
| 7 | Soluzioni con gli stessi numeri della verifica | ✅ | Stesso modello dati e stesso export; `exportSingle`/`exportZip` leggono il DB. |
| 8 | Griglia calcola il voto e rispetta la soglia | ✅ | `tests/grading.test.ts`, `lib/grading.ts`, template griglia. |
| 9 | Un docente non legge una verifica privata di un altro | ✅ | `tests/permissions.test.ts`, `canAccessTest`, `getTestForUser`. |
| 10 | JSON AI invalido: ripara o errore comprensibile senza perdere i dati | ✅ | `parseAiJson`, pipeline di riparazione, fallback deterministico; `tests/ai-contract.test.ts`. |
| 11 | `docker compose up` avvia app e database | ⚠️ | `Dockerfile` e `docker-compose.yml` presenti; Docker non installato nell'ambiente di sviluppo, quindi non eseguito. |
| 12 | Tutti i comandi CI passano | ⚠️ | `.github/workflows/ci.yml` configurato; lint/typecheck/test/build/esempi/latex check eseguiti localmente con esito positivo, workflow non eseguito su GitHub. |
| 13 | `.tex` compila con `pdflatex` e `tectonic`; PDF coerente | ⚠️ | Tectonic verificato su 13 file; pdfLaTeX non installato nell'ambiente, quindi non eseguito qui. |
| 14 | ZIP: 6 file attesi + JSON + README | ✅ | `tests/acceptance.test.ts` e `check-latex.ts`: 8 file. |
| 15 | Compilazione fallita: log + `.tex` scaricabile | ✅ | `ExportError`, `Export.logExcerpt`, pannello Esporta. |

## Comandi e risultati

```bash
npm run lint          # ok
npm run typecheck     # ok
npm test              # 38 test, 8 file (unitari + accettazione)
npm run build         # build di produzione
npm run examples      # 2 cartelle, 7 file ciascuna + ZIP
npm run latex:check   # 13 file verificati
```

### Dettaglio `npm run latex:check`

```text
  OK   examples/1-classico/...griglia....tex
  OK   examples/1-classico/...soluzioni....tex
  OK   examples/1-classico/...verifica....tex
  OK   examples/1-scientifico/...griglia....tex
  OK   examples/1-scientifico/...soluzioni....tex
  OK   examples/1-scientifico/...verifica....tex
  OK   examples/1-classico/...griglia....pdf
  OK   examples/1-classico/...soluzioni....pdf
  OK   examples/1-classico/...verifica....pdf
  OK   examples/1-scientifico/...griglia....pdf
  OK   examples/1-scientifico/...soluzioni....pdf
  OK   examples/1-scientifico/...verifica....pdf
  OK   examples/1-scientifico/...zip

Tutti i controlli superati: 13 file verificati.
```

Il controllo verifica:

- compilazione autonoma di ogni `.tex`;
- assenza di `!`, `LaTeX Error`, `Emergency stop` nel log;
- `Pag. 1 di N` … `Pag. N di N` su tutte le pagine;
- assenza di `??` (LastPage non risolto);
- presenza di `100` e dell'etichetta del punteggio;
- ZIP con 3 `.tex`, 3 `.pdf`, 1 `.json`, `README.txt` (8 file).

### Test

```text
tests/rule-engine.test.ts      5
tests/grading.test.ts          6
tests/schemas.test.ts          4
tests/curriculum-import.test.ts 3
tests/latex-escape.test.ts     5
tests/permissions.test.ts      8
tests/ai-contract.test.ts      5
tests/acceptance.test.ts       2
```

I test di accettazione usano il database demo:

- due verifiche, una Classico e una Scientifico;
- 100 punti esatti e 60 minuti;
- soluzioni e criteri presenti su ogni item;
- export ZIP reale con 8 file;
- estrazione PDF con `pdfjs-dist` e verifica di `Pag. 1 di N` e `100`.

## Verifiche manuali consigliate prima del rilascio

1. `npm run db:reset && npm run dev`.
2. Login con `docente@verifichelab.local` / `Docente1234!`.
3. Aprire una verifica demo, modificare un punto, usare **Riequilibra**, approvare.
4. Esportare PDF e ZIP; aprire i PDF e controllare numerazione, punteggi e griglia.
5. Creare una nuova verifica dal wizard con `AI_PROVIDER=offline`.
6. Con un secondo account, verificare che la verifica privata non sia accessibile.
7. Con `LATEX_ENGINE=nessuno` (o senza binario), verificare che il `.tex` resti scaricabile e il
   messaggio d'errore sia comprensibile.

## Limiti della verifica automatica

- Il non-spezzamento dei quesiti è garantito dal template `needspace` e verificato a campione
  sui PDF demo, non con un test semantico su ogni pagina.
- La qualità disciplinare delle soluzioni è responsabilità del docente: i test verificano la
  presenza e la struttura, non la correttezza matematica di ogni contenuto generato.
- L'accessibilità non è certificata WCAG: sono applicate le buone pratiche di base.
- La copertura dei test non è ancora misurata con una soglia automatica.
