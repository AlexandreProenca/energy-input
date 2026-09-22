import { useMemo, useState } from 'react';
import { CalendarClock, Loader2, Snowflake, Sun, ThermometerSun } from 'lucide-react';
import { Callout, Field, StatTile, fmt } from '@/ui/primitives';
import { dayOfYear, normalizeSeries } from '@/core/results/series';
import { carpetCells } from '@/core/results/plot';
import {
  adaptiveDiscomfort, hoursOutsideBand, monthlyStateHours, summaryComfortHours,
  type ComfortBand, type Discomfort, type HourState,
} from '@/core/results/comfort';
import { TABELAS, rotuloDeConforto } from '@/core/results/rotulos';
import { bandFromDocument } from '@/core/results/setpoints';
import { useDocumentStore } from '@/store/documentStore';
import type { Simulation, Summary } from '@/features/simulation/api';
import { StackedBarChart } from '../charts/StackedBarChart';
import { CarpetPlot } from '../charts/CarpetPlot';
import { useResultsStore } from '../resultsStore';
import { semAnoCompleto } from '../estado';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Frio, confortável e quente. A mesma paleta do carpete de temperatura, para não competir. */
const CORES: Record<HourState, string> = { frio: '#5b9bc0', ok: '#cbd5e1', quente: '#ef6c35' };
const ESTADOS: HourState[] = ['frio', 'ok', 'quente'];
const ROTULO: Record<HourState, string> = { frio: 'Frio', ok: 'Confortável', quente: 'Quente' };

/**
 * O estado vira número para caber em `CarpetCell.value`, e a cor volta dele.
 *
 * Estado desconhecido vira `NaN`, e não um código: `carpetCells` **descarta** célula com
 * valor não finito, então a hora simplesmente não é desenhada. Mapeá-lo para um código
 * faria `corDoEstado` cair no fallback e pintar de "confortável" uma hora que não foi
 * classificada — mentira silenciosa, que é o mesmo defeito da guarda de comprimento.
 */
const CODIGO: Record<HourState, number> = { frio: 0, ok: 1, quente: 2 };
const codigoDoEstado = (e: HourState): number => CODIGO[e] ?? NaN;
/**
 * Código fora de 0..2 recebe cinza claro de "não classificado", e não a cor de confortável.
 * Hoje é inalcançável — `carpetCells` descarta célula não finita —, mas o fallback anterior
 * apostava a favor do edifício: qualquer código inesperado viraria uma hora confortável na
 * tela. Errar para "não sei" é o único erro aceitável aqui.
 */
const NAO_CLASSIFICADO = '#f1f5f9';
const corDoEstado = (v: number) => {
  const estado = ESTADOS[v];
  return estado ? CORES[estado] : NAO_CLASSIFICADO;
};

type Criterio = 'fixa' | 'adaptativa';

/**
 * Último recurso, quando o documento não tem termostato de duplo setpoint — um modelo sem
 * climatização, por exemplo. São os valores usuais de conforto para ambiente residencial, e
 * o painel diz que vieram daqui.
 */
const FAIXA_PADRAO: ComfortBand = { min: 18, max: 26 };

/**
 * Painel de horas de desconforto.
 *
 * Mostra **frio e quente em separado**, e não um agregado: 800 horas quentes pedem
 * sombreamento e ventilação, 800 frias pedem isolamento e ganho solar — são decisões de
 * projeto opostas, e somá-las apaga justamente a informação que orienta o projeto.
 */
