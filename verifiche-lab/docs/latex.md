# LaTeX: template, compilazione e personalizzazione

Il percorso di stampa è **`.tex` → PDF**. I PDF non sono generati da HTML. Ogni esportazione
produce tre sorgenti autonomi:

| File | Contenuto |
| --- | --- |
| `verifica-*.tex` | consegna per gli studenti: intestazione, sezioni, quesiti, spazi risposta |
| `soluzioni-*.tex` | soluzioni svolte, passaggi, criteri di punteggio, errori comuni |
| `griglia-*.tex` | indicatori, descrittori, mappatura quesiti, punteggi, conversione in decimi |

I tre file includono preamble, macro e header: non servono file di supporto, immagini esterne o
`\input` aggiuntivi.

## Compilare a mano

Con Tectonic (consigliato):

```bash
tectonic "verifica-matematica-1-scientifico-....tex"
```

Con pdfLaTeX (due passate, indispensabile per `lastpage`):

```bash
pdflatex -interaction=nonstopmode "verifica-matematica-1-scientifico-....tex"
pdflatex -interaction=nonstopmode "verifica-matematica-1-scientifico-....tex"
```

Con `latexmk`:

```bash
latexmk -pdf -interaction=nonstopmode "verifica-matematica-1-scientifico-....tex"
```

Il PDF deve riportare `Pag. 1 di N`, `Pag. 2 di N`, … su **ogni** pagina. Il totale è calcolato da
`lastpage`, per questo serve la seconda passata con pdfLaTeX.

## Pacchetti richiesti

Il preamble usa:

```text
inputenc, fontenc, babel[italian], geometry, amsmath, amssymb, graphicx,
tikz, pgffor, enumitem, fancyhdr, lastpage, booktabs, longtable, siunitx,
xcolor, needspace, array, textcomp, pdflscape, hyperref
```

Su Debian/Ubuntu l'immagine Docker installa:

```bash
texlive-latex-base texlive-latex-recommended texlive-latex-extra \
texlive-pictures texlive-science texlive-fonts-recommended
```

Con Tectonic i pacchetti vengono scaricati al primo utilizzo e messi in cache.

## Dove stanno i template

```text
lib/export/latex/
  preamble.tex            documento, pacchetti, impostazioni pagina
  macros.tex              comandi condivisi (punteggi, intestazioni, spazi)
  header.tex.tmpl         intestazione di istituto, materia, classe, data
  main.tex.tmpl           documento “verifica”
  solutions.tex.tmpl      documento “soluzioni”
  rubric.tex.tmpl         documento “griglia”
  item-*.tex.tmpl         un partial per tipo di quesito
  solution-item.tex.tmpl  blocco soluzione + criteri
```

`lib/export/latex/index.ts` carica i template con Eta e produce i tre sorgenti. Il modello dati
intermedio è in `lib/export/model.ts`: è lì che si decidono intestazione, sezioni, punteggi,
descrittori e conversione in decimi.

## Il modello di esportazione

```text
Test
 ├─ Section[]  → titolo, descrizione, ordine
 ├─ Item[]     → tipo, testo, opzioni, punti, difficoltà, soluzione, criteri
 ├─ Rubric     → indicatori, livelli, mappatura
 └─ GradeScale → soglia, mappatura lineare o a scaglioni
        ↓
buildExportModel() → ExportModel → template Eta → .tex
```

Ogni tipo di quesito ha un partial:

| Tipo | File |
| --- | --- |
| `multiple_choice` | `item-multiple-choice.tex.tmpl` |
| `true_false` | `item-true-false.tex.tmpl` |
| `short_answer` | `item-short-answer.tex.tmpl` |
| `open_answer` | `item-open-answer.tex.tmpl` |
| `exercise` | `item-exercise.tex.tmpl` |
| `problem` | `item-problem.tex.tmpl` |
| `graph` | `item-graph.tex.tmpl` |
| `lab_data` | `item-lab-data.tex.tmpl` |
| `proof` | `item-proof.tex.tmpl` |

