/**
 * Horas de desconforto térmico.
 *
 * Puro e determinístico (AGENTS.md §7). **Nada aqui emite veredito de conformidade** — é
 * indicador informativo, na mesma postura de `src/generators/nbr15575.ts`.
 *
 * ## Por que o resumo da API não basta
 *
 * `src/generators/hvac.ts` escreve `heating_limit: 'NoLimit'` e `cooling_limit: 'NoLimit'`
 * em todo `ZoneHVAC:IdealLoadsAirSystem`. Um sistema ideal ilimitado atende o setpoint em
 * praticamente toda hora, então `occupied_heating_setpoint_not_met` e
 * `occupied_cooling_setpoint_not_met` são **estruturalmente próximos de zero** nos modelos
 * deste aplicativo — confirmado nas duas execuções reais observadas, ambas com 0 h. Eles
 * medem controle e dimensionamento, não conforto do ocupante.
 *
 * Por isso o indicador principal é calculado aqui, da série horária de temperatura
 * operativa. O resumo permanente continua útil como fallback quando a série expira (410),
 * e é o que `summaryComfortHours` organiza.
 */
import type { NormalizedPoint, NormalizedSeries } from './series';
import { aggregateDaily, dayOfYear } from './series';

/** Faixa de conforto em °C, entre o limite inferior e o superior. */
export interface ComfortBand {
  min: number;
  max: number;
}

/** Como cada hora foi classificada — o carpete anual recolore por isto. */
export type HourState = 'frio' | 'ok' | 'quente';

export interface Discomfort {
  /** Horas abaixo da faixa. */
  cold: number;
  /** Horas acima da faixa. */
  hot: number;
  comfortable: number;
  /** Horas classificadas, isto é, `cold + hot + comfortable`. */
  total: number;
  /** Classificação de cada ponto, na ordem de entrada. */
  hourly: HourState[];
}

/**
 * Conta horas fora da faixa, **separando frio de quente**.
 *
 * O agregado único esconde em qual direção o edifício falha, que é justamente o que a
 * decisão de projeto precisa saber: 800 horas quentes pedem sombreamento e ventilação;
 * 800 horas frias pedem isolamento e ganho solar. São respostas opostas.
 *
 * Horas sem dado não chegam aqui — `normalizeSeries` já as separou em `dropped`. Elas não
 * contam nem como conforto nem como desconforto, e o painel as reporta à parte.
 */
export function hoursOutsideBand(points: readonly NormalizedPoint[], band: ComfortBand): Discomfort {
  const hourly: HourState[] = [];
  let cold = 0, hot = 0, comfortable = 0;
  for (const p of points) {
    if (p.value < band.min) { cold++; hourly.push('frio'); }
    else if (p.value > band.max) { hot++; hourly.push('quente'); }
    else { comfortable++; hourly.push('ok'); }
  }
  return { cold, hot, comfortable, total: points.length, hourly };
}

/** Domínio de validade do modelo adaptativo, em média externa (°C). */
export const ADAPTIVE_MIN_OUTDOOR = 10;
export const ADAPTIVE_MAX_OUTDOOR = 33.5;

/**
 * Faixa adaptativa da ASHRAE 55 / EN 16798: centro em `0,31·T̄ext + 17,8`, com tolerância
 * de ±3,5 K (aceitabilidade de 80%).
 *
 * **Devolve `null` fora do domínio de validade.** O modelo é ajustado entre 10 °C e 33,5 °C
 * de média externa predominante; extrapolar em silêncio produziria uma faixa com aparência
 * de resultado e sem lastro — num clima muito frio, um centro abaixo de 21 °C declararia
 * confortável o que ninguém acha. Quem chama deve cair para a faixa fixa e dizer que caiu.
 */
export function adaptiveBand(meanOutdoor: number, tolerance = 3.5): ComfortBand | null {
  if (!Number.isFinite(meanOutdoor)) return null;
  if (meanOutdoor < ADAPTIVE_MIN_OUTDOOR || meanOutdoor > ADAPTIVE_MAX_OUTDOOR) return null;
  const centro = 0.31 * meanOutdoor + 17.8;
  return { min: centro - tolerance, max: centro + tolerance };
}

/**
 * Média externa predominante da EN 16798: média móvel exponencial das médias diárias
 * anteriores, com `alpha = 0,8` (o dia de ontem pesa mais que o de antes de ontem).
 *
 * `dailyMeans` vem em ordem cronológica e representa os dias **anteriores** ao avaliado, do
 * mais recente para o mais antigo. Lista vazia devolve `null`: sem histórico não há média
 * predominante, e inventar uma seria pior que admitir a ausência.
 */
export function runningMeanOutdoor(dailyMeans: readonly number[], alpha = 0.8): number | null {
  let numerador = 0, denominador = 0;
  for (let i = 0; i < dailyMeans.length; i++) {
    const v = dailyMeans[i];
    // Dia sem dado é pulado **mantendo sua posição**: compactar a lista promoveria os dias
    // anteriores para pesos que não são deles. Um buraco de um dia faria o de três dias
    // atrás pesar como o de ontem, e a faixa seguiria um clima que não houve.
    if (!Number.isFinite(v)) continue;
    const peso = Math.pow(alpha, i);
    numerador += peso * v;
    denominador += peso;
  }
  return denominador === 0 ? null : numerador / denominador;
}

