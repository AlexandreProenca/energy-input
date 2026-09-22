import { isEnergyUnit, toKwh } from '@/core/results/units';
import { terminal, type Simulation } from '@/features/simulation/api';

/**
 * Qual das telas do modo Resultados vale para uma execução.
 *
 * Fica fora do componente para poder ser testada: o Vitest deste projeto roda em
 * `environment: 'node'`, sem jsdom, então lógica dentro do `.tsx` não tem como ser
 * exercitada. E esta é a decisão que define o que o usuário vê — inclusive quando não há
 * gráfico nenhum para mostrar.
 */
export type EstadoDoPainel =
  /** Nenhuma execução adotada nesta sessão. */
  | 'sem-execucao'
  /** Enfileirada ou rodando: não há o que desenhar, mas também não é erro. */
  | 'em-andamento'
  /** Terminou em falha, cancelamento ou tempo esgotado. */
  | 'sem-sucesso'
  /** Concluída com sucesso: é a única em que os painéis desenham. */
  | 'pronto';

export function estadoDoPainel(simulation: Simulation | undefined): EstadoDoPainel {
  if (!simulation) return 'sem-execucao';
  if (!terminal(simulation.status)) return 'em-andamento';
  return simulation.status === 'succeeded' ? 'pronto' : 'sem-sucesso';
}

/**
 * Dias de projeto dimensionam o sistema em duas datas extremas e não representam o ano:
 * consumo anual e horas de desconforto não existem nessas execuções.
 */
export const semAnoCompleto = (simulation: Simulation): boolean => simulation.run_type === 'design_day';

/**
 * Uso final em kWh, a partir do resumo permanente.
 *
 * Duas filtragens, e as duas importam. O motor devolve os **14 recursos sempre**, inclusive
 * zerados: sem filtrar, o gráfico teria dezenas de barras invisíveis. E mistura unidades na
 * mesma lista, com água em `m3` ao lado de energia em `GJ` — `toKwh` devolve `null` para o
 * que não é energia, e esse `null` precisa ser descartado, nunca somado como zero silencioso.
 */
export function usosFinaisEmKwh(
  endUses: readonly { category: string; resources: readonly { resource: string; value: number; units: string }[] }[],
): { rotulo: string; valor: number }[] {
  return endUses
    .map((uso) => ({
      rotulo: uso.category,
      valor: uso.resources
        .filter((r) => isEnergyUnit(r.units))
        .reduce((total, r) => total + (toKwh(r.value, r.units) ?? 0), 0),
    }))
    .filter((b) => b.valor > 0);
}
