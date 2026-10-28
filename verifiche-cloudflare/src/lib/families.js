// Famiglie di esercizi per la bozza automatica offline.
// Derivato da verifiche-lab/lib/generation/deterministic.ts (tipi TypeScript rimossi).
// Nessuna dipendenza: usa solo funzioni definite qui.

                
                         
                       
                         
                       
                 
                  
                   
                        
                                          
                                                          
 

function mulberry32(seed        ) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

                        

function int(rng     , min        , max        )         {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick   (rng     , values              )    {
  return values[Math.floor(rng() * values.length)];
}

function shuffle   (rng     , values     )      {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function dec(n        )         {
  const rounded = Math.round(n * 100) / 100;
  return String(rounded).replace(".", "{,}");
}

function texNum(n        )         {
  return Number.isInteger(n) ? String(n) : dec(n);
}

const MATH_FAMILIES                                                                                = [
  {
    name: "equazioni",
    match: /equazion|incognit|primo grado|bilanciament/i,
    build: (rng, variant) => {
      const a = pick(rng, [2, 3, 4, 5]);
      const x = int(rng, 2, 9);
      const b = int(rng, 1, 9) * (rng() > 0.5 ? 1 : -1);
      const c = a * x + b;
      const sign = b >= 0 ? "+" : "-";
      const prompt = `Risolvi l'equazione $${a}x ${sign} ${Math.abs(b)} = ${c}$.`;
      const equation = `$${a}x ${sign} ${Math.abs(b)} = ${c}$`;
      const steps = [
        `Isola il termine con l'incognita: $${a}x = ${c} ${b >= 0 ? "-" : "+"} ${Math.abs(b)} = ${c - b}$.`,
        `Dividi entrambi i membri per $${a}$: $x = \\dfrac{${c - b}}{${a}} = ${x}$.`,
        `Verifica: $${a}\\cdot ${x} ${sign} ${Math.abs(b)} = ${c}$, quindi la soluzione è corretta.`,
      ];
      const promptVariants = [
        prompt,
        `Determina la soluzione dell'equazione ${equation}, motivando i passaggi.`,
        `Trova il valore di $x$ che rende vera l'uguaglianza ${equation}.`,
      ];
      return {
        exercisePrompt: promptVariants[variant % promptVariants.length],
        problemPrompt: `In un gioco, il punteggio finale si ottiene moltiplicando per ${a} il numero di risposte corrette e ${
          b >= 0 ? `aggiungendo ${Math.abs(b)} punti` : `togliendo ${Math.abs(b)} punti`
        }. Il punteggio finale è ${c}. Quante risposte corrette sono state date?`,
        result: `$x = ${x}$`,
        steps,
        errors: [
          "Errore di segno nel trasporto di un termine",
          "Divisione non eseguita per il coefficiente dell'incognita",
          "Verifica non effettuata",
        ],
        distractors: [`$x = ${x + 1}$`, `$x = ${x - 1}$`, `$x = ${-x}$`],
      };
    },
  },
  {
    name: "disequazioni",
    match: /disequazion|intervall|disuguaglianz/i,
    build: (rng) => {
      const a = pick(rng, [2, 3, 4]);
      const b = int(rng, 1, 8);
      const x = int(rng, 2, 8);
      const c = a * x + b;
      const steps = [
        `Porta i termini noti a destra: $${a}x < ${c} - ${b} = ${c - b}$.`,
        `Dividi per $${a}$ (positivo, il verso non cambia): $x < ${x}$.`,
        `L'insieme delle soluzioni è $x < ${x}$.`,
      ];
      return {
        exercisePrompt: `Risolvi la disequazione $${a}x + ${b} < ${c}$.`,
        graphPrompt: `Rappresenta sulla retta orientata l'insieme delle soluzioni della disequazione $${a}x + ${b} < ${c}$.`,
        result: `$x < ${x}$`,
        steps,
        errors: ["Invertire il verso senza dividere per un numero negativo", "Non escludere il valore al confine"],
        distractors: [`$x > ${x}$`, `$x \\le ${x}$`, `$x = ${x}$`],
      };
    },
  },
  {
    name: "sistemi",
    match: /sistem|due equazion|cramer|sostituzion/i,
    build: (rng) => {
      const x = int(rng, 1, 8);
      const y = int(rng, 1, 8);
      const sum = x + y;
      const diff = x - y;
      const steps = [
        `Somma le due equazioni: $2x = ${sum + diff}$, da cui $x = ${x}$.`,
        `Sostituisci $x = ${x}$ nella prima equazione: $${x} + y = ${sum}$, quindi $y = ${y}$.`,
        `Verifica nella seconda equazione: $${x} - ${y} = ${diff}$.`,
      ];
      return {
        exercisePrompt: `Risolvi il sistema $\\begin{cases} x + y = ${sum} \\\\ x - y = ${diff} \\end{cases}$.`,
        problemPrompt: `La somma di due numeri è ${sum} e la loro differenza è ${diff}. Determina i due numeri.`,
        result: `$x = ${x},\\; y = ${y}$`,
        steps,
        errors: ["Sostituire il valore nella equazione sbagliata", "Perdere il segno nella sottrazione"],
        distractors: [`$x = ${y},\\; y = ${x}$`, `$x = ${x + 1},\\; y = ${y - 1}$`, `$x = ${sum},\\; y = ${diff}$`],
      };
    },
  },
  {
    name: "polinomi",
    match: /polinom|prodott|scomposiz|trinom|quadratic|equazion di secondo/i,
    build: (rng) => {
      const r1 = int(rng, 1, 4) * (rng() > 0.5 ? 1 : -1);
      const r2 = int(rng, 1, 4) * (rng() > 0.5 ? 1 : -1);
      const b = -(r1 + r2);
      const c = r1 * r2;
      const sgn = (value        ) => (value >= 0 ? "+" : "-");
      const factors = `$(x ${r1 >= 0 ? "-" : "+"} ${Math.abs(r1)})(x ${r2 >= 0 ? "-" : "+"} ${Math.abs(r2)})$`;
      return {
        exercisePrompt: `Scomponi il trinomio $x^2 ${sgn(b)} ${Math.abs(b)}x ${sgn(c)} ${Math.abs(c)}$.`,
        proofPrompt: `Spiega come si scompone un trinomio di secondo grado e applica il procedimento a $x^2 ${sgn(b)} ${Math.abs(b)}x ${sgn(c)} ${Math.abs(c)}$.`,
        graphPrompt: `Rappresenta la parabola $y = x^2 ${sgn(b)} ${Math.abs(b)}x ${sgn(c)}$ e indica le intersezioni con l'asse $x$.`,
        result: factors,
        steps: [
          `Cerchiamo due numeri con somma $${-b}$ e prodotto $${c}$.`,
          `I numeri sono $${r1}$ e $${r2}$.`,
          `Quindi $x^2 ${sgn(b)} ${Math.abs(b)}x ${sgn(c)} ${Math.abs(c)} = ${factors}$.`,
        ],
        errors: ["Segni dei fattori invertiti", "Scambiare somma e prodotto", "Dimenticare il coefficiente del termine noto"],
        distractors: [
          `$(x ${r1 >= 0 ? "+" : "-"} ${Math.abs(r1)})(x ${r2 >= 0 ? "+" : "-"} ${Math.abs(r2)})$`,
          `$(x ${r1 >= 0 ? "-" : "+"} ${Math.abs(r1)})(x ${r2 >= 0 ? "+" : "-"} ${Math.abs(r2)})$`,
          `$(x + ${r1 + r2})(x + ${c})$`,
        ],
      };
    },
  },
  {
    name: "funzioni",
    match: /funzion|retta|grafic|proporzionalit|piano cartesian|dominio|immagine/i,
    build: (rng) => {
      const m = pick(rng, [-3, -2, -1, 1, 2, 3]);
      const q = int(rng, -4, 4);
      const x = 2;
      const y = m * x + q;
      return {
        exercisePrompt: `Data la funzione $y = ${m}x ${q >= 0 ? "+" : "-"} ${Math.abs(q)}$, calcola il valore di $y$ per $x = 2$.`,
        graphPrompt: `Rappresenta nel piano cartesiano la retta $y = ${m}x ${q >= 0 ? "+" : "-"} ${Math.abs(q)}$, indicando almeno due punti.`,
        result: `$y = ${y}$`,
        steps: [
          `Sostituisci $x = 2$ nell'espressione: $y = ${m}\\cdot 2 ${q >= 0 ? "+" : "-"} ${Math.abs(q)}$.`,
          `Calcola: $y = ${m * 2} ${q >= 0 ? "+" : "-"} ${Math.abs(q)} = ${y}$.`,
          `Il punto $\\left(2; ${y}\\right)$ appartiene alla retta.`,
        ],
        errors: ["Errore nel segno del coefficiente angolare", "Sostituire il valore di y al posto di x"],
        distractors: [`$y = ${y + 1}$`, `$y = ${-y}$`, `$y = ${m + q}$`],
      };
    },
  },
  {
    name: "geometria",
    match: /geometr|area|perimetr|triangol|rettangol|pitagor|teorema|figur/i,
    build: (rng, variant) => {
      if (variant % 3 === 2) {
        const [a, b, c] = pick(rng, [
          [3, 4, 5],
          [6, 8, 10],
          [5, 12, 13],
          [8, 15, 17],
        ]);
        return {
          exercisePrompt: `In un triangolo rettangolo i cateti misurano $${a}\\,\\mathrm{cm}$ e $${b}\\,\\mathrm{cm}$. Calcola la lunghezza dell'ipotenusa.`,
          problemPrompt: `Un campo rettangolare ha lati di $${a}\\,\\mathrm{m}$ e $${b}\\,\\mathrm{m}$. Quanto misura la diagonale? Arrotonda al centimetro.`,
          result: `$${c}\\,\\mathrm{cm}$`,
          steps: [
            `Applica il teorema di Pitagora: $i = \\sqrt{${a}^2 + ${b}^2}$.`,
            `Calcola i quadrati: $${a}^2 = ${a * a}$ e $${b}^2 = ${b * b}$.`,
            `Somma e radice: $i = \\sqrt{${a * a + b * b}} = ${c}\\,\\mathrm{cm}$.`,
          ],
          errors: ["Sommare i cateti invece dei quadrati", "Dimenticare l'unità di misura"],
          distractors: [`$${a + b}\\,\\mathrm{cm}$`, `$${c + 1}\\,\\mathrm{cm}$`, `$${c * c}\\,\\mathrm{cm}$`],
        };
      }
      const b = int(rng, 4, 12);
      const h = int(rng, 3, 10);
      const area = b * h;
      const perimeter = 2 * (b + h);
      const shape = variant % 2 === 0 ? "rettangolo" : "parallelogramma";
      return {
        exercisePrompt: `Un ${shape} ha base $${b}\\,\\mathrm{cm}$ e altezza $${h}\\,\\mathrm{cm}$. Calcola l'area e il perimetro.`,
        problemPrompt: `Un giardino rettangolare è lungo $${b}\\,\\mathrm{m}$ e largo $${h}\\,\\mathrm{m}$. Quanti metri di recinzione servono e qual è la sua area?`,
        proofPrompt: `Spiega perché l'area di un rettangolo si calcola moltiplicando base e altezza, usando come esempio un rettangolo di $${b}\\,\\mathrm{cm}$ per $${h}\\,\\mathrm{cm}$.`,
        graphPrompt: `Disegna un rettangolo di base $${b}\\,\\mathrm{cm}$ e altezza $${h}\\,\\mathrm{cm}$ su una griglia con lato di $1\\,\\mathrm{cm}$ e calcolane l'area.`,
        result: `Area $= ${area}\\,\\mathrm{cm}^2$; perimetro $= ${perimeter}\\,\\mathrm{cm}$`,
        steps: [
          `Area: $A = b \\cdot h = ${b} \\cdot ${h} = ${area}\\,\\mathrm{cm}^2$.`,
          `Perimetro: $P = 2(b + h) = 2(${b} + ${h}) = ${perimeter}\\,\\mathrm{cm}$.`,
          `Controllo: il perimetro è maggiore del doppio della base, come atteso.`,
        ],
        errors: ["Confondere area e perimetro", "Dimenticare il fattore 2 nel perimetro", "Unità di misura errate"],
        distractors: [
          `Area $= ${perimeter}\\,\\mathrm{cm}^2$; perimetro $= ${area}\\,\\mathrm{cm}$`,
          `Area $= ${b + h}\\,\\mathrm{cm}^2$; perimetro $= ${area}\\,\\mathrm{cm}$`,
          `Area $= ${area}\\,\\mathrm{cm}$; perimetro $= ${b + h}\\,\\mathrm{cm}$`,
        ],
      };
    },
  },
  {
    name: "probabilita",
    match: /probabilit|statistic|media|dati|frequenz|casual/i,
    build: (rng, variant) => {
      if (variant % 2 === 1) {
        const red = int(rng, 3, 7);
        const blue = int(rng, 2, 6);
        const total = red + blue;
        return {
          exercisePrompt: `Un sacchetto contiene ${red} palline rosse e ${blue} palline blu. Estraendo una pallina a caso, qual è la probabilità che sia rossa?`,
          result: `$\\dfrac{${red}}{${total}}$`,
          steps: [
            `Casi favorevoli: ${red}.`,
            `Casi possibili: $${red} + ${blue} = ${total}$.`,
            `Probabilità: $\\dfrac{${red}}{${total}}$.`,
          ],
          errors: ["Usare solo le palline di un colore", "Non semplificare la frazione quando richiesto"],
          distractors: [`$\\dfrac{${blue}}{${total}}$`, `$\\dfrac{1}{${total}}$`, `$\\dfrac{${red}}{${blue}}$`],
        };
      }
      const event = pick(rng, [
        { text: "un numero pari", fav: 3, tot: 6, frac: "\\dfrac{1}{2}" },
        { text: "un numero maggiore di 4", fav: 2, tot: 6, frac: "\\dfrac{1}{3}" },
        { text: "un numero multiplo di 3", fav: 2, tot: 6, frac: "\\dfrac{1}{3}" },
        { text: "un numero minore di 3", fav: 2, tot: 6, frac: "\\dfrac{1}{3}" },
      ]);
      return {
        exercisePrompt: `Si lancia un dado equilibrato a sei facce. Qual è la probabilità di ottenere ${event.text}?`,
        problemPrompt: `In un gioco si lancia un dado equilibrato: vinci se esce ${event.text}. Qual è la probabilità di vincere? Esprimi il risultato come frazione e come percentuale.`,
        result: `$${event.frac} = ${Math.round((event.fav / event.tot) * 100)}\\%$`,
        steps: [
          `Casi favorevoli: ${event.fav}.`,
          `Casi possibili: ${event.tot}.`,
          `Probabilità: $\\dfrac{${event.fav}}{${event.tot}} = ${event.frac}$.`,
        ],
        errors: ["Contare i casi possibili in modo errato", "Dimenticare di semplificare la frazione"],
        distractors: ["$\\dfrac{1}{6}$", "$\\dfrac{1}{3}$", "$\\dfrac{2}{3}$"],
        table:
          variant % 4 === 0
            ? { head: ["Esito", "Frequenza"], rows: [["1", 5], ["2", 7], ["3", 6], ["4", 8], ["5", 4], ["6", 10]] }
            : undefined,
      };
    },
  },
  {
    name: "percentuali",
    match: /percent|sconto|proporzion|aument|prezzo|interess/i,
    build: (rng) => {
      const price = int(rng, 4, 20) * 10;
      const percent = pick(rng, [10, 20, 25, 50]);
      const discount = (price * percent) / 100;
      const finalPrice = price - discount;
      return {
        exercisePrompt: `Un articolo costa ${price} euro. Viene applicato uno sconto del ${percent}%. Calcola lo sconto e il prezzo finale.`,
        problemPrompt: `In un negozio un articolo costa ${price} euro e viene scontato del ${percent}%. Quanto si risparmia e quanto si paga effettivamente?`,
        result: `Sconto $= ${texNum(discount)}$ euro; prezzo finale $= ${texNum(finalPrice)}$ euro`,
        steps: [
          `Sconto: $${price} \\cdot \\dfrac{${percent}}{100} = ${texNum(discount)}$ euro.`,
          `Prezzo finale: $${price} - ${texNum(discount)} = ${texNum(finalPrice)}$ euro.`,
          `Verifica: il prezzo finale è il ${100 - percent}% di quello iniziale.`,
        ],
        errors: ["Calcolare lo sconto e fermarsi", "Sottrarre la percentuale invece della sua parte", "Errore nel riportare gli euro"],
        distractors: [
          `${texNum(discount)} euro`,
          `${texNum(price - percent)} euro`,
          `${texNum(price + discount)} euro`,
        ],
      };
    },
  },
  {
    name: "radicali",
    match: /radic|radice|potenz|esponenz/i,
    build: (rng) => {
      const outside = int(rng, 2, 7);
      const inside = pick(rng, [2, 3, 5]);
      const radicand = outside * outside * inside;
      return {
        exercisePrompt: `Semplifica il radicale $\\sqrt{${radicand}}$.`,
        result: `$${outside}\\sqrt{${inside}}$`,
        steps: [
          `Scomponi il radicando: $${radicand} = ${outside * outside} \\cdot ${inside}$.`,
          `Estrai la radice del quadrato: $\\sqrt{${outside * outside}} = ${outside}$.`,
          `Risultato: $\\sqrt{${radicand}} = ${outside}\\sqrt{${inside}}$.`,
        ],
        errors: ["Semplificare solo il coefficiente", "Confondere radice quadrata e divisione per due"],
        distractors: [`$\\sqrt{${outside}}\\sqrt{${inside}}$`, `$${radicand / 2}$`, `$${outside * inside}$`],
      };
    },
  },
  {
    name: "logaritmi",
    match: /logaritm/i,
    build: (rng) => {
      const base = pick(rng, [2, 3, 5, 10]);
      const exponent = int(rng, 2, 4);
      const value = Math.pow(base, exponent);
      return {
        exercisePrompt: `Calcola $\\log_{${base}} ${value}$.`,
        result: `$${exponent}$`,
        steps: [
          `Cerchiamo l'esponente $x$ tale che $${base}^x = ${value}$.`,
          `Osserviamo che $${base}^{${exponent}} = ${value}$.`,
          `Quindi $\\log_{${base}} ${value} = ${exponent}$.`,
        ],
        errors: ["Confondere base ed esponente", "Moltiplicare base e risultato"],
        distractors: [`$${base}$`, `$${value / base}$`, `$${base + exponent}$`],
      };
    },
  },
  {
    name: "trigonometria",
    match: /trigonometr|seno|coseno|tangent|angoli|goniometr/i,
    build: (rng) => {
      const angle = pick(rng, [
        { deg: 30, sin: "\\dfrac{1}{2}", value: 5 },
        { deg: 45, sin: "\\dfrac{\\sqrt{2}}{2}", value: 7.07 },
        { deg: 60, sin: "\\dfrac{\\sqrt{3}}{2}", value: 8.66 },
      ]);
      return {
        exercisePrompt: `In un triangolo rettangolo l'ipotenusa misura $10\\,\\mathrm{cm}$ e un angolo acuto è di $${angle.deg}^\\circ$. Calcola la misura del cateto opposto a tale angolo.`,
        result: `$\\approx ${dec(angle.value)}\\,\\mathrm{cm}$`,
        steps: [
          `Usa la definizione di seno: $\\sin ${angle.deg}^\\circ = \\dfrac{\\text{cateto opposto}}{\\text{ipotenusa}}$.`,
          `Il seno vale $${angle.sin}$, quindi il cateto è $10 \\cdot ${angle.sin}=\\dfrac{10${angle.deg === 45 ? "\\sqrt{2}" : angle.deg === 60 ? "\\sqrt{3}" : ""}}{2}$.`,
          `Risultato numerico: circa $${dec(angle.value)}\\,\\mathrm{cm}$.`,
        ],
        errors: ["Usare il coseno al posto del seno", "Scambiare cateto e ipotenusa", "Approssimare senza indicare l'unità"],
        distractors: [`$${dec(10 - angle.value)}\\,\\mathrm{cm}$`, `$${dec(angle.value * 2)}\\,\\mathrm{cm}$`, `$${dec(10 / 2)}\\,\\mathrm{cm}$`],
      };
    },
  },
  {
    name: "derivate",
    match: /derivat|limite|continuit|tangent/i,
    build: (rng) => {
      const a = int(rng, 1, 3);
      const b = int(rng, 1, 4);
      const c = int(rng, -3, 3);
      const x = int(rng, 1, 3);
      const derivative = 3 * a * x * x + 2 * b * x + c;
      return {
        exercisePrompt: `Calcola la derivata della funzione $f(x) = ${a}x^3 + ${b}x^2 ${c >= 0 ? "+" : "-"} ${Math.abs(c)}x$ e valutala in $x = ${x}$.`,
        result: `$f'(${x}) = ${derivative}$`,
        steps: [
          `Deriva termine per termine: $f'(x) = ${3 * a}x^2 + ${2 * b}x ${c >= 0 ? "+" : "-"} ${Math.abs(c)}$.`,
          `Sostituisci $x = ${x}$: $f'(${x}) = ${3 * a}\\cdot ${x * x} + ${2 * b}\\cdot ${x} ${c >= 0 ? "+" : "-"} ${Math.abs(c)}$.`,
          `Calcola: $${3 * a * x * x} + ${2 * b * x} ${c >= 0 ? "+" : "-"} ${Math.abs(c)} = ${derivative}$.`,
        ],
        errors: ["Dimenticare di abbassare l'esponente", "Derivare la costante in modo errato", "Errore di segno"],
        distractors: [`$${derivative + 1}$`, `$${-derivative}$`, `$${a * x * x * x + b * x * x + c * x}$`],
      };
    },
  },
  {
    name: "integrali",
    match: /integral|primitiv|area sottesa/i,
    build: (rng) => {
      const a = int(rng, 1, 3);
      const b = int(rng, 1, 4);
      const k = int(rng, 1, 3);
      const value = (a * k * k) / 2 + b * k;
      return {
        exercisePrompt: `Calcola $\\displaystyle\\int_0^{${k}} (${a}x + ${b})\\,dx$.`,
        result: `$${dec(value)}$`,
        steps: [
          `Trova la primitiva: $F(x) = ${dec(a / 2)}x^2 + ${b}x$.`,
          `Valuta tra $0$ e $${k}$: $F(${k}) - F(0) = ${dec(a / 2)}\\cdot ${k * k} + ${b}\\cdot ${k}$.`,
          `Risultato: $${dec(value)}$.`,
        ],
        errors: ["Dimenticare il fattore 1/2 nella primitiva", "Non valutare agli estremi", "Errore nel calcolo della potenza"],
        distractors: [`$${dec(value + 1)}$`, `$${dec((a * k * k) / 2)}$`, `$${dec(a * k + b)}$`],
      };
    },
  },
];

const PHYSICS_FAMILIES                                                                                = [
  {
    name: "cinematica",
    match: /cinematic|moto|velocit|acceleraz|oraria|tragitto/i,
    build: (rng) => {
      const v = int(rng, 4, 20);
      const t = int(rng, 2, 10);
      const s = v * t;
      return {
        exercisePrompt: `Un corpo si muove di moto rettilineo uniforme con velocità $v = ${v}\\,\\mathrm{m/s}$. Quanto spazio percorre in $t = ${t}\\,\\mathrm{s}$?`,
        problemPrompt: `Un ciclista procede a velocità costante di $${v}\\,\\mathrm{m/s}$ per ${t} secondi. Quale distanza ha percorso? Esprimi il risultato in metri e in chilometri.`,
        result: `$${s}\\,\\mathrm{m} = ${dec(s / 1000)}\\,\\mathrm{km}$`,
        steps: [
          `Usa la legge del moto uniforme: $s = v\\,t$.`,
          `Sostituisci: $s = ${v}\\,\\mathrm{m/s} \\cdot ${t}\\,\\mathrm{s} = ${s}\\,\\mathrm{m}$.`,
          `Converti: $${s}\\,\\mathrm{m} = ${dec(s / 1000)}\\,\\mathrm{km}$.`,
        ],
        errors: ["Moltiplicare per il tempo in ore senza convertire", "Dimenticare l'unità di misura", "Sommare velocità e tempo"],
        distractors: [`$${v + t}\\,\\mathrm{m}$`, `$${dec(v / t)}\\,\\mathrm{m}$`, `$${s * 10}\\,\\mathrm{m}$`],
      };
    },
  },
  {
    name: "dinamica",
    match: /dinamic|forz|newton|attrit|massa|peso/i,
    build: (rng) => {
      const m = int(rng, 2, 10);
      const a = pick(rng, [1, 2, 2.5, 3, 4]);
      const f = m * a;
      return {
        exercisePrompt: `Una forza costante agisce su un corpo di massa $m = ${m}\\,\\mathrm{kg}$ producendo un'accelerazione $a = ${texNum(a)}\\,\\mathrm{m/s^2}$. Calcola l'intensità della forza.`,
        problemPrompt: `Un carrello di massa $${m}\\,\\mathrm{kg}$ viene spinto con una forza costante e accelera a $${texNum(a)}\\,\\mathrm{m/s^2}$. Calcola la forza applicata, trascurando l'attrito.`,
        result: `$F = ${dec(f)}\\,\\mathrm{N}$`,
        steps: [
          `Applica il secondo principio della dinamica: $F = m\\,a$.`,
          `Sostituisci: $F = ${m}\\,\\mathrm{kg} \\cdot ${texNum(a)}\\,\\mathrm{m/s^2} = ${dec(f)}\\,\\mathrm{N}$.`,
          `L'unità di misura è coerente: $\\mathrm{kg}\\cdot\\mathrm{m/s^2} = \\mathrm{N}$.`,
        ],
        errors: ["Dividere massa e accelerazione", "Dimenticare l'unità newton", "Non dichiarare l'idealizzazione (attrito trascurabile)"],
        distractors: [`$${dec(m / a)}\\,\\mathrm{N}$`, `$${dec(m + a)}\\,\\mathrm{N}$`, `$${dec(f * 2)}\\,\\mathrm{N}$`],
      };
    },
  },
  {
    name: "energia",
    match: /energ|lavoro|potenz|cinetica|potenziale|conservaz/i,
    build: (rng) => {
      if (rng() > 0.5) {
        const m = int(rng, 1, 5);
        const v = int(rng, 2, 8);
        const ek = 0.5 * m * v * v;
        return {
          exercisePrompt: `Calcola l'energia cinetica di un corpo di massa $m = ${m}\\,\\mathrm{kg}$ che si muove a velocità $v = ${v}\\,\\mathrm{m/s}$.`,
          result: `$E_k = ${dec(ek)}\\,\\mathrm{J}$`,
          steps: [
            `Formula: $E_k = \\dfrac{1}{2} m v^2$.`,
            `Sostituisci: $E_k = \\dfrac{1}{2}\\cdot ${m}\\cdot (${v})^2$.`,
            `Calcola: $E_k = ${dec(ek)}\\,\\mathrm{J}$.`,
          ],
          errors: ["Dimenticare il quadrato della velocità", "Dimenticare il fattore 1/2", "Unità errate"],
          distractors: [`$${dec(m * v)}\\,\\mathrm{J}$`, `$${dec(ek * 2)}\\,\\mathrm{J}$`, `$${dec(ek / 2)}\\,\\mathrm{J}$`],
        };
      }
      const m = int(rng, 1, 5);
      const h = int(rng, 2, 10);
      const ep = m * 9.81 * h;
      return {
        exercisePrompt: `Calcola l'energia potenziale gravitazionale di un corpo di massa $m = ${m}\\,\\mathrm{kg}$ posto a un'altezza $h = ${h}\\,\\mathrm{m}$. Usa $g = 9{,}81\\,\\mathrm{m/s^2}$.`,
        result: `$E_p \\approx ${dec(ep)}\\,\\mathrm{J}$`,
        steps: [
          `Formula: $E_p = m\\,g\\,h$.`,
          `Sostituisci: $E_p = ${m} \\cdot 9{,}81 \\cdot ${h}$.`,
          `Calcola: $E_p \\approx ${dec(ep)}\\,\\mathrm{J}$.`,
        ],
        errors: ["Usare g = 10 senza indicarlo", "Dimenticare l'altezza", "Confondere energia potenziale e cinetica"],
        distractors: [`$${dec(m * h)}\\,\\mathrm{J}$`, `$${dec(ep / 2)}\\,\\mathrm{J}$`, `$${dec(ep * 2)}\\,\\mathrm{J}$`],
      };
    },
  },
  {
    name: "elettricita",
    match: /elettr|corrent|ohm|circuit|tension|resistenz|potenza elettr/i,
    build: (rng) => {
      const r = pick(rng, [4, 5, 10, 20]);
      const i = pick(rng, [0.5, 1, 2, 3]);
      const v = r * i;
      const p = v * i;
      return {
        exercisePrompt: `In un circuito un resistore di resistenza $R = ${r}\\,\\Omega$ è percorso da una corrente $I = ${texNum(i)}\\,\\mathrm{A}$. Calcola la tensione ai capi e la potenza dissipata.`,
        problemPrompt: `Un resistore da $${r}\\,\\Omega$ è collegato a una pila. La corrente misurata è $${texNum(i)}\\,\\mathrm{A}$. Determina la tensione e la potenza dissipata, assumendo conduttori ideali.`,
        result: `$V = ${texNum(v)}\\,\\mathrm{V}$; $P = ${texNum(p)}\\,\\mathrm{W}$`,
        steps: [
          `Prima legge di Ohm: $V = R\\,I = ${r}\\cdot ${texNum(i)} = ${texNum(v)}\\,\\mathrm{V}$.`,
          `Potenza: $P = V\\,I = ${texNum(v)}\\cdot ${texNum(i)} = ${texNum(p)}\\,\\mathrm{W}$.`,
          `Verifica: $P = R\\,I^2 = ${r}\\cdot ${texNum(i * i)} = ${texNum(p)}\\,\\mathrm{W}$.`,
        ],
        errors: ["Dividere tensione e corrente invertendo la legge di Ohm", "Confondere potenza e tensione", "Omettere le unità"],
        distractors: [
          `$V = ${texNum(r / i)}\\,\\mathrm{V}$; $P = ${texNum(p / 2)}\\,\\mathrm{W}$`,
          `$V = ${texNum(r + i)}\\,\\mathrm{V}$; $P = ${texNum(p * 2)}\\,\\mathrm{W}$`,
          `$V = ${texNum(v)}\\,\\mathrm{V}$; $P = ${texNum(v + i)}\\,\\mathrm{W}$`,
        ],
      };
    },
  },
  {
    name: "misure",
    match: /misur|error|incertezz|strument|significativ|media/i,
    build: (rng) => {
      const base = int(rng, 10, 20);
      const values = [base, base + 1, base - 1, base + 2];
      const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
      const maxError = Math.max(...values.map((value) => Math.abs(value - mean)));
      return {
        exercisePrompt: `Quattro misure di una lunghezza sono $${values.join("\\,\\mathrm{cm};\\,")}\\,\\mathrm{cm}$. Calcola la media e l'errore massimo assoluto.`,
        problemPrompt: `In laboratorio un gruppo misura più volte la stessa lunghezza e ottiene ${values.join(", ")} cm. Calcola il valore medio e stima l'incertezza massima.`,
        table: {
          head: ["Misura", "Valore (cm)"],
          rows: values.map((value, index) => [index + 1, value]),
        },
        result: `Media $= ${dec(mean)}\\,\\mathrm{cm}$; errore massimo $= ${dec(maxError)}\\,\\mathrm{cm}$`,
        steps: [
          `Somma delle misure: $${values.join(" + ")} = ${values.reduce((acc, value) => acc + value, 0)}$.`,
          `Media: $\\bar{x} = \\dfrac{${values.reduce((acc, value) => acc + value, 0)}}{4} = ${dec(mean)}\\,\\mathrm{cm}$.`,
          `Scarti assoluti: ${values.map((value) => dec(Math.abs(value - mean))).join("; ")} cm; il massimo è $${dec(maxError)}\\,\\mathrm{cm}$.`,
        ],
        errors: ["Dividere per il numero di misure sbagliato", "Usare lo scarto massimo come errore relativo", "Dimenticare l'unità"],
        distractors: [
          `Media $= ${dec(mean + 1)}\\,\\mathrm{cm}$`,
          `Media $= ${dec(maxError)}\\,\\mathrm{cm}$`,
          `Media $= ${dec(values[0])}\\,\\mathrm{cm}$`,
        ],
      };
    },
  },
  {
    name: "calore",
    match: /calor|temperatur|termolog|cale specific|riscaldament/i,
    build: (rng) => {
      const m = pick(rng, [0.5, 1, 2]);
      const delta = int(rng, 5, 20);
      const q = m * 4186 * delta;
      return {
        exercisePrompt: `Calcola il calore necessario per riscaldare $m = ${texNum(m)}\\,\\mathrm{kg}$ di acqua da una temperatura iniziale a una finale superiore di $\\Delta T = ${delta}\\,\\mathrm{K}$. Usa $c = 4186\\,\\mathrm{J/(kg\\cdot K)}$.`,
        result: `$Q = ${dec(q)}\\,\\mathrm{J}$`,
        steps: [
          `Formula: $Q = m\\,c\\,\\Delta T$.`,
          `Sostituisci: $Q = ${texNum(m)}\\cdot 4186\\cdot ${delta}$.`,
          `Calcola: $Q = ${dec(q)}\\,\\mathrm{J}$.`,
        ],
        errors: ["Usare la temperatura finale invece della variazione", "Dimenticare il calore specifico", "Unità di misura incoerenti"],
        distractors: [`$${dec(q / 2)}\\,\\mathrm{J}$`, `$${dec(m * delta)}\\,\\mathrm{J}$`, `$${dec(q * 2)}\\,\\mathrm{J}$`],
      };
    },
  },
  {
    name: "onde",
    match: /onda|onde|frequenz|period|suono|luce|lunghezz.*onda/i,
    build: (rng) => {
      const v = pick(rng, [340, 1500]);
      const f = pick(rng, [170, 340, 500]);
      const lambda = v / f;
      return {
        exercisePrompt: `Un'onda si propaga con velocità $v = ${v}\\,\\mathrm{m/s}$ e frequenza $f = ${f}\\,\\mathrm{Hz}$. Calcola la lunghezza d'onda.`,
        result: `$\\lambda = ${dec(lambda)}\\,\\mathrm{m}$`,
        steps: [
          `Relazione fondamentale: $v = \\lambda\\,f$.`,
          `Ricava: $\\lambda = \\dfrac{v}{f} = \\dfrac{${v}}{${f}}$.`,
          `Calcola: $\\lambda = ${dec(lambda)}\\,\\mathrm{m}$.`,
        ],
        errors: ["Moltiplicare velocità e frequenza", "Invertire numeratore e denominatore", "Dimenticare l'unità"],
        distractors: [`$${dec(v * f)}\\,\\mathrm{m}$`, `$${dec(f / v)}\\,\\mathrm{m}$`, `$${dec(lambda * 2)}\\,\\mathrm{m}$`],
      };
    },
  },
  {
    name: "fluidi",
    match: /pression|densit|fluid|portata|spinta di archimede/i,
    build: (rng) => {
      const rho = pick(rng, [800, 1000, 1200]);
      const volume = pick(rng, [0.5, 1, 2, 5]);
      const mass = rho * volume;
      return {
        exercisePrompt: `Un corpo di volume $V = ${texNum(volume)}\\,\\mathrm{m^3}$ ha densità $\\rho = ${rho}\\,\\mathrm{kg/m^3}$. Calcola la sua massa.`,
        result: `$m = ${dec(mass)}\\,\\mathrm{kg}$`,
        steps: [
          `Definizione di densità: $\\rho = \\dfrac{m}{V}$.`,
          `Ricava la massa: $m = \\rho\\,V = ${rho}\\cdot ${texNum(volume)} = ${dec(mass)}\\,\\mathrm{kg}$.`,
          `L'unità di misura è coerente: $\\mathrm{kg/m^3}\\cdot\\mathrm{m^3} = \\mathrm{kg}$.`,
        ],
        errors: ["Dividere volume per densità", "Errore nelle unità di misura", "Confondere massa e peso"],
        distractors: [`$${dec(rho / volume)}\\,\\mathrm{kg}$`, `$${dec(volume)}\\cdot 9{,}81\\,\\mathrm{N}$`, `$${dec(mass / 2)}\\,\\mathrm{kg}$`],
      };
    },
  },
];

function conceptualCore(topic              , request                   )       {
  const objective = topic.objectives[0]?.text ?? topic.name;
  const isFisica = request.subject === "fisica";
  return {
    exercisePrompt: `Spiega, con un esempio, il concetto di ${topic.name.toLowerCase()} e il suo ruolo nello studio della ${isFisica ? "fisica" : "matematica"}.`,
    proofPrompt: `Giustifica la seguente affermazione, collegandola agli obiettivi del programma: «${objective}». Usa un esempio e un controesempio quando possibile.`,
    result: "Risposta argomentata coerente con gli obiettivi indicati.",
    steps: [
      `Richiama la definizione di ${topic.name.toLowerCase()}.`,
      `Esponi almeno una proprietà o una legge collegata all'obiettivo: ${objective}.`,
      `Illustra con un esempio concreto e, se richiesto, con un controesempio.`,
    ],
    errors: [
      "Definizione incompleta o confusa",
      "Esempio non pertinente all'argomento",
      "Mancata giustificazione delle affermazioni",
    ],
    distractors: [
      "Definizione corretta ma priva di esempio",
      "Esempio corretto ma definizione assente",
      "Risposta generica non collegata agli obiettivi",
    ],
  };
}

function selectFamily(topic              , request                   ) {
  const haystack = `${topic.name} ${topic.description} ${topic.objectives.map((o) => o.text).join(" ")}`;
  const families = request.subject === "fisica" ? PHYSICS_FAMILIES : MATH_FAMILIES;
  const found = families.find((family) => family.match.test(haystack));
  if (!found) return { name: "concettuale", build: () => conceptualCore(topic, request) };
  if (request.noDerivatives && (found.name === "derivate" || found.name === "integrali")) {
    return { name: "concettuale", build: () => conceptualCore(topic, request) };
  }
  return found;
}


export { MATH_FAMILIES, PHYSICS_FAMILIES, selectFamily, mulberry32, int, pick, shuffle, texNum };
