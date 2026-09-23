import { describe, expect, it } from 'vitest';
import { planWizardSync } from '../wizardSync';
import { checkCrossReferences } from '../../validation/crossRefs';
import { loadTestSchema } from '../../testSchema';
import { readGeometryModel } from '../../geometry/model';
import { addOpening } from '../../geometry/edits';
import { defaultAnswers } from '@/generators/answers';
import { generateDocument } from '@/generators/compose';
import { templates } from '@/templates';
import type { EpJsonDocument } from '../../epjson/types';

/**
 * Referências órfãs criadas pelo próprio sync.
 *
 * O `planWizardSync` apagava o objeto do assistente que deixou de ser gerado sem olhar se
 * algum objeto que **fica** ainda apontava para ele. Foi o que derrubou uma simulação real:
 * o usuário pôs janelas no Editor 3D com o vidro do assistente, depois trocou o vidro na
 * etapa Janelas, e o sync apagou a construção antiga — as janelas ficaram apontando para o
 * nada, e o EnergyPlus parou com `invalid construction_name` em `GetSurfaceData`.
 */

const referenciasQuebradas = (doc: EpJsonDocument) =>
  checkCrossReferences(doc, loadTestSchema().index).filter((i) => i.source === 'reference');

describe('a sequência que quebrou a simulação real', () => {
  const VIDRO_ANTIGO = 'Janela - Vidro simples incolor';

  function montar() {
    const respostas = defaultAnswers();
    expect(respostas.windows.glazingId).toBe('simples');
    const primeira = planWizardSync({}, generateDocument(respostas, templates).document, {}, 'overwrite');

    // O usuário põe uma janela no Editor 3D usando o vidro que o assistente disponibilizou.
    const modelo = readGeometryModel(primeira.next);
    const parede = [...modelo.surfaces.values()].find((s) => s.category === 'Wall' && !s.sharedWith && s.rect)!;
    const { doc: comJanela, name: janela } = addOpening(primeira.next, modelo, parede.name, {
      category: 'Window',
      construction: VIDRO_ANTIGO,
      rect: { x: parede.rect!.x + 0.5, y: parede.rect!.y + 0.9, width: 1, height: 1 },
    });

    // E troca o vidro na etapa Janelas do assistente.
    const novasRespostas = { ...respostas, windows: { ...respostas.windows, glazingId: 'pvc_4mm' } };
    const gerado = generateDocument(novasRespostas, templates).document;
    return { comJanela, janela, owned: primeira.owned, gerado };
  }

  it('o documento com a janela nova ainda está íntegro antes do sync', () => {
    // Contraprova: se a referência já estivesse quebrada aqui, o teste abaixo não provaria
    // nada sobre o sync.
    const { comJanela } = montar();
    expect(referenciasQuebradas(comJanela)).toEqual([]);
  });

  it('o sync não deixa a janela do usuário apontando para uma construção apagada', () => {
    const { comJanela, janela, owned, gerado } = montar();
    const plano = planWizardSync(comJanela, gerado, owned, 'overwrite');

    expect(plano.next['FenestrationSurface:Detailed']?.[janela]?.construction_name).toBe(VIDRO_ANTIGO);
    expect(plano.next.Construction?.[VIDRO_ANTIGO]).toBeDefined();
    // A construção sozinha não basta: as camadas dela também são do assistente e deixaram
    // de ser geradas. Sem seguir a cadeia, o EnergyPlus pararia no material em vez de na
    // construção.
    expect(referenciasQuebradas(plano.next)).toEqual([]);
  });

  it('a construção nova, escolhida no assistente, entra normalmente', () => {
    const { comJanela, owned, gerado } = montar();
    const plano = planWizardSync(comJanela, gerado, owned, 'overwrite');
    expect(plano.next.Construction?.['Janela - PVC com vidro incolor 4 mm']).toBeDefined();
  });
});