export function DesconfortoPanel({ simulation, summary }: {
  simulation: Simulation;
  summary: Summary | undefined;
}) {
  const interna = useResultsStore((s) => s.interna);
  const externa = useResultsStore((s) => s.externa);
  const carregandoTemperatura = useResultsStore((s) => s.carregandoTemperatura);
  const expirada = useResultsStore((s) => s.expirada);
  // A faixa fixa vem do **documento**, e não de `answers.hvac`. Este painel abre execução de
  // outra sessão pelo identificador, e o Modo Especialista desliga o vínculo com o
  // assistente (PRD §3.2): nos dois casos as respostas do assistente não têm relação com o
  // modelo na tela, e classificar horas contra elas daria um número plausível e
  // indefensável.
  const doc = useDocumentStore((s) => s.doc);
  const [criterio, setCriterio] = useState<Criterio>('fixa');

  const doDocumento = useMemo(() => bandFromDocument(doc), [doc]);
  // Sem termostato no documento, a faixa da literatura entra como último recurso — e o
  // painel diz de onde ela veio, porque 18–26 °C sem procedência é número mágico.
  const faixaFixa: ComfortBand = doDocumento ?? FAIXA_PADRAO;

  const calculado = useMemo(() => {
    if (!interna) return undefined;
    const serie = normalizeSeries(interna.itens);
    const adaptativa = criterio === 'adaptativa' && externa
      ? adaptiveDiscomfort(serie, normalizeSeries(externa.itens), faixaFixa)
      : undefined;
    const d: Discomfort = adaptativa ?? hoursOutsideBand(serie.points, faixaFixa);
    // `hourly` é paralelo a `points` por contrato das duas funções, e hoje sempre bate. A
    // guarda existe porque a falha seria **silenciosa**: `CODIGO[undefined]` é `undefined`,
    // `corDoEstado` cai no fallback e o carpete pintaria de "confortável" horas de frio ou
    // calor, sem nada indicar. `monthlyStateHours` já se protege disso; não havia motivo
    // para o carpete não se proteger.
    const emparelhado = d.hourly.length === serie.points.length;
    return {
      serie, d,
      fallbackDays: adaptativa?.fallbackDays,
      mensal: monthlyStateHours(serie.points, d.hourly),
      emparelhado,
      celulas: !emparelhado ? [] : carpetCells(
        serie.points.map((p, i) => ({ hour: p.hour, value: codigoDoEstado(d.hourly[i]) })),
        (i) => {
          const p = serie.points[i];
          return dayOfYear(p.month, p.day, serie.leap) - 1;
        },
      ),
    };
  }, [interna, externa, criterio, faixaFixa]);

  // Os indicadores permanentes valem mesmo sem série, e é o que resta quando ela expira.
  const doResumo = useMemo(() => (summary ? summaryComfortHours(summary.comfort) : undefined), [summary]);

  if (semAnoCompleto(simulation)) {
    return (
      <Painel>
        <Callout tone="warning" icon={<CalendarClock size={18} />} title="Não há horas de desconforto nesta execução">
          Dias de projeto simulam duas datas extremas. Contar horas de desconforto exige
          execução climática (<span className="font-medium">annual</span>).
        </Callout>
      </Painel>
    );
  }

  return (
    <Painel>
      {carregandoTemperatura && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Classificando as horas…
        </p>
      )}

      {calculado && (
        <>
          <Field
            label="Critério de conforto"
            hint={
              criterio === 'fixa'
                ? `${fmt(faixaFixa.min, 1)} °C a ${fmt(faixaFixa.max, 1)} °C, ${doDocumento ? 'do termostato do modelo aberto' : 'valores usuais de referência — o modelo aberto não define uma faixa única'}.`
                : 'Faixa da ASHRAE 55 / EN 16798, recalculada a cada dia pela média externa predominante.'
            }
          >
            <select
              className="input"
              value={criterio}
              onChange={(e) => setCriterio(e.target.value as Criterio)}
            >
              <option value="fixa">Faixa fixa dos setpoints</option>
              {/* Sem a externa não há média predominante, e o adaptativo não tem como existir. */}
              <option value="adaptativa" disabled={!externa}>
                Faixa adaptativa{externa ? '' : ' (exige a temperatura externa)'}
              </option>
            </select>
          </Field>

          <div className="grid gap-2 sm:grid-cols-4">
            <StatTile label="Horas frias" value={fmt(calculado.d.cold, 0)} unit="h" icon={<Snowflake size={13} />} />
            <StatTile label="Horas quentes" value={fmt(calculado.d.hot, 0)} unit="h" icon={<Sun size={13} />} />
            <StatTile label="Horas confortáveis" value={fmt(calculado.d.comfortable, 0)} unit="h" />
            {/*
              Horas sem dado aparecem ao lado das outras três, e não numa nota de pé. Elas não
              são conforto nem desconforto: `normalizeSeries` as descartou porque o valor não
              veio. Esconder o número deixaria os três primeiros somando menos de 8 760 sem
              explicação, e quem conferisse concluiria que a conta está errada.
            */}
            <StatTile label="Horas sem dado" value={fmt(calculado.serie.dropped, 0)} unit="h" />
          </div>

          {calculado.d.total > 0 && (
            <p className="text-sm text-slate-600">
              <span className="font-medium">
                {fmt(((calculado.d.cold + calculado.d.hot) / calculado.d.total) * 100, 1)}%
              </span>{' '}
              das horas medidas ficaram fora da faixa — {fmt(calculado.d.cold, 0)} h de frio e{' '}
              {fmt(calculado.d.hot, 0)} h de calor.
            </p>
          )}

          {/*
            Quantos dias usaram um critério diferente do anunciado. Um gráfico que troca de
            critério no meio do ano sem dizer é um gráfico que mente: no começo da série não
            há histórico para a média predominante, e fora de 10–33,5 °C o modelo adaptativo
            não vale. Nos dois casos a faixa fixa entra no lugar.
          */}
          {calculado.fallbackDays !== undefined && calculado.fallbackDays > 0 && (
            <Callout tone="info" title="Alguns dias usaram a faixa fixa">
              Em <span className="font-medium">{fmt(calculado.fallbackDays, 0)}{' '}
              {calculado.fallbackDays === 1 ? 'dia' : 'dias'}</span> o modelo
              adaptativo não se aplicava — sem histórico externo suficiente, ou com média externa
              fora da faixa de validade de 10 °C a 33,5 °C. Nesses dias vale a faixa fixa de{' '}
              {fmt(faixaFixa.min, 1)} °C a {fmt(faixaFixa.max, 1)} °C.
            </Callout>
          )}

          <section className="space-y-1">
            <h3 className="text-sm font-medium text-slate-700">Horas por mês, classificadas</h3>
            <StackedBarChart
              label="Horas de conforto e desconforto por mês"
              unidade="h"
              rotulos={MESES}
              series={ESTADOS.map((e) => ({
                nome: ROTULO[e], cor: CORES[e], valores: calculado.mensal.map((m) => m[e]),
              }))}
            />
            <p className="text-xs text-slate-500">
              Em que época do ano o desconforto se concentra — e de que lado ele cai.
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="text-sm font-medium text-slate-700">Carpete de conforto, hora a hora</h3>
            <CarpetPlot
              label="Estado de conforto por dia e hora do ano"
              cells={calculado.celulas}
              // Domínio inerte: a cor é categórica e não interpola. Ele existe só porque o
              // componente o exige para a escala contínua, que aqui não é usada.
              dominio={{ min: 0, max: 2 }}
              cor={corDoEstado}
              legenda={ESTADOS.map((e) => ({ rotulo: ROTULO[e], cor: CORES[e] }))}
              resumoMensal={calculado.mensal.map((m, i) => ({ mes: i + 1, valor: m.frio + m.quente }))}
              resumoDescricao="horas fora da faixa por mês"
              unidade="h"
              vazio={calculado.emparelhado ? undefined : 'Não foi possível parear a classificação com as horas da série.'}
            />
          </section>

          <p className="text-xs text-slate-500">
            Indicador informativo, e não verificação de conformidade: a faixa é um critério de
            projeto, não o método de uma norma.
          </p>
        </>
      )}

      {!carregandoTemperatura && !interna && (
        <Callout tone="info" title={expirada ? 'A série horária desta execução expirou' : 'Esta execução não registrou a temperatura operativa'}>
          {expirada
            ? 'A classificação hora a hora depende do arquivo de resultados, que a retenção do serviço já apagou. Os indicadores permanentes abaixo continuam valendo.'
            : <>Marque <span className="font-medium">Conforto (temperatura e umidade)</span> na etapa Resultados do assistente antes de simular. Projetos novos já vêm com ela marcada.</>}
        </Callout>
      )}

      {doResumo && <Permanentes summary={summary!} temSerie={!!interna} />}
    </Painel>
  );
}

