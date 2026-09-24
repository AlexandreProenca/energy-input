import type { WizardAnswers } from './answers';
import { defaultZoneName } from './geometry/boxGeometry';
import { roomArea } from './geometry/floorPlan';
import { chaveDoAmbiente, chaveDoPavimento } from './conditioningKeys';

/**
 * Quais ambientes o assistente climatiza (T031).
 *
 * A escolha é por **ambiente da planta** — vale para ele em todos os pavimentos, porque a planta
 * se repete — ou, no modo caixa, por **pavimento**, que é o único ambiente de cada andar. A
 * resposta guarda só as chaves **desmarcadas** (`hvac.unconditioned`): o padrão continua sendo
 * tudo climatizado, um autosave antigo não muda de sentido, e um ambiente novo nasce climatizado.
 *
 * Ambiente não climatizado fica **sem sistema e sem termostato**: a temperatura dele evolui
 * livre, pelo clima externo, pelas trocas com os vizinhos e pelas cargas internas.
 */

export { chaveDoAmbiente, chaveDoPavimento } from './conditioningKeys';

export interface AmbienteClimatizavel {
  chave: string;
  nome: string;
  /** Área de piso de um pavimento, em m². */
  area: number;
  /** Em quantos pavimentos o ambiente se repete. */
  pavimentos: number;
}

export function ambientesClimatizaveis(g: WizardAnswers['geometry']): AmbienteClimatizavel[] {
  if (g.mode === 'plan') {
    return (g.rooms ?? []).map((r) => ({ chave: chaveDoAmbiente(r.id), nome: r.name.trim() || 'Ambiente', area: roomArea(r.points), pavimentos: g.floors }));
  }
  return Array.from({ length: g.floors }, (_, i) => ({ chave: chaveDoPavimento(i), nome: defaultZoneName(i), area: g.width * g.depth, pavimentos: 1 }));
}

/** Zona sem chave (vinda de fora do assistente) é tratada como climatizada, como sempre foi. */
export const climatizado = (chave: string | undefined, hvac: WizardAnswers['hvac']): boolean =>
  !chave || !(hvac.unconditioned ?? []).includes(chave);

/** A frase da Revisão: quantos ambientes são climatizados e quais ficam de fora. */
export function resumoDaClimatizacao(g: WizardAnswers['geometry'], hvac: WizardAnswers['hvac']): string {
  const ambientes = ambientesClimatizaveis(g);
  const fora = ambientes.filter((a) => !climatizado(a.chave, hvac));
  const unidade = g.mode === 'plan' ? 'ambientes' : 'pavimentos';
  if (fora.length === 0) return ambientes.length === 1 ? `o ${unidade === 'ambientes' ? 'ambiente' : 'pavimento'} climatizado` : `todos os ${ambientes.length} ${unidade} climatizados`;
  if (fora.length === ambientes.length) return `nenhum ${unidade === 'ambientes' ? 'ambiente' : 'pavimento'} climatizado — o edifício evolui livre`;
  return `${ambientes.length - fora.length} de ${ambientes.length} ${unidade} climatizados; sem climatização: ${fora.map((a) => a.nome).join(', ')}`;
}

/**
 * Marca ou desmarca um ambiente e devolve a nova lista de desmarcados.
 *
 * O que sobra de escolhas antigas segue a natureza de cada chave:
 * - **ambiente** fica enquanto o ambiente existir na planta, em qualquer modo — o modo caixa não
 *   apaga `rooms`. O id de ambiente desenhado é UUID e não volta, então ambiente apagado é sobra.
 *   A exceção é o ambiente inicial da planta, `initial-room`, recriado com o mesmo id;
 * - **pavimento** fica sempre. O índice volta quando o número de pavimentos volta, e o terceiro
 *   pavimento desmarcado continua desmarcado depois de ir a dois e voltar a três;
 * - qualquer outra coisa (autosave corrompido) sai.
 */
export function alternarClimatizacao(g: WizardAnswers['geometry'], unconditioned: string[] | undefined, chave: string, ligado: boolean): string[] {
  const ambientes = new Set((g.rooms ?? []).map((r) => chaveDoAmbiente(r.id)));
  const guardar = (c: string) => ambientes.has(c) || /^pavimento:\d+$/.test(c);
  const fora = new Set((unconditioned ?? []).filter(guardar));
  if (ligado) fora.delete(chave); else fora.add(chave);
  return [...fora];
}
