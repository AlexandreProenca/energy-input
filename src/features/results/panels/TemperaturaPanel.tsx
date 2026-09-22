import { useEffect, useMemo } from 'react';
import { CalendarClock, Loader2, Thermometer } from 'lucide-react';
import { Callout, Field, StatTile, fmt } from '@/ui/primitives';
import { aggregateDaily, aggregateMonthly, dayOfYear, normalizeSeries } from '@/core/results/series';
import { carpetCells } from '@/core/results/plot';
import type { Simulation } from '@/features/simulation/api';
import { LineChart } from '../charts/LineChart';
import { CarpetPlot } from '../charts/CarpetPlot';
import { useResultsStore, type SerieCarregada } from '../resultsStore';
import { semAnoCompleto } from '../estado';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Prepara a série de temperatura para os dois desenhos.
 *
 * A curva mostra a amplitude de cada dia: mínimo, máximo e média das 24 horas. Só a média
 * esconderia a amplitude, que é justamente o que revela inércia térmica e ganho solar.
 */
export function prepararTemperatura(serie: SerieCarregada) {
  const normalizada = normalizeSeries(serie.itens);
  // Agrupado pelo dia do calendário, e não por fatia de índice. `downsampleEnvelope` divide
  // a lista em partes iguais, o que só coincide com os dias quando a série está completa:
  // com horas faltando, os baldes escorregam e um deles mistura o fim de um dia com o começo
  // do seguinte — e o rótulo "amplitude do dia" passa a ser falso.
  const min = aggregateDaily(normalizada, 'min');
  const max = aggregateDaily(normalizada, 'max');
  const media = aggregateDaily(normalizada, 'mean');
  return {
    normalizada,
    envelope: media.map((b, i) => ({
      x: i, min: min[i].value, max: max[i].value, mean: b.value, count: b.count,
    })),
    celulas: carpetCells(
      normalizada.points.map((p) => ({ hour: p.hour, value: p.value })),
      (i) => {
        const p = normalizada.points[i];
        return dayOfYear(p.month, p.day, normalizada.leap) - 1;
      },
    ),
    mensal: aggregateMonthly(normalizada, 'mean').map((b) => ({ mes: b.index, valor: b.value })),
    extremos: normalizada.points.length === 0 ? undefined : {
      min: Math.min(...min.map((b) => b.value)),
      max: Math.max(...max.map((b) => b.value)),
      media: normalizada.points.reduce((a, p) => a + p.value, 0) / normalizada.points.length,
    },
  };
}

