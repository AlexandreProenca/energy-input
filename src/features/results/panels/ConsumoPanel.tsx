import { useEffect } from 'react';
import { CalendarClock, Gauge, Loader2, Zap } from 'lucide-react';
import { Callout, StatTile, fmt } from '@/ui/primitives';
import { aggregateMonthly, defaultAggregation, normalizeSeries } from '@/core/results/series';
import { isEnergyUnit, toKwh } from '@/core/results/units';
import type { Summary, Simulation } from '@/features/simulation/api';
import { BarChart } from '../charts/BarChart';
import { StackedBarChart } from '../charts/StackedBarChart';
import { corDoMedidor, rotuloDoMedidor, useResultsStore, type SerieCarregada } from '../resultsStore';
import { semAnoCompleto, usosFinaisEmKwh } from '../estado';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Consumo mensal em kWh de uma série de medidor, seja qual for a frequência que ela veio.
 *
 * Agregar aqui, em vez de exigir medidor mensal, não é preferência: a execução real
 * disponível gravou `EnergyTransfer:Facility` **por hora**, e nenhum dos medidores mensais
 * do preset `conta`. Um painel que só soubesse ler medidor mensal ficaria vazio diante de
 * dado que existe.
 */
export function mensalEmKwh(serie: SerieCarregada): { valores: number[]; descartados: number; convertivel: boolean } {
  if (!isEnergyUnit(serie.variable.units)) return { valores: [], descartados: 0, convertivel: false };
  const normalizada = normalizeSeries(serie.itens);
  const baldes = aggregateMonthly(normalizada, defaultAggregation(serie.variable));
  const valores = Array.from({ length: 12 }, (_, i) => {
    const balde = baldes.find((b) => b.index === i + 1);
    return balde ? (toKwh(balde.value, serie.variable.units) ?? 0) : 0;
  });
  return { valores, descartados: normalizada.dropped, convertivel: true };
}

/**
 * Pico de demanda elétrica em kW.
 *
 * A conversão olha a unidade em vez de dividir por mil às cegas. O resumo real traz `W`, mas
 * nada no contrato garante isso — e um pico já em `kW` dividido de novo apareceria como
 * 0,005 kW, um número plausível e errado por três ordens de grandeza. Unidade que não
 * reconhecemos devolve `null`, e o indicador mostra travessão.
 */
export function picoEmKw(picos?: readonly { resource: string; value: number; units: string }[]): number | null {
  const eletrico = picos?.find((p) => p.resource === 'Electricity' && p.value > 0);
  if (!eletrico) return null;
  const unidade = eletrico.units.trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (unidade === 'w') return eletrico.value / 1000;
  if (unidade === 'kw') return eletrico.value;
  if (unidade === 'mw') return eletrico.value * 1000;
  return null;
}

