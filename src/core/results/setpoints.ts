/**
 * Faixa de setpoints lida do **documento**, e não das respostas do assistente.
 *
 * Puro e determinístico (AGENTS.md §7).
 *
 * ## Por que não vem do assistente
 *
 * O modo Resultados abre execução de outra sessão pelo identificador, e o Modo Especialista
 * desliga o vínculo com o assistente (PRD §3.2). Nos dois casos, `answers.hvac` não tem
 * relação com o modelo que está na tela: classificar horas contra ele produziria um número
 * plausível e indefensável. O documento é a melhor fonte disponível no cliente.
 *
 * **Continua sendo o documento local, não o que foi simulado.** A API não devolve os
 * setpoints da execução, e o usuário pode ter editado o modelo depois de simular. Por isso o
 * painel apresenta a faixa como **critério escolhido**, e não como propriedade da execução.
 */
import type { EpJsonDocument, EpObject } from '../epjson/types';
import type { ComfortBand } from './comfort';

/** Valores numéricos de um `Schedule:Compact`, na ordem em que aparecem. */
function valoresDaAgenda(doc: EpJsonDocument, nome: string): number[] {
  const agenda = (doc['Schedule:Compact'] as Record<string, EpObject> | undefined)?.[nome];
  const linhas = agenda?.data;
  if (!Array.isArray(linhas)) return [];
  const valores: number[] = [];
  for (const linha of linhas) {
    const campo = (linha as { field?: unknown } | null)?.field;
    // Só o número interessa: `Through:`, `For:` e `Until:` são texto.
    if (typeof campo === 'number' && Number.isFinite(campo)) valores.push(campo);
  }
  return valores;
}

/**
 * A faixa de conforto implícita no termostato de duplo setpoint do documento.
 *
 * Com recuo noturno ligado, cada agenda tem mais de um valor: o **ocupado** e o de recuo.
 * A faixa usa o aquecimento **mais alto** e o resfriamento **mais baixo**, que é o par
 * vigente quando há gente no prédio — é para esse período que "hora de desconforto"
 * significa alguma coisa. Usar os valores de recuo declararia confortável a madrugada em
 * que ninguém está.
 *
 * Devolve `undefined` quando o documento não tem termostato de duplo setpoint, quando
 * alguma das agendas não tem número, ou quando a faixa sai invertida — casos em que quem
 * chama precisa dizer que não encontrou, e não exibir uma faixa inventada.
 */
export function bandFromDocument(doc: EpJsonDocument): ComfortBand | undefined {
  const termostatos = doc['ThermostatSetpoint:DualSetpoint'] as Record<string, EpObject> | undefined;
  const primeiro = termostatos && Object.values(termostatos)[0];
  if (!primeiro) return undefined;

  const nomeAquecimento = primeiro.heating_setpoint_temperature_schedule_name;
  const nomeResfriamento = primeiro.cooling_setpoint_temperature_schedule_name;
  if (typeof nomeAquecimento !== 'string' || typeof nomeResfriamento !== 'string') return undefined;

  const aquecimento = valoresDaAgenda(doc, nomeAquecimento);
  const resfriamento = valoresDaAgenda(doc, nomeResfriamento);
  if (aquecimento.length === 0 || resfriamento.length === 0) return undefined;

  const min = Math.max(...aquecimento);
  const max = Math.min(...resfriamento);
  // Faixa invertida não é faixa. Acontece se as agendas forem trocadas no Modo Especialista,
  // e classificar contra ela poria todas as horas fora — um resultado que parece medição.
  return min < max ? { min, max } : undefined;
}
