import type { EpJsonDocument, EpObject } from '../epjson/types';
import { stableStringify } from '../epjson/document';
import { ownKey, type OwnershipMap } from './wizardSync';

/**
 * As janelas desenhadas pelo usuário acompanham o vidro escolhido no assistente.
 *
 * Puro e determinístico (AGENTS.md §7). É uma **exceção deliberada** à regra de que o
 * assistente não altera objeto criado pelo usuário — decisão do dono do produto, registrada no
 * [ADR-0002](../../../docs/adr/0002-janelas-acompanham-o-vidro-do-assistente.md). A exceção é
 * estreita: só a construção e a esquadria de aberturas que **seguem** o vidro do assistente, e
 * nunca em silêncio — quem chama anuncia quantas janelas mudaram.
 *
 * Uma janela **segue** o vidro do assistente quando a construção dela é o vidro que o assistente
 * oferecia até agora. Uma janela com outra construção é escolha específica do usuário, feita no
 * Modo Especialista ou no Editor 3D, e fica como está.
 */

/** Um vidro do assistente, pelos nomes que ele escreve no documento. */
export interface VidroDoAssistente {
  construcao: string;
  /** Esquadria que acompanha o vidro, quando ele tem uma (PVC). */
  esquadria?: string;
}

export interface Acompanhamento {
  doc: EpJsonDocument;
  /** Janelas que seguiam o vidro anterior e passaram para o novo. */
  janelas: string[];
  /**
   * Janelas que apontavam para um vidro do catálogo que **não existe** no documento e passaram
   * para o vidro atual. É o estrago deixado pelo defeito que a T023 corrigiu: o sync apagava o
   * vidro antigo e as janelas ficavam apontando para o nada.
   */
  reparadas: string[];
}

/** Tipos de abertura que levam vidro. O Editor 3D escreve só o primeiro. */
const TIPOS = ['FenestrationSurface:Detailed', 'Window', 'GlazedDoor'] as const;

const up = (s: unknown) => (typeof s === 'string' ? s.toUpperCase() : '');

export function acompanharVidro(
  doc: EpJsonDocument,
  owned: OwnershipMap,
  antigo: VidroDoAssistente,
  novo: VidroDoAssistente,
  catalogo: readonly VidroDoAssistente[],
): Acompanhamento {
  const existentes = new Set(Object.keys(doc.Construction ?? {}).map(up));
  const vidrosDoCatalogo = new Set(catalogo.map((v) => up(v.construcao)));
  const esquadriasDoAssistente = new Set([antigo, ...catalogo].flatMap((v) => (v.esquadria ? [up(v.esquadria)] : [])));

  let next = doc;
  const janelas: string[] = [];
  const reparadas: string[] = [];

  for (const tipo of TIPOS) {
    const instancias = doc[tipo];
    if (!instancias) continue;
    for (const [nome, obj] of Object.entries(instancias)) {
      // Janela do assistente é regerada por ele; mexer nela aqui mudaria o hash e abriria um
      // conflito falso no planWizardSync.
      if (owned[ownKey(tipo, nome)] !== undefined) continue;
      // Porta opaca não leva vidro.
      if (up(obj.surface_type) === 'DOOR') continue;

      const construcao = up(obj.construction_name);
      const segue = construcao === up(antigo.construcao);
      const orfa = !segue && vidrosDoCatalogo.has(construcao) && !existentes.has(construcao);
      if (!segue && !orfa) continue;

      const atualizado: EpObject = { ...obj, construction_name: novo.construcao };
      // A esquadria pertence ao vidro, como no Editor 3D (`openingConstruction`). Só a
      // personalizada — nem vazia, nem de um vidro do assistente — fica como está.
      const esquadria = up(obj.frame_and_divider_name);
      if (!esquadria || esquadriasDoAssistente.has(esquadria)) {
        delete atualizado.frame_and_divider_name;
        if (novo.esquadria) atualizado.frame_and_divider_name = novo.esquadria;
      }
      if (stableStringify(atualizado) === stableStringify(obj)) continue;

      if (next === doc) next = { ...doc };
      if (next[tipo] === doc[tipo]) next[tipo] = { ...doc[tipo] };
      next[tipo][nome] = atualizado;
      (segue ? janelas : reparadas).push(nome);
    }
  }
  return { doc: next, janelas, reparadas };
}