describe('objeto do assistente ainda referenciado', () => {
  const gen1: EpJsonDocument = {
    Construction: { C: { outside_layer: 'M' } },
    Material: { M: { thickness: 0.1 } },
    Zone: { Z: {} },
  };
  const gen2: EpJsonDocument = { Zone: { Z: {} } };

  it('fica, junto com o que ele mesmo referencia', () => {
    const primeira = planWizardSync({}, gen1, {}, 'overwrite');
    const doc = { ...primeira.next, 'FenestrationSurface:Detailed': { W: { construction_name: 'C' } } };
    const plano = planWizardSync(doc, gen2, primeira.owned, 'overwrite');
    expect(plano.next.Construction).toEqual({ C: { outside_layer: 'M' } });
    expect(plano.next.Material).toEqual({ M: { thickness: 0.1 } });
    expect(plano.retained).toEqual(expect.arrayContaining([
      { type: 'Construction', name: 'C' },
      { type: 'Material', name: 'M' },
    ]));
  });

  it('segue a cadeia em qualquer profundidade', () => {
    // Usuário → A → B → C, os três do assistente e fora da geração: os três ficam. Veio da
    // revisão do PR — a lógica já cobria, e o teste trava.
    const g1: EpJsonDocument = { Construction: { A: { outside_layer: 'B' } }, Material: { B: { roughness: 'C' } }, 'Schedule:Constant': { C: {} }, Zone: { Z: {} } };
    const primeira = planWizardSync({}, g1, {}, 'overwrite');
    const doc = { ...primeira.next, 'FenestrationSurface:Detailed': { W: { construction_name: 'A' } } };
    const plano = planWizardSync(doc, { Zone: { Z: {} } }, primeira.owned, 'overwrite');
    expect(plano.next.Construction?.A).toBeDefined();
    expect(plano.next.Material?.B).toBeDefined();
    expect(plano.next['Schedule:Constant']?.C).toBeDefined();
    expect(plano.retained).toHaveLength(3);
  });

  it('compara nomes sem diferenciar maiúsculas, como o EnergyPlus', () => {
    const primeira = planWizardSync({}, gen1, {}, 'overwrite');
    const doc = { ...primeira.next, 'FenestrationSurface:Detailed': { W: { construction_name: 'c' } } };
    expect(planWizardSync(doc, gen2, primeira.owned, 'overwrite').next.Construction?.C).toBeDefined();
  });

  it('sai no sync seguinte, quando ninguém mais aponta para ele', () => {
    // Segue sendo do assistente: se sumisse da lista de posse, viraria sobra permanente
    // depois que o usuário apagasse a janela.
    const primeira = planWizardSync({}, gen1, {}, 'overwrite');
    const doc = { ...primeira.next, 'FenestrationSurface:Detailed': { W: { construction_name: 'C' } } };
    const plano = planWizardSync(doc, gen2, primeira.owned, 'overwrite');

    const semJanela = { ...plano.next };
    delete semJanela['FenestrationSurface:Detailed'];
    const depois = planWizardSync(semJanela, gen2, plano.owned, 'overwrite');
    expect(depois.next.Construction).toBeUndefined();
    expect(depois.next.Material).toBeUndefined();
  });

  it('se o usuário editar o objeto retido, ele passa a ser do usuário e nunca é apagado', () => {
    // A revisão do PR sugeriu que o retido editado "pode ser removido com referência viva".
    // Não pode: editado vai para `orphaned`, que é mantido. E deixa de ser do assistente de
    // propósito — é o comportamento anterior a esta tarefa para todo objeto editado, e apagar
    // conteúdo que o usuário editou violaria a proteção de dados do planWizardSync (AGENTS.md §7).
    const primeira = planWizardSync({}, gen1, {}, 'overwrite');
    const doc = { ...primeira.next, 'FenestrationSurface:Detailed': { W: { construction_name: 'C' } } };
    const retido = planWizardSync(doc, gen2, primeira.owned, 'overwrite');

    const editado = { ...retido.next, Construction: { C: { outside_layer: 'M', layer_2: 'M' } } };
    const depois = planWizardSync(editado, gen2, retido.owned, 'overwrite');
    expect(depois.next.Construction?.C).toEqual({ outside_layer: 'M', layer_2: 'M' });
    expect(depois.orphaned).toContainEqual({ type: 'Construction', name: 'C' });

    // Sem a janela, continua lá: é do usuário agora.
    const semJanela = { ...depois.next };
    delete semJanela['FenestrationSurface:Detailed'];
    expect(planWizardSync(semJanela, gen2, depois.owned, 'overwrite').next.Construction?.C).toBeDefined();
  });

  it('não é mantido por referência vinda de outro objeto que também está saindo', () => {
    // Contraprova: a construção aponta para o material, mas as duas estão sendo removidas.
    // Contar essa referência manteria tudo para sempre.
    const primeira = planWizardSync({}, gen1, {}, 'overwrite');
    const plano = planWizardSync(primeira.next, gen2, primeira.owned, 'overwrite');
    expect(plano.next.Construction).toBeUndefined();
    expect(plano.next.Material).toBeUndefined();
    expect(plano.retained).toEqual([]);
  });
});
