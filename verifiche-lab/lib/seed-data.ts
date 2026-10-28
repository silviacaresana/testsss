/**
 * Dati iniziali dell'app: due programmi dimostrativi (Matematica, 1ª Classico e 1ª Scientifico)
 * e le scale di conversione dei voti. Vengono inseriti automaticamente al primo avvio
 * (vedi lib/bootstrap.ts). I contenuti sono segnaposto dichiarati, NON programmi ministeriali.
 *
 * Per aggiungere altri programmi (anni, Fisica) basta aggiungere un elemento a CURRICULA.
 */

export const DEMO_NOTE = "DEMO-SEED — contenuto segnaposto per la dimostrazione, non è un programma ministeriale.";

export interface ObjectiveSeed {
  code: string;
  text: string;
  keywords?: string[];
}

export interface TopicSeed {
  code: string;
  name: string;
  description: string;
  weightHint: number;
  difficultyMin: number;
  difficultyMax: number;
  objectives: ObjectiveSeed[];
}

export interface CurriculumSeed {
  track: "classico" | "scientifico";
  year: number;
  subject: "matematica" | "fisica";
  title: string;
  notes: string;
  topics: TopicSeed[];
}

const CLASSICO_TOPICS: TopicSeed[] = [
  {
    code: "CLA1.PERC",
    name: "Insiemi numerici e percentuali",
    description: "Ripasso dei numeri naturali, interi e razionali; calcolo percentuale in contesti quotidiani.",
    weightHint: 10,
    difficultyMin: 1,
    difficultyMax: 2,
    objectives: [
      { code: "CLA1.PERC.1", text: "Riconoscere e rappresentare numeri naturali, interi e razionali.", keywords: ["numeri", "razionali"] },
      { code: "CLA1.PERC.2", text: "Calcolare percentuali e applicarle a problemi di sconto e aumento.", keywords: ["percentuali", "sconto"] },
      { code: "CLA1.PERC.3", text: "Passare dalla frazione alla percentuale e viceversa.", keywords: ["frazioni"] },
    ],
  },
  {
    code: "CLA1.EQ",
    name: "Equazioni di primo grado",
    description: "Equazioni lineari a un'incognita, principi di equivalenza e verifica della soluzione.",
    weightHint: 15,
    difficultyMin: 1,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.EQ.1", text: "Riconoscere un'equazione di primo grado e il suo insieme di definizione.", keywords: ["equazioni"] },
      { code: "CLA1.EQ.2", text: "Applicare i principi di equivalenza per isolare l'incognita.", keywords: ["equivalenza"] },
      { code: "CLA1.EQ.3", text: "Verificare la soluzione sostituendola nell'equazione.", keywords: ["verifica"] },
    ],
  },
  {
    code: "CLA1.DIS",
    name: "Disequazioni di primo grado",
    description: "Disequazioni lineari, rappresentazione dell'insieme soluzione e intervalli.",
    weightHint: 10,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.DIS.1", text: "Risolvere disequazioni lineari applicando i principi di equivalenza.", keywords: ["disequazioni"] },
      { code: "CLA1.DIS.2", text: "Rappresentare l'insieme soluzione sulla retta orientata.", keywords: ["intervalli"] },
    ],
  },
  {
    code: "CLA1.POL",
    name: "Polinomi e scomposizioni",
    description: "Operazioni tra polinomi, prodotti notevoli e scomposizione di trinomi.",
    weightHint: 15,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.POL.1", text: "Eseguire addizioni, sottrazioni e moltiplicazioni tra polinomi.", keywords: ["polinomi"] },
      { code: "CLA1.POL.2", text: "Scomporre un trinomio di secondo grado con somma e prodotto.", keywords: ["scomposizione"] },
    ],
  },
  {
    code: "CLA1.GEO",
    name: "Geometria del piano: perimetro e area",
    description: "Figure piane, perimetro, area e applicazioni semplici del teorema di Pitagora.",
    weightHint: 15,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.GEO.1", text: "Calcolare perimetro e area delle principali figure piane.", keywords: ["area", "perimetro"] },
      { code: "CLA1.GEO.2", text: "Applicare il teorema di Pitagora in contesti semplici.", keywords: ["pitagora"] },
    ],
  },
  {
    code: "CLA1.FUN",
    name: "Funzioni e proporzionalità",
    description: "Relazioni funzionali, piano cartesiano e proporzionalità diretta.",
    weightHint: 10,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.FUN.1", text: "Riconoscere una relazione funzionale e rappresentarla nel piano cartesiano.", keywords: ["funzioni"] },
      { code: "CLA1.FUN.2", text: "Interpretare il coefficiente angolare di una retta.", keywords: ["retta"] },
    ],
  },
  {
    code: "CLA1.SIS",
    name: "Sistemi lineari",
    description: "Sistemi di due equazioni in due incognite e loro interpretazione.",
    weightHint: 10,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.SIS.1", text: "Risolvere sistemi lineari con il metodo di sostituzione o di riduzione.", keywords: ["sistemi"] },
      { code: "CLA1.SIS.2", text: "Tradurre un problema in un sistema lineare.", keywords: ["modellizzazione"] },
    ],
  },
  {
    code: "CLA1.PROB",
    name: "Probabilità e statistica descrittiva",
    description: "Probabilità in casi finiti equiprobabili, media e frequenze.",
    weightHint: 15,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "CLA1.PROB.1", text: "Calcolare la probabilità di un evento in casi finiti equiprobabili.", keywords: ["probabilità"] },
      { code: "CLA1.PROB.2", text: "Calcolare media e frequenze di una serie di dati.", keywords: ["media", "statistica"] },
    ],
  },
];

