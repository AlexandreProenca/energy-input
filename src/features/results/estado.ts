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
