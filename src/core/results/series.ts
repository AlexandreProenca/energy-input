/**
 * Agregação e reamostragem de séries temporais.
 *
 * Puro e determinístico: nada aqui importa React, Zustand, Three.js ou DOM (AGENTS.md §7).
 * Os gráficos recebem o resultado destas funções já pronto e não calculam nada.
 *
 * **A armadilha central é o `hour`.** Ele vai de 1 a 24 e é o **fim** do intervalo, em hora
 * local padrão: a hora 24 ainda pertence ao dia anterior, embora o `timestamp` UTC já esteja
 * no dia seguinte. Confirmado em dado real na T001 e na T003 (365 pontos com `hour: 24` numa
 * série anual — um por dia). Tratá-la como hora 0 do dia seguinte desloca a série em um dia.
 * Por isso a posição no calendário vem de `month`/`day`, e nunca do `timestamp`.
 */
import type { SeriesVariable, TimeSeriesPoint } from './types';

/** Ponto com posição de calendário resolvida e valor presente. */
export interface NormalizedPoint {
  month: number;
  day: number;
  /** 1 a 24, fim do intervalo. */
  hour: number;
  value: number;
}

export interface NormalizedSeries {
  points: NormalizedPoint[];
  /** Pontos descartados por não terem valor ou posição — a interface diz "N horas sem dado". */
  dropped: number;
  /** `true` quando a série contém 29 de fevereiro. */
  leap: boolean;
}

/** Dias acumulados antes de cada mês, em ano comum. */
const ANTES_DO_MES = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/**
 * Dia do ano, de 1 a 365 (ou 366). `leap` não é inferido do ano do `timestamp` — o ano vem
 * do arquivo climático e pode não corresponder ao calendário real da execução. Quem chama
 * passa o que observou na própria série.
 */
export function dayOfYear(month: number, day: number, leap = false): number {
  const base = ANTES_DO_MES[month - 1] ?? 0;
  return base + day + (leap && month > 2 ? 1 : 0);
}

/**
 * Descarta pontos sem valor ou sem posição de calendário, e informa quantos.
 *
 * O contrato declara **todo** campo do ponto como anulável, e `value` realmente vem nulo
 * quando o motor não registrou a hora. Somar isso como zero afundaria a média; descartar em
 * silêncio faria o gráfico mentir por omissão — daí `dropped`.
 */
export function normalizeSeries(points: readonly TimeSeriesPoint[]): NormalizedSeries {
  const out: NormalizedPoint[] = [];
  let dropped = 0;
  let leap = false;
  for (const p of points) {
    if (p.month === 2 && p.day === 29) leap = true;
    if (p.value == null || !Number.isFinite(p.value) || p.month == null || p.day == null || p.hour == null) {
      dropped++;
      continue;
    }
    out.push({ month: p.month, day: p.day, hour: p.hour, value: p.value });
  }
  return { points: out, dropped, leap };
}

export type How = 'sum' | 'mean' | 'min' | 'max';

/**
 * Como agregar uma série, deduzido do que o serviço diz dela — não do nome da variável.
 *
 * Medidor e agregação `Sum` do motor somam; o resto faz média. Adivinhar pelo nome erraria
 * em `Zone Ideal Loads Supply Air Total Cooling Energy`, que tem "Temperature" nenhum e é
 * energia, e em qualquer variável nova.
 */
export function defaultAggregation(variable: Pick<SeriesVariable, 'aggregation' | 'is_meter'>): How {
  return variable.is_meter || variable.aggregation.toLowerCase().startsWith('sum') ? 'sum' : 'mean';
}

function reduzir(valores: number[], how: How): number {
  if (how === 'sum') return valores.reduce((a, b) => a + b, 0);
  if (how === 'min') return Math.min(...valores);
  if (how === 'max') return Math.max(...valores);
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

export interface Bucket {
  /** 1..365/366 no diário, 1..12 no mensal. */
  index: number;
  value: number;
  /** Quantos pontos entraram — permite distinguir dia cheio de dia parcial. */
  count: number;
}

/** Agrega por dia do ano. Baldes sem nenhum ponto não aparecem, em vez de virarem zero. */
export function aggregateDaily(series: NormalizedSeries, how: How): Bucket[] {
  const por = new Map<number, number[]>();
  for (const p of series.points) {
    const d = dayOfYear(p.month, p.day, series.leap);
    (por.get(d) ?? por.set(d, []).get(d)!).push(p.value);
  }
  return [...por.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, valores]) => ({ index, value: reduzir(valores, how), count: valores.length }));
}

/** Agrega por mês (1 a 12). */
export function aggregateMonthly(series: NormalizedSeries, how: How): Bucket[] {
  const por = new Map<number, number[]>();
  for (const p of series.points) (por.get(p.month) ?? por.set(p.month, []).get(p.month)!).push(p.value);
  return [...por.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, valores]) => ({ index, value: reduzir(valores, how), count: valores.length }));
}

export interface EnvelopeBucket {
  /** Posição do balde, de 0 a `buckets - 1`. */
  x: number;
  min: number;
  max: number;
  mean: number;
  count: number;
}

/**
 * Reduz N pontos a no máximo `buckets`, preservando **mínimo e máximo** de cada balde.
 *
 * Decimação ingênua (pegar 1 a cada k) é mais simples e está errada aqui: o pico anual de
 * carga é justamente o número que um engenheiro procura, e uma série de 8 760 pontos
 * reduzida a 800 por amostragem o perde com alta probabilidade. O gráfico desenha a banda
 * mín/máx e a linha da média, então o pico continua visível mesmo reduzido.
 *
 * LTTB foi considerado e descartado: produz curva mais bonita, mas não garante o extremo.
 */
export function downsampleEnvelope(points: readonly NormalizedPoint[], buckets: number): EnvelopeBucket[] {
  if (buckets <= 0 || points.length === 0) return [];
  if (points.length <= buckets) {
    return points.map((p, x) => ({ x, min: p.value, max: p.value, mean: p.value, count: 1 }));
  }
  const tamanho = points.length / buckets;
  const out: EnvelopeBucket[] = [];
  for (let b = 0; b < buckets; b++) {
    const ini = Math.floor(b * tamanho);
    const fim = b === buckets - 1 ? points.length : Math.floor((b + 1) * tamanho);
    if (fim <= ini) continue;
    let min = Infinity, max = -Infinity, soma = 0;
    for (let i = ini; i < fim; i++) {
      const v = points[i].value;
      if (v < min) min = v;
      if (v > max) max = v;
      soma += v;
    }
    out.push({ x: b, min, max, mean: soma / (fim - ini), count: fim - ini });
  }
  return out;
}
