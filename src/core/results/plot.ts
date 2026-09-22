/**
 * Geometria de gráfico: escalas, marcações e caminhos SVG.
 *
 * Puro e determinístico (AGENTS.md §7). Está aqui, e não dentro dos componentes, porque o
 * Vitest deste projeto roda em `environment: 'node'` sem jsdom: lógica dentro do `.tsx` não
 * tem como ser exercitada. É também onde moram os erros que realmente aparecem na tela —
 * divisão por zero em domínio degenerado, `NaN` virando `"M NaN NaN"` no atributo `d`, eixo
 * com marcação fora da área desenhada.
 */

/** Intervalo fechado `[min, max]`. */
export interface Range {
  min: number;
  max: number;
}

/**
 * Escala linear de `domain` para `range`.
 *
 * Domínio degenerado (`min === max`) não divide por zero: devolve o meio do `range`, que é
 * onde uma série constante deve ser desenhada. Sem isso, uma zona com temperatura fixa
 * produziria `Infinity` e a curva sumiria da tela sem erro nenhum.
 */
export function linearScale(domain: Range, range: Range): (v: number) => number {
  const dd = domain.max - domain.min;
  const dr = range.max - range.min;
  if (dd === 0) return () => range.min + dr / 2;
  return (v) => range.min + ((v - domain.min) / dd) * dr;
}

/**
 * Marcações "redondas" cobrindo `[min, max]`, com passo em 1, 2 ou 5 vezes potência de dez.
 *
 * Devolve lista vazia em domínio degenerado ou não finito: um eixo com uma marcação só, ou
 * com `NaN`, confunde mais do que ajuda.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max || count < 1) return [];
  const [lo, hi] = min < max ? [min, max] : [max, min];
  const bruto = (hi - lo) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(bruto)));
  const normalizado = bruto / magnitude;
  const passo = (normalizado >= 5 ? 5 : normalizado >= 2 ? 2 : 1) * magnitude;
  // Duas correções de ponto flutuante, que resolvem coisas diferentes:
  //   1. múltiplos inteiros do passo, em vez de somar o passo a cada volta, para o erro não
  //      se acumular ao longo do eixo;
  //   2. arredondamento à precisão do próprio passo, porque nem a multiplicação escapa da
  //      representação binária — `3 × 0,1` é `0,30000000000000004`, e esse número iria
  //      inteiro para o rótulo do eixo.
  const casas = Math.max(0, -Math.floor(Math.log10(passo)));
  const ticks: number[] = [];
  const primeiro = Math.ceil(lo / passo);
  for (let i = primeiro; i * passo <= hi + passo * 1e-9; i++) ticks.push(Number((i * passo).toFixed(casas)));
  return ticks;
}

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Caminho de polilinha para o atributo `d`.
 *
 * Lista vazia devolve string vazia, e não `"M NaN NaN"`: o SVG com `d` inválido não avisa,
 * só não desenha. Pontos não finitos **quebram a linha** em vez de serem descartados —
 * emendar por cima de um buraco desenharia um segmento que os dados não sustentam.
 */
export function polylinePath(points: readonly Point2D[]): string {
  let d = '';
  let abrindo = true;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { abrindo = true; continue; }
    d += `${abrindo ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`;
    abrindo = false;
  }
  return d;
}

/**
 * Caminho fechado da banda entre `upper` e `lower`, para a faixa mín/máx da T004.
 *
 * Os dois lados precisam ter o mesmo comprimento; comprimentos diferentes devolvem string
 * vazia, porque emparelhar por índice o que não corresponde produziria uma faixa plausível
 * e errada.
 */
export function bandPath(upper: readonly Point2D[], lower: readonly Point2D[]): string {
  if (upper.length === 0 || upper.length !== lower.length) return '';
  const ida = polylinePath(upper);
  if (!ida) return '';
  const volta = [...lower].reverse();
  let d = ida;
  for (const p of volta) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return '';
    d += `L${round(p.x)} ${round(p.y)}`;
  }
  return `${d}Z`;
}

/** Duas casas bastam para coordenada de tela e encurtam bastante o atributo `d`. */
const round = (n: number) => Math.round(n * 100) / 100;

export interface CarpetCell {
  /** Coluna: dia do ano, começando em 0. */
  col: number;
  /** Linha: hora do dia, de 0 a 23, com a hora 24 do contrato na linha 23. */
  row: number;
  value: number;
}

/**
 * Converte pontos horários em células de um carpete dia × hora.
 *
 * A hora do contrato vai de **1 a 24**, então a linha é `hour - 1`: a hora 24 é a última
 * linha do **mesmo** dia, não a primeira do dia seguinte. Errar isso desloca o carpete
 * inteiro em uma linha e um dia.
 */
export function carpetCells(
  points: readonly { hour: number; value: number }[],
  dayOf: (index: number) => number,
): CarpetCell[] {
  const cells: CarpetCell[] = [];
  points.forEach((p, i) => {
    if (!Number.isFinite(p.value) || !Number.isFinite(p.hour)) return;
    const row = p.hour - 1;
    if (row < 0 || row > 23) return;
    cells.push({ col: dayOf(i), row, value: p.value });
  });
  return cells;
}

/**
 * Cor divergente frio → neutro → quente, em torno de `center`.
 *
 * Determinística e fechada nas bordas: valor fora do domínio recebe a cor do extremo, em vez
 * de extrapolar para um tom que não está na legenda.
 */
export function divergingColor(value: number, domain: Range, center = (domain.min + domain.max) / 2): string {
  if (!Number.isFinite(value)) return '#e2e8f0';
  const frio = [91, 155, 192] as const;
  const neutro = [241, 245, 249] as const;
  const quente = [239, 108, 53] as const;
  const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const abaixo = value < center;
  const extensao = abaixo ? center - domain.min : domain.max - center;
  const t = extensao === 0 ? 0 : clamp01(Math.abs(value - center) / extensao);
  const alvo = abaixo ? frio : quente;
  const canal = (i: number) => Math.round(neutro[i] + (alvo[i] - neutro[i]) * t);
  return `#${[0, 1, 2].map((i) => canal(i).toString(16).padStart(2, '0')).join('')}`;
}