const SCIENTIFICO_TOPICS: TopicSeed[] = [
  {
    code: "SCI1.POL",
    name: "Polinomi e scomposizioni",
    description: "Calcolo letterale, prodotti notevoli e scomposizioni.",
    weightHint: 15,
    difficultyMin: 1,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.POL.1", text: "Eseguire operazioni tra polinomi e riconoscere i prodotti notevoli.", keywords: ["polinomi"] },
      { code: "SCI1.POL.2", text: "Scomporre un trinomio di secondo grado.", keywords: ["scomposizione"] },
    ],
  },
  {
    code: "SCI1.EQ",
    name: "Equazioni di primo grado",
    description: "Equazioni lineari, equazioni equivalenti e verifica.",
    weightHint: 15,
    difficultyMin: 1,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.EQ.1", text: "Riconoscere e risolvere un'equazione lineare.", keywords: ["equazioni"] },
      { code: "SCI1.EQ.2", text: "Verificare la soluzione e motivare i passaggi.", keywords: ["verifica"] },
    ],
  },
  {
    code: "SCI1.DIS",
    name: "Disequazioni di primo grado",
    description: "Disequazioni lineari e rappresentazione delle soluzioni.",
    weightHint: 10,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.DIS.1", text: "Risolvere disequazioni lineari e scrivere l'insieme soluzione.", keywords: ["disequazioni"] },
      { code: "SCI1.DIS.2", text: "Rappresentare intervalli sulla retta orientata.", keywords: ["intervalli"] },
    ],
  },
  {
    code: "SCI1.FUN",
    name: "Funzioni e piano cartesiano",
    description: "Funzioni, rette e lettura di grafici.",
    weightHint: 15,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.FUN.1", text: "Riconoscere una funzione e calcolarne i valori.", keywords: ["funzioni"] },
      { code: "SCI1.FUN.2", text: "Rappresentare una retta nel piano cartesiano.", keywords: ["retta", "grafico"] },
    ],
  },
  {
    code: "SCI1.GEO",
    name: "Geometria euclidea e teorema di Pitagora",
    description: "Triangoli, quadrilateri e applicazioni del teorema di Pitagora.",
    weightHint: 15,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.GEO.1", text: "Calcolare perimetri e aree delle figure piane.", keywords: ["area"] },
      { code: "SCI1.GEO.2", text: "Applicare il teorema di Pitagora e motivare i passaggi.", keywords: ["pitagora"] },
    ],
  },
  {
    code: "SCI1.SIS",
    name: "Sistemi lineari",
    description: "Sistemi di due equazioni in due incognite e modellizzazione.",
    weightHint: 10,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.SIS.1", text: "Risolvere sistemi lineari con metodi algebrici.", keywords: ["sistemi"] },
      { code: "SCI1.SIS.2", text: "Tradurre una situazione reale in un sistema lineare.", keywords: ["modellizzazione"] },
    ],
  },
  {
    code: "SCI1.PERC",
    name: "Numeri e percentuali",
    description: "Numeri razionali, percentuali e proporzioni.",
    weightHint: 10,
    difficultyMin: 1,
    difficultyMax: 2,
    objectives: [
      { code: "SCI1.PERC.1", text: "Calcolare percentuali, sconti e aumenti.", keywords: ["percentuali"] },
      { code: "SCI1.PERC.2", text: "Risolvere proporzioni e problemi di ripartizione.", keywords: ["proporzioni"] },
    ],
  },
  {
    code: "SCI1.PROB",
    name: "Probabilità e statistica",
    description: "Probabilità classica, media e rappresentazione dei dati.",
    weightHint: 10,
    difficultyMin: 2,
    difficultyMax: 3,
    objectives: [
      { code: "SCI1.PROB.1", text: "Calcolare probabilità in esperimenti equiprobabili.", keywords: ["probabilità"] },
      { code: "SCI1.PROB.2", text: "Interpretare media e frequenze di un insieme di dati.", keywords: ["statistica"] },
    ],
  },
];

export const CURRICULA: CurriculumSeed[] = [
  {
    track: "classico",
    year: 1,
    subject: "matematica",
    title: "Matematica — 1ª Liceo Classico (programma dimostrativo)",
    notes: DEMO_NOTE,
    topics: CLASSICO_TOPICS,
  },
  {
    track: "scientifico",
    year: 1,
    subject: "matematica",
    title: "Matematica — 1ª Liceo Scientifico (programma dimostrativo)",
    notes: DEMO_NOTE,
    topics: SCIENTIFICO_TOPICS,
  },
];
