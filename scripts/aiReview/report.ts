/**
 * Relatório em Markdown a partir da revisão lida.
 *
 * Puro, pelo mesmo motivo de `parse.ts`: é o texto que vai para o PR, e ele não tinha como
 * ser conferido enquanto vivia dentro do heredoc no YAML.
 */
import type { Finding, Review } from './parse';

const SEVERIDADE_PT: Record<Finding['severity'], string> = {
  critical: 'CRÍTICA',
  high: 'ALTA',
  medium: 'MÉDIA',
  low: 'BAIXA',
};

/** Quantos achados entram no comentário. O resto vira uma linha de aviso. */
export const MAXIMO_DE_ACHADOS = 5;

const porcentagem = (v: number) => `${Math.round(v * 100)}%`;

/** Ordem de gravidade, da pior para a menos grave. */
const PESO: Record<Finding['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Mais graves primeiro e, no empate, as de maior confiança.
 *
 * O corte em cinco só é defensável se os cinco forem **os mais graves**. Sem ordenar, o corte
 * era pela ordem em que o modelo escreveu, e a linha que diz "os demais são de severidade
 * menor" seria uma afirmação sem lastro. Veio da revisão do PR #14.
 */
function porGravidade(a: Finding, b: Finding): number {
  return PESO[a.severity] - PESO[b.severity] || b.confidence - a.confidence;
}

export function renderReport(review: Review): string {
  const ordenados = [...review.findings].sort(porGravidade);
  const mostrados = ordenados.slice(0, MAXIMO_DE_ACHADOS);
  const resumo = review.summary.trim();

  if (mostrados.length === 0) {
    return resumo || 'Nenhum defeito demonstrável ou risco crítico encontrado nas alterações avaliadas.';
  }

  const blocos = mostrados.map((f) => [
    `### [${SEVERIDADE_PT[f.severity]}] ${f.title}`,
    `\`${f.path}:${f.line}\` · confiança: ${porcentagem(f.confidence)}`,
    `**Cenário de falha:** ${f.failure_scenario}`,
    `**Evidência:** ${f.evidence}`,
    `**Teste sugerido:** ${f.suggested_test}`,
  ].join('\n\n'));

  // Achado omitido precisa aparecer como número: um relatório que mostra cinco de doze sem
  // dizer nada deixa quem lê achando que viu tudo.
  const omitidos = ordenados.length - mostrados.length;
  if (omitidos > 0) {
    blocos.push(`_Mais ${omitidos} ${omitidos === 1 ? 'achado' : 'achados'} de severidade menor não ${omitidos === 1 ? 'foi listado' : 'foram listados'}._`);
  }

  return `${blocos.join('\n\n')}\n\n### Resumo da Análise\n\n${resumo}`;
}
