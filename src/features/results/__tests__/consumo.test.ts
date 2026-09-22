import { describe, expect, it } from 'vitest';
import { mensalEmKwh, picoEmKw } from '../panels/ConsumoPanel';
import type { SerieCarregada } from '../resultsStore';
import type { TimeSeriesPoint } from '@/core/results/types';

const serie = (
  itens: TimeSeriesPoint[],
  units: string | null = 'J',
  extra: Partial<SerieCarregada['variable']> = {},
): SerieCarregada => ({
  variable: { name: 'EnergyTransfer:Facility', key: '', frequency: 'hourly', units, aggregation: 'Sum', is_meter: true, ...extra },
  itens,
  completa: true,
});

/** `horas` horas de janeiro, todas com o mesmo valor. */
const janeiro = (horas: number, value: number): TimeSeriesPoint[] =>
  Array.from({ length: horas }, (_, i) => ({
    timestamp: null, month: 1, day: Math.floor(i / 24) + 1, hour: (i % 24) + 1, minute: 0, value,
  }));

describe('consumo mensal em kWh', () => {
  it('agrega série horária em doze meses, somando medidor', () => {
    // A execução real disponível gravou o medidor POR HORA, não por mês. Um painel que só
    // soubesse ler medidor mensal ficaria vazio diante de dado que existe.
    const { valores } = mensalEmKwh(serie(janeiro(24, 3_600_000)));
    expect(valores).toHaveLength(12);
    expect(valores[0]).toBeCloseTo(24, 6); // 24 × 1 kWh
    expect(valores.slice(1).every((v) => v === 0)).toBe(true);
  });

  it('recusa série cuja unidade não é de energia, em vez de converter errado', () => {
    // Temperatura em °C num gráfico de kWh seria um número plausível e sem sentido.
    const { convertivel, valores } = mensalEmKwh(serie(janeiro(4, 22), 'C', { is_meter: false, aggregation: 'Avg' }));
    expect(convertivel).toBe(false);
    expect(valores).toEqual([]);
  });

  it('conta as horas sem dado em vez de tratá-las como consumo zero', () => {
    // Somar como zero faria a soma anual parecer completa quando não é.
    const pontos = janeiro(4, 3_600_000);
    pontos[1] = { ...pontos[1], value: null };
    const { valores, descartados } = mensalEmKwh(serie(pontos));
    expect(descartados).toBe(1);
    expect(valores[0]).toBeCloseTo(3, 6);
  });

  it('mês sem nenhum ponto vale zero na barra, e não buraco no eixo', () => {
    // Diferente do gráfico de série: aqui as doze posições existem sempre, senão as barras
    // deslizariam e "fevereiro" apareceria sob o rótulo de março.
    const { valores } = mensalEmKwh(serie(janeiro(2, 3_600_000)));
    expect(valores[1]).toBe(0);
    expect(valores).toHaveLength(12);
  });

  it('faz média, e não soma, quando a variável não é medidor', () => {
    // `defaultAggregation` decide pelo que o serviço diz da série, não pelo nome.
    const { valores } = mensalEmKwh(serie(janeiro(4, 3_600_000), 'J', { is_meter: false, aggregation: 'Avg' }));
    expect(valores[0]).toBeCloseTo(1, 6); // média de 1 kWh, não 4
  });
});

describe('por que não há gráfico mensal', () => {
  it('medidor zerado no ano não é o mesmo que medidor ausente', () => {
    // São diagnósticos diferentes, com correções opostas: um se resolve marcando a saída
    // antes de simular, o outro é resultado do modelo. Confundi-los manda o usuário mexer
    // nas saídas para procurar um problema que não está lá.
    const zerada = mensalEmKwh(serie(janeiro(24, 0)));
    expect(zerada.convertivel).toBe(true);
    expect(zerada.valores.every((v) => v === 0)).toBe(true);
    // Foi exatamente o caso real: `EnergyTransfer:Facility` existe na execução disponível,
    // com 8 760 pontos, e marca zero em todos eles.
  });
});

describe('pico de demanda em kW', () => {
  it('converte pela unidade declarada, não por divisão fixa', () => {
    // O resumo real traz W, mas nada no contrato garante isso. Dividir por mil às cegas um
    // pico já em kW o mostraria como 0,005 kW — plausível e errado por três ordens.
    expect(picoEmKw([{ resource: 'Electricity', value: 5250, units: 'W' }])).toBeCloseTo(5.25, 6);
    expect(picoEmKw([{ resource: 'Electricity', value: 5.25, units: 'kW' }])).toBeCloseTo(5.25, 6);
    expect(picoEmKw([{ resource: 'Electricity', value: 0.00525, units: 'MW' }])).toBeCloseTo(5.25, 6);
  });

  it('devolve nulo em unidade desconhecida, em vez de arriscar um fator', () => {
    expect(picoEmKw([{ resource: 'Electricity', value: 5250, units: 'BTU/h' }])).toBeNull();
  });

  it('ignora recurso zerado e ausência de pico elétrico', () => {
    // O motor devolve todos os recursos, quase todos zerados.
    expect(picoEmKw([{ resource: 'Electricity', value: 0, units: 'W' }])).toBeNull();
    expect(picoEmKw([{ resource: 'Natural Gas', value: 900, units: 'W' }])).toBeNull();
    expect(picoEmKw(undefined)).toBeNull();
  });

  it('bate com o pico da execução real', () => {
    // 5250 W na fixture; o painel mostra 5,3 kW.
    expect(picoEmKw([{ resource: 'Electricity', value: 5250, units: 'W' }])).toBeCloseTo(5.25, 6);
  });
});
