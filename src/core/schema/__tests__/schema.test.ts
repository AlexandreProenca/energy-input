import { describe, expect, it } from 'vitest';
import { loadTestSchema } from '../../testSchema';
import { checkCrossReferences } from '../../validation/crossRefs';
import { renameObject, findReferences } from '../../epjson/document';

describe('schema index', () => {
  const { index, validator } = loadTestSchema();

  it('reads version and all types', () => {
    expect(index.version).toBe('26.1');
    expect(index.typeNames.length).toBeGreaterThan(800);
    expect(index.groups.length).toBeGreaterThan(50);
  });

  it('maps field kinds', () => {
    const zone = index.info('Zone')!;
    const kinds = Object.fromEntries(zone.fields.map((f) => [f.key, f.kind]));
    expect(kinds.ceiling_height).toBe('autoNumber');
    expect(kinds.multiplier).toBe('integer');
    expect(kinds.part_of_total_floor_area).toBe('yesno');
    expect(kinds.zone_inside_convection_algorithm).toBe('enum');
    const surf = index.info('BuildingSurface:Detailed')!;
    const zoneName = surf.fields.find((f) => f.key === 'zone_name')!;
    expect(zoneName.kind).toBe('reference');
    const verts = surf.fields.find((f) => f.key === 'vertices')!;
    expect(verts.kind).toBe('array');
    expect(surf.fields[0].label).toBe('Surface Type');
    expect(index.info('Timestep')!.unique).toBe(true);
    expect(index.info('Timestep')!.hasName).toBe(false);
    const oa = index.info('AirLoopHVAC:OutdoorAirSystem:EquipmentList')!;
    expect(oa.fields.find((f) => f.key === 'component_1_object_type')!.kind).toBe('classReference');
    const ov = index.info('Output:Variable')!;
    expect(ov.fields.find((f) => f.key === 'variable_name')!.kind).toBe('externalList');
  });

  it('validates with translated messages', () => {
    expect(validator.validate({}).map((i) => i.message)).toEqual([
      'Objeto obrigatório ausente: Building',
      'Objeto obrigatório ausente: GlobalGeometryRules',
    ]);
    const issues = validator.validate({
      Building: { B: { terrain: 'Floresta', north_axis: 'x' } },
      GlobalGeometryRules: { G: { starting_vertex_position: 'UpperLeftCorner', vertex_entry_direction: 'Counterclockwise' } },
      Zone: { Z: { ceiling_height: 'abc' } },
      Timestep: { a: {}, b: {} },
      Foo: {},
    });
    const msgs = issues.map((i) => `${i.objectType}/${i.objectName ?? ''}/${i.field ?? ''}: ${i.message}`);
    expect(msgs).toContain('Building/B/terrain: Valor inválido. Opções: City, Country, Ocean, Suburbs, Urban');
    expect(msgs).toContain('Building/B/north_axis: Deve ser um número');
    expect(msgs).toContain('GlobalGeometryRules/G/coordinate_system: Campo obrigatório não preenchido: coordinate_system');
    expect(msgs).toContain('Zone/Z/ceiling_height: Valor inválido: informe um número ou a opção automática');
    expect(msgs.some((m) => m.startsWith('Timestep//: Só pode existir 1'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('Foo//: Tipo de objeto desconhecido'))).toBe(true);
  });

  it('checks references and renames with propagation', () => {
    const doc = {
      Zone: { Sala: {} },
      'BuildingSurface:Detailed': {
        Parede: { zone_name: 'SALA', surface_type: 'Wall', construction_name: 'Nada', outside_boundary_condition: 'Outdoors', vertices: [] },
      },
      ZoneList: { Todas: { zones: [{ zone_name: 'Sala' }] } },
    };
    const refIssues = checkCrossReferences(doc, index);
    expect(refIssues).toHaveLength(1);
    expect(refIssues[0].field).toBe('construction_name');
    expect(findReferences(doc, index, 'Zone', 'Sala')).toHaveLength(2);
    const renamed = renameObject(doc, index, 'Zone', 'Sala', 'Quarto', true);
    expect(Object.keys(renamed.Zone)).toEqual(['Quarto']);
    expect(renamed['BuildingSurface:Detailed'].Parede.zone_name).toBe('Quarto');
    expect((renamed.ZoneList.Todas.zones as { zone_name: string }[])[0].zone_name).toBe('Quarto');
  });
});
