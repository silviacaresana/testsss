# Verifiche (versione leggera per Cloudflare)

Sito per creare verifiche, salvarle in un database e scaricarle. **Niente password, niente account** nell'app:
l'accesso lo regola Cloudflare Access (vedi «Proteggere il sito»).

- Backend: un Cloudflare Worker (`src/worker.js`) + database **D1** (SQLite).
- Interfaccia: HTML/JS semplice in `public/`, nessuna libreria, nessuna build.
- Nessuna dipendenza npm per l'app (solo `wrangler` per pubblicarla).
- **Nessun PDF generato dal server.** Si scaricano: `.tex` (+ soluzioni), `.docx` (+ soluzioni), `.json` e uno ZIP con tutto.
  Il PDF si ottiene compilando il `.tex` (pdflatex o Overleaf) oppure esportando dal `.docx`.

## Cosa si può fare

- Elenco delle verifiche salvate, duplicare, eliminare, importare un `.json`.
- Nuova verifica **vuota** oppure **bozza automatica** (materia, indirizzo, anno, argomenti, numero di quesiti): gli esercizi
  vengono costruiti con numeri casuali da modelli interni (derivate, integrali, limiti, equazioni, moto, ecc.). Per argomenti
  non riconosciuti inserisce una domanda generica da riscrivere. Nessuna AI, nessuna chiamata esterna.
- Editor: scelta multipla, vero/falso, domanda aperta, esercizio; punti, soluzioni, errori frequenti, riordino, ridistribuzione dei punti.
- Salvataggio con controllo di concorrenza: se due schede modificano la stessa verifica, la seconda riceve un avviso
  e sceglie se caricare la versione salvata o sovrascriverla.

## Provarlo sul proprio computer

Serve Node 22.13 o successivo.

```bash
cd verifiche-cloudflare
npm run dev        # http://127.0.0.1:8787
npm test           # 23 test
```

Il server locale esegue lo stesso codice del Worker con un database SQLite in `dev/local.db` (si può cancellare).
Il sito in locale è aperto (`ALLOW_PUBLIC=true`) perché non c'è Cloudflare Access.

## Pubblicarlo su Cloudflare

```bash
npm install
npx wrangler login
# (database già creato: salta questo passaggio)
# (schema già applicato: salta questo passaggio)
npm run deploy
```

Poi **proteggi il sito** (sotto). Finché `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` sono vuoti, il Worker risponde 503 e non
mostra nulla: è voluto, per non lasciare per sbaglio le verifiche aperte a tutti.

## Proteggere il sito

Cloudflare Zero Trust → Access → Applications → *Add an application* → *Self-hosted*:

1. Dominio: quello del Worker (es. `verifiche.tuonome.workers.dev` o un tuo dominio).
2. Policy *Allow*: scegli chi entra (es. email dei docenti o `@tuascuola.it`, con codice via email).
3. Copia dall'applicazione l'**Application Audience (AUD) tag** e dalla dashboard il **team domain** (`xxx.cloudflareaccess.com`).
4. Inseriscili in `wrangler.jsonc` (`ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`) e ripubblica con `npm run deploy`.

Il Worker controlla comunque la firma del token di Access su ogni richiesta (pagine e API), quindi anche chi raggiungesse
direttamente l'indirizzo `workers.dev` senza passare da Access viene respinto. Disattiva `workers.dev` e le anteprime
se usi un dominio tuo.

> Le verifiche sono visibili **a tutte le persone ammesse da Access**: non c'è separazione per utente.

## Come è fatto

| Cartella | Contenuto |
|---|---|
| `src/worker.js` | routing, API JSON, esportazioni |
| `src/lib/` | validazione, store D1, LaTeX, DOCX, ZIP, verifica token Access, generatore di bozze |
| `public/` | interfaccia (`index.html`, `app.js`, `style.css`) |
| `migrations/` | schema D1 |
| `dev/` | server locale e finto D1 per i test |
| `test/` | test con `node --test` |

Ogni verifica è **una sola riga** in D1 (contenuto in JSON) con un numero di `revision`: il salvataggio è un singolo
`UPDATE … WHERE revision = ?`, quindi non servono transazioni (D1 non le supporta in modo affidabile).

API: `GET/POST /api/tests`, `GET/PUT/DELETE /api/tests/:id`, `POST /api/tests/:id/duplicate`,
`GET /api/tests/:id/export?format=tex|tex-soluzioni|docx|docx-soluzioni|json|zip`, `POST /api/draft`, `POST /api/rescale`.

## Limiti noti

- Le formule vanno scritte in LaTeX tra `$…$`; nell'editor non c'è anteprima grafica. Nel `.docx` diventano testo con simboli Unicode.
- Il `.tex` usa `babel` italiano: serve il pacchetto italiano nella distribuzione TeX (Overleaf lo ha).
- Non verificato su Cloudflare reale (nessun accesso da qui): il codice gira su Node con un D1 simulato; la prima
  pubblicazione va controllata.