/**
 * Os três indicadores do resumo permanente.
 *
 * Eles sobrevivem à retenção que apaga o `.sql`, e é por isso que aparecem mesmo quando a
 * série existe: são a única coisa que continuará aqui depois de a série expirar.
 */
function Permanentes({ summary, temSerie }: { summary: Summary; temSerie: boolean }) {
  // Filtra por **nome conhecido**, e não só pela unidade. Um indicador novo em horas — horas
  // de operação, por exemplo — passaria pelo filtro de unidade e apareceria com o nome em
  // inglês cru, que é o defeito que esta mesma tarefa corrigiu em outros lugares.
  const horas = summary.comfort.filter(
    (c) => c.name in TABELAS.conforto && c.units.toLowerCase().startsWith('hour'),
  );
  if (horas.length === 0) return null;
  return (
    <section className="space-y-2 border-t border-slate-100 pt-3">
      <h3 className="text-sm font-medium text-slate-700">Indicadores do resumo permanente</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        {horas.map((c) => (
          <StatTile key={c.name} label={rotuloDeConforto(c.name)} value={fmt(c.value, 0)} unit="h" icon={<ThermometerSun size={13} />} />
        ))}
      </div>
      {/*
        Os dois de setpoint dão estruturalmente zero nos modelos deste aplicativo, porque
        `src/generators/hvac.ts` escreve `NoLimit` — um sistema ideal ilimitado sempre atende
        o setpoint. Anunciá-los como "desconforto" mostraria zero para sempre. Conferido em
        execução local do modelo padrão: 0 h nos dois de setpoint e 7 587 h no ASHRAE 55.
      */}
      <p className="text-xs text-slate-500">
        Os dois primeiros medem <span className="font-medium">controle do sistema</span>, não
        conforto do ocupante: com o sistema ideal sem limite de capacidade que o assistente
        escreve, o setpoint é sempre atendido e eles tendem a zero.
        {temSerie && ' O número acima, calculado da série, é o indicador de conforto.'}
      </p>
    </section>
  );
}

function Painel({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Horas de desconforto</h2>
      {children}
    </section>
  );
}
