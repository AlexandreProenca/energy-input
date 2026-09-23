import { describe, expect, it } from 'vitest';
import { acompanharVidro, type VidroDoAssistente } from '../acompanharVidro';
import { ownKey } from '../wizardSync';
import type { EpJsonDocument } from '../../epjson/types';

const SIMPLES: VidroDoAssistente = { construcao: 'Janela - Vidro simples incolor' };
const PVC: VidroDoAssistente = { construcao: 'Janela - PVC com vidro incolor 4 mm', esquadria: 'Janela - PVC com vidro incolor 4 mm - Esquadria PVC' };
const LOWE: VidroDoAssistente = { construcao: 'Janela - Vidro duplo low-E' };
const CATALOGO = [SIMPLES, PVC, LOWE];

const F = 'FenestrationSurface:Detailed';
const janela = (construction_name: string, extra: Record<string, unknown> = {}) =>
  ({ surface_type: 'Window', construction_name, building_surface_name: 'Parede', ...extra });
const docCom = (fen: Record<string, object>, construcoes = [SIMPLES.construcao]): EpJsonDocument => ({
  Construction: Object.fromEntries(construcoes.map((c) => [c, { outside_layer: 'x' }])),
  [F]: fen as EpJsonDocument[string],
});

describe('a janela que segue o vidro do assistente', () => {
  it('passa para o vidro novo, com a esquadria dele', () => {
    const r = acompanharVidro(docCom({ J: janela(SIMPLES.construcao) }), {}, SIMPLES, PVC, CATALOGO);
    expect(r.doc[F].J).toMatchObject({ construction_name: PVC.construcao, frame_and_divider_name: PVC.esquadria });
    expect(r.janelas).toEqual(['J']);
  });

  it('perde a esquadria do vidro antigo quando o novo não tem', () => {
    const r = acompanharVidro(docCom({ J: janela(PVC.construcao, { frame_and_divider_name: PVC.esquadria }) }, [PVC.construcao]), {}, PVC, SIMPLES, CATALOGO);
    expect(r.doc[F].J.construction_name).toBe(SIMPLES.construcao);
    expect(r.doc[F].J.frame_and_divider_name).toBeUndefined();
  });

  it('mantém a esquadria que o usuário personalizou', () => {
    const r = acompanharVidro(docCom({ J: janela(SIMPLES.construcao, { frame_and_divider_name: 'Minha esquadria de madeira' }) }), {}, SIMPLES, PVC, CATALOGO);
    expect(r.doc[F].J).toMatchObject({ construction_name: PVC.construcao, frame_and_divider_name: 'Minha esquadria de madeira' });
  });

  it('compara nomes sem diferenciar maiúsculas, como o EnergyPlus', () => {
    const r = acompanharVidro(docCom({ J: janela(SIMPLES.construcao.toUpperCase()) }), {}, SIMPLES, PVC, CATALOGO);
    expect(r.doc[F].J.construction_name).toBe(PVC.construcao);
  });

  it('inclui os objetos de abertura simplificados (`Window`, `GlazedDoor`)', () => {
    // O Editor 3D só escreve FenestrationSurface:Detailed, mas os simplificados existem no
    // schema 26.1 e aparecem em 11 dos exemplos oficiais do EnergyPlus — chegam pelo
    // Especialista. Não têm `surface_type`. Veio da revisão do PR, que os dava por
    // inexistentes; a parte certa do achado é que não tinham teste.
    const doc: EpJsonDocument = {
      Construction: { [SIMPLES.construcao]: { outside_layer: 'x' } },
      Window: { J: { construction_name: SIMPLES.construcao, building_surface_name: 'Parede' } },
      GlazedDoor: { P: { construction_name: SIMPLES.construcao, building_surface_name: 'Parede' } },
    };
    const r = acompanharVidro(doc, {}, SIMPLES, PVC, CATALOGO);
    expect(r.doc.Window.J).toMatchObject({ construction_name: PVC.construcao, frame_and_divider_name: PVC.esquadria });
    expect(r.doc.GlazedDoor.P.construction_name).toBe(PVC.construcao);
    expect(r.janelas.sort()).toEqual(['J', 'P']);
  });

  it('inclui a porta de vidro', () => {
    const r = acompanharVidro(docCom({ P: janela(SIMPLES.construcao, { surface_type: 'GlassDoor' }) }), {}, SIMPLES, PVC, CATALOGO);
    expect(r.doc[F].P.construction_name).toBe(PVC.construcao);
  });
});

