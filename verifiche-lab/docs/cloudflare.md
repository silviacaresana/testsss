# VerificheLab su Cloudflare

Questa versione dell'app (branch `semplice`) gira interamente su Cloudflare:

- **Cloudflare Workers** esegue il sito (Next.js tramite OpenNext);
- **Cloudflare D1** (SQLite gestito) conserva le verifiche;
- **Cloudflare Access** decide chi può entrare. L'app non ha account né password.

> **Stato: non ancora collaudata.** Il codice è stato adattato senza poter installare le dipendenze né
> eseguire build, test o deploy. Il primo `npm run preview` potrebbe richiedere piccoli ritocchi. Vedi
> «Limiti e punti da verificare» in fondo.

## Cosa fa e cosa no

| C'è | Non c'è più |
| --- | --- |
| Wizard in sette passaggi e generazione della bozza (generatore locale) | Account, password, inviti, amministrazione |
| Editor dei quesiti, rigenerazione, riequilibrio punti | Gestione dei programmi (due programmi dimostrativi fissi) |
| Soluzioni, griglia di valutazione, voti, varianti A–D | Banca quesiti |
| Versioni ripristinabili, archivio nel database | PDF generati dal server |
| Download di `.tex`, ZIP e JSON | Provider AI configurabile da interfaccia |

I PDF si ottengono dalla scheda **Anteprima → Stampa / Salva come PDF** (usa il browser), oppure compilando
il `.tex` con Overleaf, pdfLaTeX o Tectonic.

## Prima installazione

Servono Node 20 o superiore e un account Cloudflare. Il piano Workers gratuito ha un limite di dimensione del
pacchetto (3 MB) e di tempo CPU che questa app potrebbe superare: se `deploy` lo segnala, serve il piano
Workers a pagamento.

```bash
cd verifiche-lab

# 1. dipendenze (genera package-lock.json: committalo)
npm install

# 2. accesso a Cloudflare
npx wrangler login

# 3. database D1
npx wrangler d1 create verifichelab
```

L'ultimo comando stampa un `database_id`. Incollalo in `wrangler.jsonc` al posto di
`INSERISCI-QUI-L-ID-DEL-DATABASE`.

```bash
# 4. genera lo schema SQL da prisma/schema.prisma (crea migrations/0001_init.sql)
npm run db:sql

# 5. crea le tabelle: prima in locale, poi su Cloudflare
npm run db:local
npm run db:remote

# 6. prova in locale nel runtime dei Workers
npm run preview

# 7. pubblica
npm run deploy
```

Al primo accesso l'app inserisce da sola l'utente condiviso, le scale di voto e i due programmi dimostrativi
(vedi `lib/bootstrap.ts` e `lib/seed-data.ts`).

`npm run dev` avvia il sito con `next dev`; i comandi `db:local` creano il database D1 locale in `.wrangler/`.

## Proteggere il sito con Cloudflare Access

Senza protezione **chiunque conosca l'indirizzo può vedere, modificare e cancellare tutte le verifiche**.
Dopo il primo `deploy`:

1. Dashboard Cloudflare → **Zero Trust** → **Access** → **Applications** → **Add an application** →
   **Self-hosted**.
2. Come dominio indica l'indirizzo del Worker (`verifichelab.<tuo-account>.workers.dev`) oppure il tuo
   dominio personalizzato.
3. Crea una **policy** di tipo *Allow* e inserisci le email dei docenti autorizzati (oppure un dominio di posta
   scolastico). Il metodo di accesso più semplice è il codice monouso inviato per email.
4. Salva. Da ora Cloudflare chiede l'accesso prima di far arrivare qualsiasi richiesta all'app.

Zero Trust è gratuito fino a 50 utenti. Importante: Access protegge l'indirizzo che indichi; se il Worker resta
raggiungibile anche da un altro indirizzo (ad esempio `workers.dev` insieme al dominio personalizzato),
proteggi o disattiva anche quello.

## Dove stanno i dati

- Verifiche, quesiti, versioni, griglie: tabelle D1 `Test`, `Section`, `Item`, `TestVersion`, `Rubric`, …
- Per un backup: `npx wrangler d1 export verifichelab --remote --output backup.sql`.
- Il JSON scaricabile da ogni verifica è una copia portabile dei contenuti.

## Aggiungere programmi (anni, Fisica)

Aprire `lib/seed-data.ts`, aggiungere un elemento a `CURRICULA` (stessa forma dei due esistenti) e
ripubblicare. I programmi nuovi vengono inseriti al primo accesso dopo il deploy, senza toccare quelli già
presenti. I contenuti attuali sono segnaposto, **non** programmi ministeriali.

## Limiti e punti da verificare

- **Transazioni.** D1 non supporta le transazioni e, secondo la documentazione di Prisma, con l'adattatore D1
  quelle richieste dal codice vengono «ignorate ed eseguite come singole query»: non danno errore, ma non c'è
  il tutto-o-niente. Per questo il codice **non usa più `$transaction`**; le operazioni che scrivono più
  righe sono scritte in modo che un errore a metà non faccia danni:
  - *creazione e duplicazione di una verifica*: se un passaggio fallisce, la verifica appena creata viene
    eliminata (sezioni, quesiti e griglia vanno via a cascata);
  - *ripristino di una versione*: prima si salva lo stato attuale come versione «Prima del ripristino», poi si
    ripristina; se fallisce a metà basta riprovare, e il contenuto di prima non è perso;
  - *modifica, rigenerazione, duplicazione, eliminazione di un quesito e griglia di valutazione*: prima si
    imposta lo stato «bozza», poi si fa la modifica, così non resta mai una verifica «approvata» con
    contenuto cambiato;
  - *riordino e riequilibrio dei punti*: aggiornamenti uno alla volta; se uno fallisce il totale o l'ordine non
    tornano e l'operazione si ripete.

  Un errore a metà può ancora lasciare piccole incoerenze (per esempio un buco nella numerazione dei quesiti),
  mai la perdita di una verifica. Non è stato provato: serve un collaudo reale su D1. Per un'atomicità vera si
  possono usare i `batch` di D1 con SQL scritto a mano.
- **Codice rimosso.** Le funzioni di creazione, modifica e pubblicazione dei programmi, quelle delle scale di
  voto e quelle della banca quesiti sono state eliminate: nessuna pagina o API le chiamava più e usavano
  transazioni.
- **Template LaTeX.** I Workers non permettono di compilare codice da stringhe, quindi i template Eta vengono
  precompilati da `scripts/embed-assets.mjs` (lanciato da `npm run dev/build/test`). Lo script usa
  `eta.compileToString`: se la versione di Eta installata lo espone diversamente, va adattato.
- **Client Prisma.** `prisma/schema.prisma` usa `engineType = "client"` (Prisma 6.16 o successivo). Se
  `prisma generate` rifiuta l'opzione, serve la versione più recente di Prisma 6.
- **Dimensione del pacchetto.** Next.js + Prisma + KaTeX potrebbero superare il limite del piano gratuito.
- **Condivisione.** Tutti gli utenti autorizzati da Access vedono e modificano lo stesso archivio: non c'è
  distinzione tra autori.
- **AI.** Il generatore usato è quello locale (deterministico). I provider AI sono ancora nel codice ma senza
  interfaccia di configurazione; non attivarli finché il sito non è protetto, perché la chiave consumerebbe
  credito a chiunque entri.
