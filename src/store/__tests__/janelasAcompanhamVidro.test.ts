import { beforeEach, describe, expect, it } from 'vitest';
import { useDocumentStore as documento } from '../documentStore';
import { useWizardStore as assistente } from '../wizardStore';
import { useUiStore as ui } from '../uiStore';
import { defaultAnswers } from '@/generators/answers';
import { templates } from '@/templates';
import { readGeometryModel } from '@/core/geometry/model';
import { addOpening } from '@/core/geometry/edits';
import { importLibraryConstruction } from '@/generators/library';
import { checkCrossReferences } from '@/core/validation/crossRefs';
import { loadTestSchema } from '@/core/testSchema';

/**
 * As janelas desenhadas pelo usuário acompanham o vidro do assistente (ADR-0002), pelo
 * caminho que derrubou uma simulação real: janela desenhada no Editor 3D com o vidro simples,
 * e o preset Apartamento, que troca o vidro para PVC 4 mm sozinho.
 */

const SIMPLES = 'Janela - Vidro simples incolor';
const PVC = 'Janela - PVC com vidro incolor 4 mm';
const F = 'FenestrationSurface:Detailed';

function desenharJanela(construction: string) {
  const doc = documento.getState().doc;
  const modelo = readGeometryModel(doc);
  const parede = [...modelo.surfaces.values()].find((s) => s.category === 'Wall' && !s.sharedWith && s.rect)!;
  const { doc: comJanela, name } = addOpening(doc, modelo, parede.name, {
    category: 'Window', construction,
    rect: { x: parede.rect!.x + 0.5, y: parede.rect!.y + 0.9, width: 1, height: 1 },
  });
  documento.getState().commit(comJanela, 'Editor 3D');
  return name;
}

const avisos = () => ui.getState().toasts.map((t) => t.message);
const referenciasQuebradas = () =>
  checkCrossReferences(documento.getState().doc, loadTestSchema().index).filter((i) => i.severity === 'error');

beforeEach(() => {
  ui.setState({ toasts: [] });
  assistente.getState().startFresh(defaultAnswers());
});

describe('o caminho do incidente', () => {
  it('a janela desenhada passa para o vidro que o preset Apartamento escolheu', () => {
    const j = desenharJanela(SIMPLES);
    assistente.getState().update('envelope', { presetId: 'apartamento' });
    expect(assistente.getState().answers.windows.glazingId).toBe('pvc_4mm');

    const janela = documento.getState().doc[F][j];
    expect(janela.construction_name).toBe(PVC);
    expect(janela.frame_and_divider_name).toBe(`${PVC} - Esquadria PVC`);
    expect(referenciasQuebradas()).toEqual([]);
  });

  it('o vidro antigo sai, porque ninguém mais aponta para ele', () => {
    // Sem isto, a T023 o reteria para sempre: a janela ainda apontaria para ele.
    desenharJanela(SIMPLES);
    assistente.getState().update('envelope', { presetId: 'apartamento' });
    expect(documento.getState().doc.Construction?.[SIMPLES]).toBeUndefined();
  });

  it('avisa, em vez de mudar em silêncio', () => {
    desenharJanela(SIMPLES);
    assistente.getState().update('envelope', { presetId: 'apartamento' });
    expect(avisos()).toContainEqual(expect.stringMatching(/1 janela desenhada por você passou para ".*PVC.*".*Modo Especialista/));
  });

  it('sem janela desenhada, não há aviso', () => {
    assistente.getState().update('envelope', { presetId: 'apartamento' });
    expect(avisos()).toEqual([]);
  });
});

describe('a janela específica, escolhida pelo usuário', () => {
  it('fica com o vidro dela quando o assistente troca o seu', () => {
    const doc = importLibraryConstruction(documento.getState().doc, templates, 'glazing:duplo_lowe');
    documento.getState().commit(doc.doc, 'Editor 3D');
    const j = desenharJanela(doc.name);
    assistente.getState().update('windows', { glazingId: 'pvc_4mm' });
    expect(documento.getState().doc[F][j].construction_name).toBe(doc.name);
    expect(avisos()).toEqual([]);
  });
});

describe('o documento que o defeito da T023 já tinha quebrado', () => {
  it('é reparado na próxima mudança no assistente, com aviso', () => {
    const j = desenharJanela(SIMPLES);
    assistente.getState().update('windows', { glazingId: 'pvc_4mm' });
    // Reproduz o estrago antigo: a janela volta a apontar para o vidro que não existe mais.
    const quebrado = structuredClone(documento.getState().doc);
    quebrado[F][j].construction_name = SIMPLES;
    delete quebrado[F][j].frame_and_divider_name;
    documento.getState().commit(quebrado, 'Especialista');
    expect(referenciasQuebradas()).toHaveLength(1);
    ui.setState({ toasts: [] });

    // Qualquer mudança no assistente, mesmo sem trocar o vidro.
    assistente.getState().update('project', { buildingName: 'Outro nome' });
    expect(documento.getState().doc[F][j].construction_name).toBe(PVC);
    expect(referenciasQuebradas()).toEqual([]);
    expect(avisos()).toContainEqual(expect.stringMatching(/1 janela apontava para um vidro que não existe mais/));
  });
});
