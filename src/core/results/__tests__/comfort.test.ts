import { describe, expect, it } from 'vitest';
import {
  ADAPTIVE_MAX_OUTDOOR,
  ADAPTIVE_MIN_OUTDOOR,
  adaptiveBand,
  adaptiveDiscomfort,
  hoursOutsideBand,
  runningMeanOutdoor,
  summaryComfortHours,
} from '../comfort';
import { normalizeSeries } from '../series';
import type { NormalizedPoint, NormalizedSeries } from '../series';
import type { TimeSeriesPoint } from '../types';
import resumo from '../__fixtures__/summary.json';

const ponto = (value: number, day = 1, month = 1, hour = 1): NormalizedPoint => ({ month, day, hour, value });
const FIXA = { min: 18, max: 26 };

describe('horas fora da faixa fixa', () => {
  it('separa frio de quente, porque as decisões de projeto são opostas', () => {
    // 800 horas quentes pedem sombreamento e ventilação; 800 frias pedem isolamento e
    // ganho solar. Um agregado único esconderia em qual direção o edifício falha.
    const d = hoursOutsideBand([ponto(10), ponto(15), ponto(22), ponto(30), ponto(40)], FIXA);
    expect(d.cold).toBe(2);
    expect(d.hot).toBe(2);
    expect(d.comfortable).toBe(1);
    expect(d.total).toBe(5);
  });

  it('série inteiramente dentro da faixa não gera desconforto nenhum', () => {
    const d = hoursOutsideBand([18, 20, 22, 24, 26].map(v => ponto(v)), FIXA);
    expect(d.cold).toBe(0);
    expect(d.hot).toBe(0);
    expect(d.comfortable).toBe(5);
  });

  it('série inteiramente acima não produz nenhuma hora fria', () => {
    // Contraprova: se `cold` e `hot` estivessem trocados, este teste pegaria.
    const d = hoursOutsideBand([30, 35, 40].map(v => ponto(v)), FIXA);
    expect(d.cold).toBe(0);
    expect(d.hot).toBe(3);
  });

  it('os limites da faixa são confortáveis, não desconfortáveis', () => {
    const d = hoursOutsideBand([ponto(18), ponto(26)], FIXA);
    expect(d.comfortable).toBe(2);
  });

  it('classifica cada hora para o carpete recolorir', () => {
    expect(hoursOutsideBand([ponto(10), ponto(22), ponto(30)], FIXA).hourly).toEqual(['frio', 'ok', 'quente']);
  });

  it('horas sem dado não contam nem como conforto nem como desconforto', () => {
    // `normalizeSeries` já as separou em `dropped`; elas não chegam aqui, e o total
    // classificado tem de refletir só o que foi medido.
    const pontos: TimeSeriesPoint[] = [
      { timestamp: null, month: 1, day: 1, hour: 1, minute: 0, value: 10 },
      { timestamp: null, month: 1, day: 1, hour: 2, minute: 0, value: null },
      { timestamp: null, month: 1, day: 1, hour: 3, minute: 0, value: 30 },
    ];
    const serie = normalizeSeries(pontos);
    const d = hoursOutsideBand(serie.points, FIXA);
    expect(serie.dropped).toBe(1);
    expect(d.total).toBe(2);
    expect(d.cold + d.hot + d.comfortable).toBe(2);
  });
});

describe('faixa adaptativa', () => {
  it('centra em 0,31·T̄ext + 17,8 com tolerância de ±3,5 K', () => {
    const faixa = adaptiveBand(20)!;
    expect((faixa.min + faixa.max) / 2).toBeCloseTo(0.31 * 20 + 17.8, 6);
    expect(faixa.max - faixa.min).toBeCloseTo(7, 6);
  });

  it('devolve nulo fora do domínio de validade, em vez de extrapolar calado', () => {
    // Extrapolar produziria uma faixa com aparência de resultado e sem lastro: a 5 °C o
    // centro cairia para 19,4 °C, declarando confortável o que ninguém acha.
    expect(adaptiveBand(5)).toBeNull();
    expect(adaptiveBand(40)).toBeNull();
    expect(adaptiveBand(NaN)).toBeNull();
    // E vale exatamente nas bordas do domínio.
    expect(adaptiveBand(ADAPTIVE_MIN_OUTDOOR)).not.toBeNull();
    expect(adaptiveBand(ADAPTIVE_MAX_OUTDOOR)).not.toBeNull();
  });

  it('a tolerância é configurável, para a aceitabilidade de 90%', () => {
    expect(adaptiveBand(20, 2.5)!.max - adaptiveBand(20, 2.5)!.min).toBeCloseTo(5, 6);
  });
});

