import { describe, expect, it } from 'vitest';
import { defaultAnswers } from '../answers';
import { generateDocument } from '../compose';
import { templates } from '@/templates';
import { loadTestSchema } from '@/core/testSchema';
import { checkCrossReferences } from '@/core/validation/crossRefs';
import { useWizardStore } from '@/store/wizardStore';
import { addOpening, constructionLayers } from '@/core/geometry/edits';
import { readGeometryModel } from '@/core/geometry/model';

const { validator, index } = loadTestSchema();
describe('presets residenciais', () => {
  it.each(['box', 'plan'] as const)('gera apartamento %s com lajes e vidro físico de 4 mm, sem aberturas automáticas', mode => {
    const a = defaultAnswers();
    a.envelope = { ...a.envelope, presetId: 'apartamento', floorFinish: 'vinyl' };
    a.windows.glazingId = 'pvc_4mm';
    a.geometry = { ...a.geometry, mode, floors: 2, groundFloor: 'adjacent', topFloor: 'adjacent',
      rooms: [{ id: 'a', name: 'Sala', points: [[0,0], [4,0], [4,4], [0,4]] }] };
    const d = generateDocument(a, templates).document;
    expect(validator.validate(d)).toEqual([]);
    expect(checkCrossReferences(d, index)).toEqual([]);
    expect(d['FenestrationSurface:Detailed']).toBeUndefined();
    const surfaces = Object.values(d['BuildingSurface:Detailed']);
    const slabs = surfaces.filter(s => s.surface_type === 'Floor' || s.surface_type === 'Ceiling');
    expect(slabs.filter(s => s.outside_boundary_condition === 'Adiabatic')).toHaveLength(2);
    expect(slabs.filter(s => s.outside_boundary_condition === 'Surface')).toHaveLength(2);
    expect(slabs.some(s => ['Ground','Outdoors'].includes(s.outside_boundary_condition as string))).toBe(false);
    for (const slab of slabs) {
      const layers = constructionLayers(d, slab.construction_name as string);
      expect(layers.some(l => l.includes('vinílico'))).toBe(true);
      expect(layers.some(l => l.includes('cerâmico'))).toBe(false);
    }
    const wall = [...readGeometryModel(d).surfaces.values()].find(s => s.category === 'Wall')!;
    expect(constructionLayers(d, wall.construction!).some(n => n.includes('Bloco de concreto'))).toBe(true);
    expect(Object.values(d['WindowMaterial:Glazing'])[0].thickness).toBe(0.004);
    const construction = 'Janela - PVC com vidro incolor 4 mm';
    const opened = addOpening(d, readGeometryModel(d), wall.name, { category: 'Window', construction,
      rect: { x: 0.2, y: 0.5, width: 1, height: 1 } });
    expect(opened.doc['FenestrationSurface:Detailed'][opened.name].frame_and_divider_name).toBe(`${construction} - Esquadria PVC`);
    expect(validator.validate(opened.doc)).toEqual([]);
    expect(checkCrossReferences(opened.doc, index)).toEqual([]);
  });
  it('seleciona materiais e contatos em uma atualização sem habilitar aberturas', () => {
    useWizardStore.getState().startFresh(defaultAnswers());
    useWizardStore.getState().update('envelope', { presetId: 'apartamento' });
    let a = useWizardStore.getState().answers;
    expect(a.geometry.groundFloor).toBe('adjacent');
    expect(a.geometry.topFloor).toBe('adjacent');
    expect(a.windows.glazingId).toBe('pvc_4mm');
    expect(a.windows.automatic).toBe(false);
    useWizardStore.getState().update('envelope', { presetId: 'padrao' });
    a = useWizardStore.getState().answers;
    expect(a.geometry.groundFloor).toBe('slab');
    expect(a.geometry.topFloor).toBe('roof');
    expect(a.windows.glazingId).toBe('simples');
  });
});