export function TemperaturaPanel({ simulation }: { simulation: Simulation }) {
  // Um seletor por campo: assinar o store inteiro faria o componente redesenhar a cada
  // mudança, inclusive nas dos medidores, carregando arrays de 8 760 pontos sem necessidade.
  const interna = useResultsStore((s) => s.interna);
  const externa = useResultsStore((s) => s.externa);
  const zonas = useResultsStore((s) => s.zonas);
  const zonaEscolhida = useResultsStore((s) => s.zonaEscolhida);
  const carregandoTemperatura = useResultsStore((s) => s.carregandoTemperatura);
  const expirada = useResultsStore((s) => s.expirada);
  const erro = useResultsStore((s) => s.erro);
  const carregarTemperaturas = useResultsStore((s) => s.carregarTemperaturas);

  useEffect(() => { void carregarTemperaturas(); }, [carregarTemperaturas, simulation.id]);

  const preparada = useMemo(() => (interna ? prepararTemperatura(interna) : undefined), [interna]);
  const preparadaExterna = useMemo(() => (externa ? prepararTemperatura(externa) : undefined), [externa]);

  if (semAnoCompleto(simulation)) {
    return (
      <Painel>
        <Callout tone="warning" icon={<CalendarClock size={18} />} title="Não há perfil anual nesta execução">
          Dias de projeto simulam duas datas extremas. O perfil de temperatura ao longo do ano
          exige execução climática (<span className="font-medium">annual</span>).
        </Callout>
      </Painel>
    );
  }

  // Quinto estado, previsto desde a T006: a série vive com o `eplusout.sql`, e a retenção do
  // serviço o apaga. Não é erro — a simulação existe, e o resumo permanente continua valendo.
  if (expirada) {
    return (
      <Painel>
        <Callout tone="info" title="A série horária desta execução expirou">
          O perfil de temperatura depende do arquivo de resultados, que a retenção do serviço
          já apagou. Os indicadores do resumo permanente continuam disponíveis nos outros
          painéis.
        </Callout>
      </Painel>
    );
  }

  return (
    <Painel>
      {zonas.length > 1 && (
        <Field label="Zona térmica" hint="A execução registrou a temperatura em mais de uma zona.">
          <select
            className="input"
            value={zonaEscolhida ?? ''}
            onChange={(e) => void carregarTemperaturas(e.target.value)}
          >
            <option value="" disabled>Escolha uma zona</option>
            {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </Field>
      )}

      {carregandoTemperatura && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Lendo a temperatura operativa…
        </p>
      )}
      {erro && <Callout tone="error" title="Não foi possível ler a temperatura">{erro}</Callout>}

      {!carregandoTemperatura && !interna && !erro && (
        <Callout tone="info" title="Esta execução não registrou a temperatura operativa">
          Marque <span className="font-medium">Conforto (temperatura e umidade)</span> na etapa
          Resultados do assistente antes de simular. Projetos novos já vêm com ela marcada.
        </Callout>
      )}

      {preparada && interna && (
        <>
          {/*
            `Math.min()` de lista vazia é `Infinity`, e apareceria assim no indicador. Série
            inteiramente sem dado é raro, não impossível — `normalizeSeries` descarta hora
            sem valor, e nada garante que sobre alguma.
          */}
          <div className="grid gap-2 sm:grid-cols-3">
            <StatTile label="Mínima do ano" value={preparada.extremos ? fmt(preparada.extremos.min, 1) : '—'} unit={preparada.extremos ? '°C' : undefined} icon={<Thermometer size={13} />} />
            <StatTile label="Média do ano" value={preparada.extremos ? fmt(preparada.extremos.media, 1) : '—'} unit={preparada.extremos ? '°C' : undefined} />
            <StatTile label="Máxima do ano" value={preparada.extremos ? fmt(preparada.extremos.max, 1) : '—'} unit={preparada.extremos ? '°C' : undefined} />
          </div>

          <section className="space-y-1">
            <h3 className="text-sm font-medium text-slate-700">
              Temperatura operativa ao longo do ano{interna.variable.key && ` · ${interna.variable.key}`}
            </h3>
            <LineChart
              label={`Temperatura operativa diária em ${interna.variable.key || 'zona única'}, com banda de mínima e máxima`}
              unidade="°C"
              baldes={preparada.envelope}
              rotulosX={MESES}
            />
            <p className="text-xs text-slate-500">
              A faixa clara é a amplitude do dia; a linha é a média diária.
              {preparada.normalizada.dropped > 0 && ` ${preparada.normalizada.dropped} horas sem dado foram desconsideradas.`}
              {!interna.completa && ' Série truncada pela paginação.'}
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="text-sm font-medium text-slate-700">Carpete anual, hora a hora</h3>
            <CarpetPlot
              label={`Temperatura operativa por dia e hora em ${interna.variable.key || 'zona única'}`}
              cells={preparada.celulas}
              dominio={preparada.extremos ?? { min: 0, max: 1 }}
              unidade="°C"
              resumoMensal={preparada.mensal}
            />
          </section>

          {preparadaExterna && (
            <section className="space-y-1">
              <h3 className="text-sm font-medium text-slate-700">Temperatura externa, para comparação</h3>
              <LineChart
                label="Temperatura externa diária, com banda de mínima e máxima"
                unidade="°C"
                baldes={preparadaExterna.envelope}
                rotulosX={MESES}
                cor="#5b9bc0"
              />
            </section>
          )}
        </>
      )}
    </Painel>
  );
}

function Painel({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Temperaturas operativas</h2>
      {children}
    </section>
  );
}
