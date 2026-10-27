# Esempi di esportazione

Questi file sono stati generati da VerificheLab il 26/10/2026 con il database dimostrativo
e l'istituto «Liceo Statale di Esempio». Sono versionati di proposito: servono come prova che i sorgenti
`.tex` compilano da soli e che i PDF contengono i punteggi, le sezioni e il piè di pagina «Pag. X di Y».

Ogni cartella contiene:

- `verifica-*.tex` e `.pdf`: consegna per gli studenti;
- `soluzioni-*.tex` e `.pdf`: soluzioni svolte e criteri;
- `griglia-*.tex` e `.pdf`: indicatori, descrittori, mappatura e conversione in decimi;
- `verifica-*.json`: dati strutturati della verifica.

Per ricompilare a mano (senza dipendenze esterne oltre al motore LaTeX):

```bash
tectonic "verifica-matematica-1-scientifico-....tex"
```

oppure, con due passate:

```bash
pdflatex -interaction=nonstopmode "verifica-matematica-1-scientifico-....tex"
pdflatex -interaction=nonstopmode "verifica-matematica-1-scientifico-....tex"
```

Per rigenerare tutto: `npm run db:seed && npm run examples`.

## Contenuto

### Verifica dimostrativa — Equazioni e geometria (1ª Classico)

Indirizzo: classico; quesiti: 8; punti: 100; tempo: 60 min.

- `verifica-matematica-1-classico-2026-11-12-verifica-dimostrativa-equazioni-e-geometria-1-cl-vA.tex`
- `verifica-matematica-1-classico-2026-11-12-verifica-dimostrativa-equazioni-e-geometria-1-cl-vA.pdf`
- `soluzioni-matematica-1-classico-2026-11-12-verifica-dimostrativa-equazioni-e-geometria-1-cl-vA.tex`
- `soluzioni-matematica-1-classico-2026-11-12-verifica-dimostrativa-equazioni-e-geometria-1-cl-vA.pdf`
- `griglia-matematica-1-classico-2026-11-12-verifica-dimostrativa-equazioni-e-geometria-1-cl-vA.tex`
- `griglia-matematica-1-classico-2026-11-12-verifica-dimostrativa-equazioni-e-geometria-1-cl-vA.pdf`
- `verifica-matematica-1-classico-2026-11-12-verifica-dimostrativa-equazioni-e-geometria-1-cl-vA.json`

### Verifica dimostrativa — Funzioni e problemi (1ª Scientifico)

Indirizzo: scientifico; quesiti: 8; punti: 100; tempo: 60 min.

- `verifica-matematica-1-scientifico-2026-11-12-verifica-dimostrativa-funzioni-e-problemi-1-scie-vA.tex`
- `verifica-matematica-1-scientifico-2026-11-12-verifica-dimostrativa-funzioni-e-problemi-1-scie-vA.pdf`
- `soluzioni-matematica-1-scientifico-2026-11-12-verifica-dimostrativa-funzioni-e-problemi-1-scie-vA.tex`
- `soluzioni-matematica-1-scientifico-2026-11-12-verifica-dimostrativa-funzioni-e-problemi-1-scie-vA.pdf`
- `griglia-matematica-1-scientifico-2026-11-12-verifica-dimostrativa-funzioni-e-problemi-1-scie-vA.tex`
- `griglia-matematica-1-scientifico-2026-11-12-verifica-dimostrativa-funzioni-e-problemi-1-scie-vA.pdf`
- `verifica-matematica-1-scientifico-2026-11-12-verifica-dimostrativa-funzioni-e-problemi-1-scie-vA.json`
- `verifica-matematica-1-scientifico-2026-11-12-verifica-dimostrativa-funzioni-e-problemi-1-scie-vA.zip` (pacchetto completo)

I contenuti dei programmi sono segnaposto didattici dichiarati, non programmi ministeriali.
Nessun dato di studentesse o studenti è presente negli esempi.