Se un tipo non ha partial, si usa `item-open-answer.tex.tmpl`.

## Personalizzare l'aspetto

1. **Intestazione di istituto** — `header.tex.tmpl` e le impostazioni in
   `/amministrazione/impostazioni` (`institute.name`, `institute.logoPath`). Il logo deve essere
   un file locale raggiungibile dal server; viene passato alla compilazione come file aggiuntivo.
2. **Margini e font** — `preamble.tex` (`geometry`, `\documentclass[11pt,a4paper]{article}`).
3. **Piè di pagina** — `macros.tex`: il comando usa `\pageref{LastPage}`. Non rimuovere
   `lastpage`.
4. **Spazi risposta** — `answerLinesFor` in `escape.ts` e i partial `item-*.tex.tmpl`.
5. **Griglia e voti** — `rubric.tex.tmpl`; la conversione è calcolata in `lib/grading.ts`, non nel
   template.
6. **Nome file** — `buildFileName` in `lib/export/model.ts`.

Dopo ogni modifica:

```bash
npm run examples       # rigenera i sei documenti + ZIP
npm run latex:check    # ricompila ogni .tex e valida PDF/ZIP
npm test               # test di escaping e accettazione
```

## Escape e matematica

`escapeLatexText` gestisce i caratteri speciali **fuori** dalla matematica:

```text
\ & % $ # _ { } ~ ^
```

e converte alcuni caratteri tipografici (`°`, `²`, `³`, `µ`, `×`, `÷`, `−`, `≤`, `≥`, `→`, `μ`,
`π`, `√`). I segmenti matematici `$...$`, `$$...$$` e `\(...\)` sono preservati.

Regole pratiche per chi scrive i testi:

- Usare `$...$` per le formule, non testo Unicode sparso.
- Non inserire comandi LaTeX personalizzati nel testo del quesito: non sono garantiti.
- Per le unità di misura usare `\,\mathrm{cm}`, `\,\mathrm{m/s}` o `\si{}` se si vuole.
- Le lettere accentate sono supportate da `utf8` + `T1`.
- I comandi generati internamente (grado, apice, simboli) sono protetti da token e non vengono
  doppiamente escapati.

## Errori frequenti

| Sintomo | Causa | Rimedio |
| --- | --- | --- |
| `! Undefined control sequence` | comando non definito nel preamble | usare solo comandi standard o aggiungerlo a `macros.tex` |
| `??` al posto del totale pagine | manca la seconda passata | due passate pdfLaTeX o `tectonic` |
| PDF assente, `.tex` presente | motore non installato o errore | leggere `Export.logExcerpt`, installare Tectonic/pdfLaTeX |
| Quesito spezzato | `needspace` insufficiente | aumentare lo spazio stimato o ridurre il testo |
| Carattere `&` non compilato | testo non passato dall'escape | correggere il testo o il partial |
| Logo mancante | path non raggiungibile | impostare `INSTITUTE_LOGO_PATH` o `institute.logoPath` |

Il log completo dell'ultimo errore è mostrato nel pannello **Esporta** e salvato in `Export`.
Il `.tex` resta scaricabile: è possibile correggerlo a mano e compilarlo fuori dall'app.

## Verifica automatica

`scripts/check-latex.ts`:

1. ricompila ogni `.tex` in una cartella temporanea;
2. controlla che il log non contenga `!`, `LaTeX Error`, `Emergency stop`;
3. estrae il testo dai PDF con `pdfjs-dist`;
4. verifica `Pag. X di Y` su tutte le pagine, il totale e l'assenza di `??`;
5. verifica la presenza di `100` e dell'etichetta del punteggio;
6. apre lo ZIP e controlla gli otto file attesi.

```bash
npm run examples && npm run latex:check
```

L'output atteso termina con:

```text
Tutti i controlli superati: 13 file verificati.
```
