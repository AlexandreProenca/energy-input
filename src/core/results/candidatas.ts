/**
 * As séries candidatas que o 422 de `/results/timeseries` descreve.
 *
 * Puro e determinístico (AGENTS.md §7). É a única forma de descobrir as zonas de uma
 * variável: o catálogo (`/results/variables`) é de **tipos** e não traz chave.
 *
 * ## Os três 422, e só dois têm candidatas
 *
 * Capturados de uma execução real com duas zonas (fixtures `erro-422-*`):
 *
 * | Caso | `detail` | mensagem em `errors[]` |
 * |---|---|---|
 * | consulta sem chave, várias zonas | "2 séries de …; escolha uma por key e frequency" | `candidata: key='…', frequency=hourly` |
 * | chave que não existe | "nenhuma série de … com a chave e a frequência pedidas" | `existe: key='…', frequency=hourly` |
 * | variável não registrada | "variável inexistente nesta simulação" | `a simulação não registrou '…'` |
 *
 * **A candidata é o que está entre as aspas, não a mensagem.** A primeira versão entregava a
 * mensagem inteira: o seletor de zonas mostrava `candidata: key='…'` como opção, e escolhê-la
 * mandava esse texto inteiro como `key` — o serviço respondia com o segundo 422. E tratava a
 * mensagem do terceiro caso como se fosse uma zona.
 */
import type { ApiProblem, Frequency } from './types';

export interface SeriesCandidate {
  key: string;
  /** Presente quando o serviço informa uma frequência conhecida. */
  frequency?: Frequency;
}

const FREQUENCIAS: ReadonlySet<string> = new Set<Frequency>([
  'system_timestep', 'zone_timestep', 'hourly', 'daily', 'monthly', 'run_period', 'annual', 'unknown',
]);

/**
 * `key='…'` é guloso de propósito, ancorado no `', frequency=` final: um nome de zona com
 * apóstrofo (`SALA D'ÁGUA`) não pode cortar a chave no meio. O prefixo (`candidata:` ou
 * `existe:`) não entra na regra — ele distingue o caso, não a chave.
 */
const PADRAO = /key='(.*)', frequency=([a-z_]+)\s*$/;

export function parseSeriesCandidates(problem: ApiProblem | undefined): SeriesCandidate[] {
  const out: SeriesCandidate[] = [];
  const vistas = new Set<string>();
  for (const erro of problem?.errors ?? []) {
    const m = PADRAO.exec(erro.message ?? '');
    if (!m || !m[1]) continue;
    const frequency = FREQUENCIAS.has(m[2]) ? (m[2] as Frequency) : undefined;
    const id = `${m[1]}\u0000${frequency ?? ''}`;
    if (vistas.has(id)) continue;
    vistas.add(id);
    out.push(frequency ? { key: m[1], frequency } : { key: m[1] });
  }
  return out;
}