describe('média externa predominante', () => {
  it('pesa o dia mais recente acima de cada dia anterior', () => {
    // O mesmo conjunto de dias, só invertida a ordem: se a recência não pesasse, as duas
    // médias seriam iguais. Comparar conjuntos DIFERENTES mediria magnitude, não ordem —
    // três dias a 30 °C pesam mais que um só, ainda que o recente valha mais sozinho.
    const recenteQuente = runningMeanOutdoor([30, 10])!;
    const recenteFrio = runningMeanOutdoor([10, 30])!;
    expect(recenteQuente).toBeGreaterThan(recenteFrio);
    // E a média fica entre os extremos, nunca fora deles.
    expect(recenteQuente).toBeLessThan(30);
    expect(recenteFrio).toBeGreaterThan(10);
  });

  it('um dia recente não supera sozinho vários dias anteriores contrários', () => {
    // Contraponto do teste acima, para o peso não ser lido como "só o último dia importa":
    // com alpha 0,8 os três dias anteriores somam 1,952 contra o peso 1,0 do mais recente.
    expect(runningMeanOutdoor([30, 10, 10, 10])!).toBeLessThan(runningMeanOutdoor([10, 30, 30, 30])!);
  });

  it('pula dia sem dado mantendo a posição, em vez de promover os anteriores', () => {
    // Compactar a lista faria o dia de anteontem pesar como o de ontem, e a faixa seguiria
    // um clima que não houve. Com a posição preservada: (30·1 + 10·0,64) / 1,64 = 22,195.
    expect(runningMeanOutdoor([30, NaN, 10])).toBeCloseTo(22.1951, 4);
    // Contraprova: compactando daria (30 + 10·0,8) / 1,8 = 21,111 — valor diferente.
    expect(runningMeanOutdoor([30, NaN, 10])).not.toBeCloseTo(21.1111, 4);
    expect(runningMeanOutdoor([30, 10])).toBeCloseTo(21.1111, 4);
  });

  it('com todos os dias iguais, a média é esse valor', () => {
    expect(runningMeanOutdoor([20, 20, 20, 20])).toBeCloseTo(20, 6);
  });

  it('sem histórico devolve nulo, em vez de inventar uma média', () => {
    expect(runningMeanOutdoor([])).toBeNull();
    expect(runningMeanOutdoor([NaN, NaN])).toBeNull();
  });
});

/** Série sintética de `dias` dias × 24 h, com valor constante por dia. */
function serieDiaria(valores: number[]): NormalizedSeries {
  const points: NormalizedPoint[] = [];
  valores.forEach((v, d) => {
    for (let h = 1; h <= 24; h++) points.push({ month: 1, day: d + 1, hour: h, value: v });
  });
  return { points, dropped: 0, leap: false };
}

describe('desconforto adaptativo', () => {
  it('usa a faixa do dia e conta os dias em que caiu para a fixa', () => {
    // Externa a 20 °C: faixa adaptativa 20,5–27,5. Interna a 19 °C fica FRIA no adaptativo
    // e CONFORTÁVEL na fixa (18–26) — é o que distingue os dois critérios.
    const externa = serieDiaria(Array(10).fill(20));
    const interna = serieDiaria(Array(10).fill(19));
    const r = adaptiveDiscomfort(interna, externa, FIXA);
    // O primeiro dia não tem histórico anterior, então cai para a faixa fixa.
    expect(r.fallbackDays).toBe(1);
    expect(r.bands.size).toBe(9);
    // 24 h do dia 1 pela faixa fixa (confortável) + 216 h pelos demais dias (frias).
    expect(r.comfortable).toBe(24);
    expect(r.cold).toBe(216);
    expect(r.hot).toBe(0);
  });

  it('cai para a faixa fixa quando a externa sai do domínio, e diz em quantos dias', () => {
    // Externa a 5 °C está abaixo dos 10 °C de validade: o modelo não se aplica em nenhum
    // dia, e o resultado tem de ser o da faixa fixa — com o aviso de que foi.
    const externa = serieDiaria(Array(5).fill(5));
    const interna = serieDiaria(Array(5).fill(22));
    const r = adaptiveDiscomfort(interna, externa, FIXA);
    expect(r.fallbackDays).toBe(5);
    expect(r.bands.size).toBe(0);
    expect(r.comfortable).toBe(120); // 22 °C está dentro de 18–26
  });

  it('acompanha o clima: a mesma temperatura interna muda de veredito com a externa', () => {
    // 27 °C é quente num inverno de 12 °C (faixa 18–25) e confortável num verão de 30 °C
    // (faixa 23,6–30,6). É exatamente o que o modelo adaptativo existe para capturar.
    const interna = serieDiaria(Array(8).fill(27));
    const inverno = adaptiveDiscomfort(interna, serieDiaria(Array(8).fill(12)), FIXA);
    const verao = adaptiveDiscomfort(interna, serieDiaria(Array(8).fill(30)), FIXA);
    expect(inverno.hot).toBe(8 * 24); // todos os dias quentes
    // No verão, só o primeiro dia é quente — e por causa da faixa FIXA, que vale onde o
    // modelo ainda não tem histórico. Os outros sete ficam confortáveis pela adaptativa.
    expect(verao.hot).toBe(24);
    expect(verao.fallbackDays).toBe(1);
    expect(verao.comfortable).toBe(7 * 24);
    expect(verao.comfortable).toBeGreaterThan(inverno.comfortable);
  });
});

