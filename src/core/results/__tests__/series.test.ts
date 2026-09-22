import { describe, expect, it } from 'vitest';
import {
  aggregateDaily,
  aggregateMonthly,
  dayOfYear,
  defaultAggregation,
  downsampleEnvelope,
  normalizeSeries,
  type NormalizedPoint,
} from '../series';
import { formatUnit, isEnergyUnit, normalizeUnit, toKwh } from '../units';
import operativa from '../__fixtures__/serie-temperatura-operativa.json';
import medidor from '../__fixtures__/serie-medidor-energia.json';
import type { TimeSeriesPoint } from '../types';

/** Série sintética horária: `dias` dias de 24 horas, valor dado por `f(dia, hora)`. */
function horas(dias: number, f: (dia: number, hora: number) => number | null): TimeSeriesPoint[] {
  const pontos: TimeSeriesPoint[] = [];
  for (let d = 0; d < dias; d++) {
    // Calendário simples de 31 dias por mês basta para exercitar os baldes.
    const month = Math.floor(d / 31) + 1;
    const day = (d % 31) + 1;
    for (let h = 1; h <= 24; h++) {
      pontos.push({ timestamp: null, month, day, hour: h, minute: 0, value: f(d, h) });
    }
  }
  return pontos;
}

describe('normalização', () => {
  it('descarta pontos sem valor e informa quantos', () => {
    // O contrato declara todo campo anulável, e `value` vem nulo quando o motor não
    // registrou a hora. Somar como zero afundaria a média; descartar calado mentiria.
    const { points, dropped } = normalizeSeries(horas(2, (_, h) => (h === 5 ? null : 20)));
    expect(points).toHaveLength(46);
    expect(dropped).toBe(2);
  });

  it('descarta ponto sem posição de calendário', () => {
    const { points, dropped } = normalizeSeries([
      { timestamp: null, month: null, day: 1, hour: 1, minute: 0, value: 1 },
      { timestamp: null, month: 1, day: 1, hour: 1, minute: 0, value: 2 },
    ]);
    expect(points).toHaveLength(1);
    expect(dropped).toBe(1);
  });

  it('descarta posição fora de faixa em vez de explodir ou aceitá-la', () => {
    // A série vem de fora: uma linha corrompida não deve derrubar o painel, mas também
    // não pode ser aceita — colidiria com um dia legítimo no balde.
    const { points, dropped } = normalizeSeries([
      { timestamp: null, month: 13, day: 1, hour: 1, minute: 0, value: 1 },
      { timestamp: null, month: 1, day: 0, hour: 1, minute: 0, value: 2 },
      { timestamp: null, month: 1, day: 1, hour: 25, minute: 0, value: 3 },
      { timestamp: null, month: 1.5, day: 1, hour: 1, minute: 0, value: 4 },
      { timestamp: null, month: 1, day: 1, hour: 1, minute: 0, value: 5 },
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(5);
    expect(dropped).toBe(4);
  });

  it('detecta ano bissexto pela presença de 29 de fevereiro, não pelo ano do carimbo', () => {
    // O ano do `timestamp` vem do arquivo climático (2013 nas fixtures) e não corresponde
    // ao calendário da execução — inferir bissexto dele erraria.
    const comum = normalizeSeries([{ timestamp: null, month: 3, day: 1, hour: 1, minute: 0, value: 1 }]);
    const bissexto = normalizeSeries([{ timestamp: null, month: 2, day: 29, hour: 1, minute: 0, value: 1 }]);
    expect(comum.leap).toBe(false);
    expect(bissexto.leap).toBe(true);
  });
});

describe('dia do ano', () => {
  it('mapeia os limites de mês corretamente', () => {
    expect(dayOfYear(1, 1)).toBe(1);
    expect(dayOfYear(12, 31)).toBe(365);
    expect(dayOfYear(3, 1)).toBe(60);
  });

  it('recusa mês fora de faixa em vez de colidir com janeiro', () => {
    // Antes da revisão do PR isto devolvia 1 em silêncio: mês 13 caía num `?? 0` e somava
    // com 1º de janeiro no mesmo balde. Erro de calendário tem de ser ruidoso.
    expect(() => dayOfYear(13, 1)).toThrow(RangeError);
    expect(() => dayOfYear(0, 1)).toThrow(RangeError);
    expect(dayOfYear(12, 31)).toBe(365);
  });

  it('desloca um dia depois de fevereiro em ano bissexto, e só depois', () => {
    expect(dayOfYear(2, 28, true)).toBe(59); // antes: inalterado
    expect(dayOfYear(3, 1, true)).toBe(61); // depois: +1
    expect(dayOfYear(12, 31, true)).toBe(366);
  });
});

describe('agregação', () => {
  it('trata a hora 24 como o fim do dia, sem criar um 25º balde nem vazar para o dia seguinte', () => {
    // A armadilha central: a hora 24 pertence ao dia anterior. Se fosse tratada como hora 0
    // do dia seguinte, o primeiro dia teria 23 horas e a série inteira deslizaria um dia.
    const dias = aggregateDaily(normalizeSeries(horas(3, () => 1)), 'sum');
    expect(dias).toHaveLength(3);
    expect(dias.map(d => d.count)).toEqual([24, 24, 24]);
    expect(dias.map(d => d.index)).toEqual([1, 2, 3]);
  });

  it('soma medidores e faz média de temperaturas, pelo que o serviço diz da série', () => {
    // Deduzir pelo nome erraria: `…Supply Air Total Cooling Energy` não tem "Temperature"
    // no nome e é energia; e qualquer variável nova cairia no galho errado.
    expect(defaultAggregation({ aggregation: 'Sum', is_meter: true })).toBe('sum');
    expect(defaultAggregation({ aggregation: 'Avg', is_meter: false })).toBe('mean');
    expect(defaultAggregation({ aggregation: 'Summed', is_meter: false })).toBe('sum');
  });

  it('conserva o total ao agregar: a soma dos meses é a soma dos pontos', () => {
    // Contraprova de deriva nas bordas de balde — se um ponto caísse fora, o total mudaria.
    const serie = normalizeSeries(horas(62, (d, h) => d + h));
    const totalPontos = serie.points.reduce((a, p) => a + p.value, 0);
    const meses = aggregateMonthly(serie, 'sum');
    expect(meses.reduce((a, m) => a + m.value, 0)).toBeCloseTo(totalPontos, 6);
    expect(meses.reduce((a, m) => a + m.count, 0)).toBe(serie.points.length);
  });

  it('agrega sobre o calendário real, e não sobre meses de tamanho fixo', () => {
    // Os geradores sintéticos deste arquivo usam meses de 31 dias por simplicidade; este
    // teste atravessa fevereiro com datas reais para provar que os baldes diários caem no
    // dia do ano certo — 28 de fevereiro é 59, 1º de março é 60.
    const serie = normalizeSeries([
      { timestamp: null, month: 2, day: 28, hour: 1, minute: 0, value: 1 },
      { timestamp: null, month: 3, day: 1, hour: 1, minute: 0, value: 2 },
      { timestamp: null, month: 12, day: 31, hour: 1, minute: 0, value: 3 },
    ]);
    expect(aggregateDaily(serie, 'sum').map(d => d.index)).toEqual([59, 60, 365]);
  });

  it('não inventa balde para dia sem nenhum ponto', () => {
    // Zero e "sem dado" são coisas diferentes: um dia sem medição não é um dia de consumo
    // nulo, e desenhá-lo como zero mentiria no gráfico.
    const serie = normalizeSeries([
      { timestamp: null, month: 1, day: 1, hour: 1, minute: 0, value: 5 },
      { timestamp: null, month: 1, day: 3, hour: 1, minute: 0, value: 7 },
    ]);
    expect(aggregateDaily(serie, 'sum').map(d => d.index)).toEqual([1, 3]);
  });

  it('aplica mín e máx além de soma e média', () => {
    const serie = normalizeSeries(horas(1, (_, h) => h));
    expect(aggregateDaily(serie, 'min')[0].value).toBe(1);
    expect(aggregateDaily(serie, 'max')[0].value).toBe(24);
    expect(aggregateDaily(serie, 'mean')[0].value).toBeCloseTo(12.5, 6);
  });
});

describe('reamostragem por envelope', () => {
  it('preserva o pico anual, que a decimação ingênua perderia', () => {
    // O pico é o número que o engenheiro procura. Uma série de 8760 pontos reduzida a 800
    // por amostragem o perde com alta probabilidade — aqui ele tem de sobreviver.
    const pontos: NormalizedPoint[] = Array.from({ length: 8760 }, (_, i) => ({
      month: 1, day: 1, hour: 1, value: i === 4321 ? 999 : Math.sin(i / 100),
    }));
    const baldes = downsampleEnvelope(pontos, 800);
    expect(baldes.length).toBeLessThanOrEqual(800);
    expect(Math.max(...baldes.map(b => b.max))).toBe(999);
    // Contraprova: a decimação de 1 a cada k NÃO pega o índice 4321 com k = 10.
    const ingenua = pontos.filter((_, i) => i % 10 === 0);
    expect(Math.max(...ingenua.map(p => p.value))).toBeLessThan(999);
  });

  it('preserva também o vale', () => {
    const pontos: NormalizedPoint[] = Array.from({ length: 1000 }, (_, i) => ({
      month: 1, day: 1, hour: 1, value: i === 777 ? -50 : 1,
    }));
    expect(Math.min(...downsampleEnvelope(pontos, 50).map(b => b.min))).toBe(-50);
  });

  it('devolve exatamente os baldes pedidos, com x contíguo de 0 a n-1', () => {
    // O gráfico posiciona pelo `x`. Um salto viraria lacuna visual onde não há lacuna de
    // dado, e menos baldes que o pedido encolheria a curva sem aviso.
    const pontos: NormalizedPoint[] = Array.from({ length: 8760 }, (_, i) => ({ month: 1, day: 1, hour: 1, value: i }));
    for (const n of [1, 7, 100, 800, 8759]) {
      const baldes = downsampleEnvelope(pontos, n);
      expect(baldes).toHaveLength(n);
      expect(baldes.map(b => b.x)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });

  it('todo ponto entra em exatamente um balde', () => {
    const pontos: NormalizedPoint[] = Array.from({ length: 8760 }, () => ({ month: 1, day: 1, hour: 1, value: 1 }));
    expect(downsampleEnvelope(pontos, 800).reduce((a, b) => a + b.count, 0)).toBe(8760);
  });

  it('é identidade quando há menos pontos que baldes', () => {
    const pontos: NormalizedPoint[] = [1, 2, 3].map(value => ({ month: 1, day: 1, hour: 1, value }));
    expect(downsampleEnvelope(pontos, 100).map(b => b.mean)).toEqual([1, 2, 3]);
  });

  it('devolve lista vazia em entrada vazia ou baldes não positivos', () => {
    // Sem isto, o gráfico receberia NaN e desenharia "M NaN NaN".
    expect(downsampleEnvelope([], 10)).toEqual([]);
    expect(downsampleEnvelope([{ month: 1, day: 1, hour: 1, value: 1 }], 0)).toEqual([]);
    expect(downsampleEnvelope([{ month: 1, day: 1, hour: 1, value: 1 }], -5)).toEqual([]);
  });
});

describe('unidades', () => {
  it('converte energia e recusa o que não é energia', () => {
    expect(toKwh(3_600_000, 'J')).toBe(1);
    expect(toKwh(1, 'GJ')).toBeCloseTo(277.7778, 4);
    expect(toKwh(1, 'kWh')).toBe(1);
    // Água sai em m3 na MESMA lista de end_uses que a energia em GJ. Converter cego mente.
    expect(toKwh(10, 'm3')).toBeNull();
    expect(toKwh(25, 'C')).toBeNull();
    expect(toKwh(1, 'parsec')).toBeNull();
    expect(isEnergyUnit('GJ')).toBe(true);
    expect(isEnergyUnit('m3')).toBe(false);
  });

  it('tolera as grafias que o motor usa para a mesma unidade', () => {
    // O EnergyPlus escreve `J` num lugar e `[J]` noutro, com caixa e espaço inconsistentes.
    for (const u of ['J', '[J]', ' j ', 'j']) expect(toKwh(3_600_000, u)).toBe(1);
    expect(normalizeUnit('[GJ] ')).toBe('gj');
  });

  it('não converte valor ausente nem não finito', () => {
    expect(toKwh(null, 'J')).toBeNull();
    expect(toKwh(undefined, 'J')).toBeNull();
    expect(toKwh(NaN, 'J')).toBeNull();
    expect(toKwh(Infinity, 'J')).toBeNull();
  });

  it('formata para pt-BR e devolve o desconhecido como veio, sem inventar', () => {
    expect(formatUnit('C')).toBe('°C');
    expect(formatUnit('m2')).toBe('m²');
    expect(formatUnit('Hours')).toBe('h');
    expect(formatUnit('parsec')).toBe('parsec');
  });
});

describe('sobre as fixtures reais', () => {
  it('a série anual de temperatura agrega sem descartar nada', () => {
    const serie = normalizeSeries(operativa.itens as TimeSeriesPoint[]);
    expect(serie.dropped).toBe(0);
    expect(serie.leap).toBe(false);
    const dias = aggregateDaily(serie, defaultAggregation(operativa.variable));
    // A fixture guarda 72 pontos (3 dias) do ano; o formato é o que importa, não o volume.
    expect(dias).toHaveLength(3);
    expect(dias.every(d => d.count === 24)).toBe(true);
  });

  it('o medidor real é somado, a temperatura real é mediada', () => {
    expect(defaultAggregation(medidor.variable)).toBe('sum');
    expect(defaultAggregation(operativa.variable)).toBe('mean');
  });
});