describe('o que fica como está', () => {
  it('a janela com outra construção — a escolha específica do usuário', () => {
    // É o caminho de "editar uma janela específica": o usuário escolhe outro vidro no
    // Especialista ou no Editor 3D, e a troca no assistente não o desfaz.
    const doc = docCom({ J: janela(LOWE.construcao) }, [SIMPLES.construcao, LOWE.construcao]);
    const r = acompanharVidro(doc, {}, SIMPLES, PVC, CATALOGO);
    expect(r.doc).toBe(doc);
    expect(r.janelas).toEqual([]);
  });

  it('a janela gerada pelo assistente, que ele mesmo regera', () => {
    // Mexer nela mudaria o hash e o planWizardSync abriria um conflito falso.
    const doc = docCom({ J: janela(SIMPLES.construcao) });
    const r = acompanharVidro(doc, { [ownKey(F, 'J')]: 'hash' }, SIMPLES, PVC, CATALOGO);
    expect(r.doc).toBe(doc);
  });

  it('a porta opaca', () => {
    const doc = docCom({ P: janela(SIMPLES.construcao, { surface_type: 'Door' }) });
    expect(acompanharVidro(doc, {}, SIMPLES, PVC, CATALOGO).doc).toBe(doc);
  });

  it('nada muda quando o vidro não mudou', () => {
    // Toda mudança no assistente passa por aqui, não só a troca de vidro.
    const doc = docCom({ J: janela(PVC.construcao, { frame_and_divider_name: PVC.esquadria }) }, [PVC.construcao]);
    const r = acompanharVidro(doc, {}, PVC, PVC, CATALOGO);
    expect(r.doc).toBe(doc);
    expect(r.janelas).toEqual([]);
  });

  it('o documento recebido não é alterado', () => {
    const doc = docCom({ J: janela(SIMPLES.construcao) });
    acompanharVidro(doc, {}, SIMPLES, PVC, CATALOGO);
    expect(doc[F].J.construction_name).toBe(SIMPLES.construcao);
  });
});

describe('reparo das janelas quebradas pelo defeito da T023', () => {
  /**
   * Antes da T023, trocar o vidro apagava a construção antiga e deixava as janelas do usuário
   * apontando para o nada. Esses documentos existem — num deles a simulação falhou. Janela que
   * aponta para um vidro do catálogo que não existe no documento passa para o vidro atual.
   */
  it('passa para o vidro atual quando o vidro dela não existe mais', () => {
    const doc = docCom({ J: janela(SIMPLES.construcao) }, [PVC.construcao]);
    const r = acompanharVidro(doc, {}, PVC, PVC, CATALOGO);
    expect(r.doc[F].J).toMatchObject({ construction_name: PVC.construcao, frame_and_divider_name: PVC.esquadria });
    expect(r.reparadas).toEqual(['J']);
    expect(r.janelas).toEqual([]);
  });

  it('não repara vidro do catálogo que existe no documento', () => {
    // Contraprova: um vidro do catálogo importado de propósito é escolha específica.
    const doc = docCom({ J: janela(LOWE.construcao) }, [PVC.construcao, LOWE.construcao]);
    expect(acompanharVidro(doc, {}, PVC, PVC, CATALOGO).doc).toBe(doc);
  });

  it('não repara construção inexistente que não é vidro do catálogo', () => {
    // Não é possível saber o que o usuário queria; a validação mostra o erro.
    const doc = docCom({ J: janela('Vidro que o usuário digitou errado') }, [PVC.construcao]);
    expect(acompanharVidro(doc, {}, PVC, PVC, CATALOGO).doc).toBe(doc);
  });
});