describe('alinhamento entre as duas séries', () => {
  /** Série de um valor por dia, em dias do ano dados por [mês, dia]. */
  const porData = (datas: [number, number][], valor: number, leap: boolean): NormalizedSeries => ({
    points: datas.flatMap(([month, day]) =>
      Array.from({ length: 24 }, (_, i) => ({ month, day, hour: i + 1, value: valor }))),
    dropped: 0,
    leap,
  });

  it('conta como fallback os dias internos que a série externa nem cobre', () => {
    // Antes da revisão, `fallbackDays` era contado percorrendo os dias da série EXTERNA:
    // se ela cobrisse 3 dias e a interna 10, os 7 dias sem faixa adaptativa não apareciam.
    // O painel anunciaria "1 dia na faixa fixa" para 8 dias que usaram a faixa fixa.
    const interna = serieDiaria(Array(10).fill(19));
    const externa = serieDiaria(Array(3).fill(20));
    const r = adaptiveDiscomfort(interna, externa, FIXA);
    expect(r.fallbackDays).toBe(8); // dia 1 (sem histórico) + dias 4 a 10 (sem externa)
    expect(r.bands.size).toBe(2); // só os dias 2 e 3 tiveram base
  });

  it('não desalinha quando só uma das séries contém 29 de fevereiro', () => {
    // A externa recortada sem 29/2 usaria leap=false e chamaria 1º de março de dia 60,
    // enquanto a interna, com 29/2, o chamaria de 61: a faixa de um dia seria aplicada ao
    // outro do 1º de março em diante. As duas séries têm de compartilhar o mesmo calendário.
    const fev = Array.from({ length: 9 }, (_, i) => [2, 20 + i] as [number, number]); // 20 a 28
    const externaDatas: [number, number][] = [...fev, [3, 1]];
    const internaDatas: [number, number][] = [...fev, [2, 29], [3, 1]];
    // Externa a 20 °C ⇒ faixa adaptativa 20,5–27,5; interna a 19 °C é FRIA nela e
    // CONFORTÁVEL na fixa (18–26). O veredito do 1º de março denuncia o desalinhamento.
    const r = adaptiveDiscomfort(porData(internaDatas, 19, true), porData(externaDatas, 20, false), FIXA);
    expect(r.bands.has(61)).toBe(true); // 1º de março em ano bissexto
    expect(r.cold).toBeGreaterThan(0);
  });
});

describe('indicadores do resumo permanente', () => {
  it('organiza os três nomes conhecidos da fixture real', () => {
    const c = summaryComfortHours(resumo.comfort);
    expect(c.heatingSetpointNotMet).toBe(0);
    expect(c.coolingSetpointNotMet).toBe(0);
    expect(c.ashrae55NotComfortable).toBe(0);
  });

  it('distingue "não reportado" de "zero horas"', () => {
    // São afirmações diferentes, e só a segunda pode ir para a tela como número.
    const vazio = summaryComfortHours([]);
    expect(vazio.ashrae55NotComfortable).toBeNull();
    const zero = summaryComfortHours([{ name: 'simple_ashrae_55_not_comfortable', value: 0, units: 'Hours' }]);
    expect(zero.ashrae55NotComfortable).toBe(0);
  });

  it('recusa valor que não venha em horas', () => {
    // O número só significa algo com a unidade certa; aceitar cegamente poria um valor em
    // graus num indicador rotulado "horas".
    const c = summaryComfortHours([{ name: 'simple_ashrae_55_not_comfortable', value: 42, units: 'C' }]);
    expect(c.ashrae55NotComfortable).toBeNull();
  });

  it('os dois indicadores de setpoint deram zero na execução real, como o NoLimit prevê', () => {
    // Esta é a evidência que justifica o indicador calculado ser o principal: com
    // `IdealLoadsAirSystem` sem limite, o sistema atende o setpoint em toda hora.
    const c = summaryComfortHours(resumo.comfort);
    expect(c.heatingSetpointNotMet).toBe(0);
    expect(c.coolingSetpointNotMet).toBe(0);
  });
});
