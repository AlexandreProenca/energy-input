import { describe, expect, it } from 'vitest';
import { LISTAS_SEM_SINTESE, checkCrossReferences } from '../crossRefs';
import { loadTestSchema } from '../../testSchema';
import type { EpJsonDocument } from '../../epjson/types';

const { index } = loadTestSchema();
const severidades = (doc: EpJsonDocument) =>
  checkCrossReferences(doc, index).map((i) => ({ campo: i.itemField ?? i.field, severidade: i.severity }));

/**
 * Qual referência inexistente impede a simulação.
 *
 * O diálogo de simulação só bloqueia **erro**. Uma janela com `construction_name`
 * inexistente passava como aviso, o modelo seguia para o serviço, e o EnergyPlus parava com
 * `invalid construction_name` em `GetSurfaceData` — simulação real, perdida.
 */
describe('referência inexistente na cadeia da janela é erro', () => {
  it('janela apontando para construção que não existe', () => {
    const doc = { 'FenestrationSurface:Detailed': { J: { construction_name: 'Não existe' } } };
    expect(severidades(doc)).toContainEqual({ campo: 'construction_name', severidade: 'error' });
  });

  it('construção apontando para material que não existe', () => {
    // A construção sozinha não basta: o motor também para se a camada não existir.
    const doc = { Construction: { C: { outside_layer: 'Não existe' } } };
    expect(severidades(doc)).toContainEqual({ campo: 'outside_layer', severidade: 'error' });
  });

  it('a mesma janela com a construção presente não acusa nada', () => {
    // Contraprova: o erro vem da falta do alvo, não do tipo do objeto.
    const doc = {
      Construction: { C: { outside_layer: 'Vidro' } },
      'WindowMaterial:SimpleGlazingSystem': { Vidro: { u_factor: 5.8, solar_heat_gain_coefficient: 0.8 } },
      'FenestrationSurface:Detailed': { J: { construction_name: 'c' } },
    };
    expect(checkCrossReferences(doc, index).filter((i) => i.field === 'construction_name' || i.field === 'outside_layer'))
      .toEqual([]);
  });
});

describe('onde o EnergyPlus sintetiza nomes, a falta segue como aviso', () => {
  /**
   * Termostato expandido por `ZoneList`, espaço criado automaticamente: nomes que o
   * EnergyPlus cria e o índice do schema não conhece. A regra "campo obrigatório vira erro",
   * tentada antes desta, acusava 25 dos 752 exemplos oficiais — todos rodam no motor.
   */
  it('termostato por zona não é erro, mesmo sendo campo obrigatório', () => {
    const doc = {
      'ZoneControl:Thermostat:OperativeTemperature': {
        T: { thermostat_name: 'SPACE3-1 AllControlledZones Thermostat', radiative_fraction_input_mode: 'Constant' },
      },
    };
    const issues = checkCrossReferences(doc, index).filter((i) => i.field === 'thermostat_name');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });
});

describe('a lista que vira erro é medida', () => {
  it('fica restrita à cadeia janela → construção → material → esquadria', () => {
    // Ampliar esta lista exige medir de novo contra os exemplos do EnergyPlus: uma lista em
    // que o motor sintetiza nomes transformaria modelos válidos em bloqueados.
    expect([...LISTAS_SEM_SINTESE].sort()).toEqual(['ConstructionNames', 'MaterialName', 'WindowFrameAndDividerNames']);
  });
});