export function ConsumoPanel({ simulation, summary }: { simulation: Simulation; summary?: Summary }) {
  const { carregando, medidores, expirada, erro, carregarMedidores } = useResultsStore();

  useEffect(() => { void carregarMedidores(); }, [carregarMedidores, simulation.id]);

  // Dias de projeto simulam duas datas extremas. Um gráfico mensal ali desenharia dois meses
  // com dado e dez zerados, o que parece consumo nulo e não é.
  if (semAnoCompleto(simulation)) {
    return (
      <Painel titulo="Consumo anual">
        <Callout tone="warning" icon={<CalendarClock size={18} />} title="Não há consumo anual nesta execução">
          Dias de projeto dimensionam o sistema em duas datas extremas. Para consumo mensal,
          rode o modelo em modo climático (<span className="font-medium">annual</span>).
        </Callout>
      </Painel>
    );
  }

  const usos = summary ? usosFinaisEmKwh(summary.end_uses) : [];
  const convertiveis = medidores
    .map((m) => ({ medidor: m, mensal: mensalEmKwh(m) }))
    .filter((s) => s.mensal.convertivel);
  // Medidor zerado sai do gráfico — doze barras de altura nula não informam nada —, mas
  // **não** vira "nenhum medidor". São diagnósticos diferentes: um é resultado de
  // modelagem, o outro é saída não solicitada antes de simular.
  const series = convertiveis.filter((s) => s.mensal.valores.some((v) => v !== 0));
  const zerados = convertiveis.filter((s) => !s.mensal.valores.some((v) => v !== 0));
  const totalAnual = series.reduce((a, s) => a + s.mensal.valores.reduce((x, y) => x + y, 0), 0);
  const descartados = series.reduce((a, s) => a + s.mensal.descartados, 0);
  const pico = picoEmKw(summary?.peak_demand);

  return (
    <Painel titulo="Consumo anual">
      <div className="grid gap-2 sm:grid-cols-3">
        <StatTile
          label="Consumo anual medido"
          value={series.length ? fmt(totalAnual, 0) : '—'}
          unit={series.length ? 'kWh' : undefined}
          icon={<Zap size={13} />}
        />
        <StatTile
          label="Por uso final (resumo)"
          value={usos.length ? fmt(usos.reduce((a, u) => a + u.valor, 0), 0) : '—'}
          unit={usos.length ? 'kWh' : undefined}
          icon={<Gauge size={13} />}
        />
        <StatTile
          label="Pico de demanda elétrica"
          value={pico === null ? '—' : fmt(pico, 1)}
          unit={pico === null ? undefined : 'kW'}
        />
      </div>

      {/*
        A série expirou com o `.sql`, mas o resumo permanente sobrevive. É estado de
        interface, não erro: o painel encolhe para o que resta, e diz por quê.
      */}
      {expirada && (
        <Callout tone="info" title="A série horária desta execução expirou">
          Os gráficos mensais dependem do arquivo de resultados, que a retenção do serviço já
          apagou. O resumo por uso final, abaixo, é permanente e continua valendo.
        </Callout>
      )}
      {erro && <Callout tone="error" title="Não foi possível ler os medidores">{erro}</Callout>}

      {carregando && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Lendo os medidores da execução…
        </p>
      )}

      {!carregando && !expirada && (
        <section className="space-y-1">
          <h3 className="text-sm font-medium text-slate-700">Consumo por mês</h3>
          {series.length > 1 ? (
            <StackedBarChart
              label="Consumo mensal por medidor, em quilowatt-hora"
              unidade="kWh"
              rotulos={MESES}
              series={series.map((s) => ({
                nome: rotuloDoMedidor(s.medidor.variable.name),
                cor: corDoMedidor(s.medidor.variable.name),
                valores: s.mensal.valores,
              }))}
            />
          ) : (
            <BarChart
              label="Consumo mensal, em quilowatt-hora"
              unidade="kWh"
              barras={(series[0]?.mensal.valores ?? []).map((valor, i) => ({ rotulo: MESES[i], valor }))}
              vazio={series.length === 0 ? mensagemSemGrafico(zerados) : undefined}
            />
          )}
          {series.length === 1 && (
            <p className="text-xs text-slate-500">
              Medidor: {rotuloDoMedidor(series[0].medidor.variable.name)}
              {!series[0].medidor.completa && ' · série truncada pela paginação'}
            </p>
          )}
          {/*
            Hora sem dado não é hora de consumo zero. Omitir o número faria a soma parecer
            completa quando não é.
          */}
          {descartados > 0 && (
            <p className="text-xs text-amber-700">{descartados} horas sem dado foram desconsideradas.</p>
          )}
        </section>
      )}

      {summary && (
        <section className="space-y-1">
          <h3 className="text-sm font-medium text-slate-700">Por uso final</h3>
          <BarChart
            label="Consumo anual por uso final, em quilowatt-hora"
            unidade="kWh"
            barras={usos}
            vazio={usos.length === 0 ? 'Esta execução não registrou consumo em nenhum uso final.' : undefined}
          />
        </section>
      )}
    </Painel>
  );
}

/**
 * Por que não há gráfico mensal — e são dois motivos bem diferentes.
 *
 * "Nenhum medidor registrado" se resolve marcando a saída antes de simular. "Medidor
 * registrado e zerado no ano" é resultado de modelagem, e mandar o usuário mexer nas saídas
 * o faria procurar problema onde não há.
 */
function mensagemSemGrafico(zerados: { medidor: SerieCarregada }[]): string {
  if (zerados.length === 0) {
    return 'Esta execução não registrou nenhum medidor de energia. Marque "Estimativa mensal de consumo" na etapa Resultados do assistente antes de simular.';
  }
  const nomes = zerados.map((z) => rotuloDoMedidor(z.medidor.variable.name)).join(', ');
  return `A execução registrou ${zerados.length === 1 ? 'o medidor' : 'os medidores'} ${nomes}, mas ${zerados.length === 1 ? 'ele marcou' : 'eles marcaram'} zero o ano inteiro. Isso é resultado do modelo, não falta de saída — confira se há cargas e climatização nas zonas.`;
}

function Painel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
      {children}
    </section>
  );
}