export interface AdaptiveResult extends Discomfort {
  /** Faixa usada em cada dia do ano que teve base para o modelo adaptativo. */
  bands: Map<number, ComfortBand>;
  /**
   * Quantos dias **da série interna** foram classificados pela faixa fixa, seja porque o
   * modelo adaptativo saiu do domínio de validade, seja porque não havia série externa
   * para aquele dia. É o número que o painel precisa exibir: contar só o primeiro motivo
   * sub-reportaria a troca de critério.
   */
  fallbackDays: number;
}

/**
 * Classifica a série interna contra a faixa adaptativa do dia, dia a dia.
 *
 * Cada dia tem sua própria faixa, calculada da média externa predominante dos dias
 * anteriores (janela de 7, como na EN 16798). Onde o modelo não vale — início da série, sem
 * histórico, ou média externa fora de 10–33,5 °C — a faixa fixa entra no lugar, e
 * `fallbackDays` conta em quantos dias isso aconteceu. O painel precisa dizer isso: uma
 * faixa que troca de critério no meio do ano sem avisar é um gráfico que mente.
 */
export function adaptiveDiscomfort(
  indoor: NormalizedSeries,
  outdoor: NormalizedSeries,
  fixed: ComfortBand,
  options: { tolerance?: number; window?: number } = {},
): AdaptiveResult {
  const janela = options.window ?? 7;
  // Um ano bissexto para as duas séries. Se cada uma usasse o próprio `leap`, bastaria a
  // externa não conter 29 de fevereiro — por recorte da fixture ou buraco de medição — para
  // os índices divergirem de 1º de março em diante, e a faixa do dia seguinte seria aplicada
  // ao dia anterior pelo resto do ano.
  const leap = indoor.leap || outdoor.leap;
  const serieExterna: NormalizedSeries = { ...outdoor, leap };

  const mediasPorDia = new Map<number, number>();
  for (const b of aggregateDaily(serieExterna, 'mean')) mediasPorDia.set(b.index, b.value);

  const bands = new Map<number, ComfortBand>();
  for (const dia of [...mediasPorDia.keys()].sort((a, b) => a - b)) {
    // Dias anteriores, do mais recente para o mais antigo — a ordem que o peso exponencial
    // da EN 16798 espera. Dia ausente entra como `NaN` para **não deslocar** os pesos dos
    // demais: a posição é o que define o peso.
    const anteriores: number[] = [];
    for (let k = 1; k <= janela; k++) anteriores.push(mediasPorDia.get(dia - k) ?? NaN);
    const media = runningMeanOutdoor(anteriores);
    const faixa = media === null ? null : adaptiveBand(media, options.tolerance);
    if (faixa) bands.set(dia, faixa);
  }

  const hourly: HourState[] = [];
  const diasNaFixa = new Set<number>();
  let cold = 0, hot = 0, comfortable = 0;
  for (const p of indoor.points) {
    const dia = dayOfYear(p.month, p.day, leap);
    const adaptativa = bands.get(dia);
    // Conta pelo dia da série INTERNA, que é a que está sendo classificada. Contar pelos
    // dias da externa deixaria de fora o caso em que ela simplesmente não cobre o período.
    if (!adaptativa) diasNaFixa.add(dia);
    const faixa = adaptativa ?? fixed;
    if (p.value < faixa.min) { cold++; hourly.push('frio'); }
    else if (p.value > faixa.max) { hot++; hourly.push('quente'); }
    else { comfortable++; hourly.push('ok'); }
  }
  return { cold, hot, comfortable, total: indoor.points.length, hourly, bands, fallbackDays: diasNaFixa.size };
}

/** Os três indicadores de conforto que o resumo permanente traz, todos em horas. */
export interface SummaryComfort {
  /** Tempo fora do setpoint de aquecimento. Mede controle, não conforto. */
  heatingSetpointNotMet: number | null;
  /** Tempo fora do setpoint de resfriamento. Mede controle, não conforto. */
  coolingSetpointNotMet: number | null;
  /**
   * Horas fora da zona de conforto da ASHRAE 55 (modelo simples do motor). **Este é conforto
   * de verdade** — e sobrevive à retenção que apaga o `.sql`, quando a série vira 410.
   */
  ashrae55NotComfortable: number | null;
}

const NOMES = {
  heatingSetpointNotMet: 'occupied_heating_setpoint_not_met',
  coolingSetpointNotMet: 'occupied_cooling_setpoint_not_met',
  ashrae55NotComfortable: 'simple_ashrae_55_not_comfortable',
} as const;

/**
 * Organiza `Summary.comfort` nos três indicadores conhecidos.
 *
 * Campo ausente vira `null`, e não zero: "o motor não reportou" e "foram zero horas" são
 * afirmações diferentes, e só a segunda pode ir para a tela como número.
 */
export function summaryComfortHours(comfort: readonly { name: string; value: number; units: string }[]): SummaryComfort {
  const achar = (nome: string) => {
    const item = comfort.find(c => c.name === nome);
    // A unidade é conferida porque o número só significa algo se vier em horas.
    return item && item.units.toLowerCase().startsWith('hour') ? item.value : null;
  };
  return {
    heatingSetpointNotMet: achar(NOMES.heatingSetpointNotMet),
    coolingSetpointNotMet: achar(NOMES.coolingSetpointNotMet),
    ashrae55NotComfortable: achar(NOMES.ashrae55NotComfortable),
  };
}
