import { describe, expect, it } from 'vitest';
import { loadTestSchema } from '@/core/testSchema';
import { checkCrossReferences, checkDuplicateNames } from '@/core/validation/crossRefs';
import { planWizardSync } from '@/core/sync/wizardSync';
import { templates } from '@/templates';
import { defaultAnswers, type WizardAnswers } from '../answers';
import { generateDocument } from '../compose';
import { alternarClimatizacao, ambientesClimatizaveis, chaveDoAmbiente, chaveDoPavimento, climatizado, resumoDaClimatizacao } from '../conditioning';
import { THERMOSTAT_NAME } from '../hvac';
import type { PlanRoom } from '../geometry/floorPlan';

const { validator, index } = loadTestSchema();
const rect = (id: string, x: number, y: number, w: number, h: number): PlanRoom => ({ id, name: id, points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] });

/** Planta de dois pavimentos com Sala (4×4) e Garagem (3×4) lado a lado. */
function planta(unconditioned?: string[]): WizardAnswers {
  const a = defaultAnswers();
  a.geometry = { ...a.geometry, mode: 'plan', floors: 2, rooms: [rect('Sala', 0, 0, 4, 4), rect('Garagem', 4, 0, 3, 4)] };
  a.hvac = { ...a.hvac, unconditioned };
  return a;
}

function valido(answers: WizardAnswers) {
  const { document } = generateDocument(answers, templates);
  expect(validator.validate(document), 'schema').toEqual([]);
  expect(checkCrossReferences(document, index), 'referências').toEqual([]);
  expect(checkDuplicateNames(document)).toEqual([]);
  return document;
}

const zonasControladas = (doc: Record<string, Record<string, Record<string, unknown>>>) =>
  Object.values(doc['ZoneControl:Thermostat'] ?? {}).map((c) => c.zone_or_zonelist_name).sort();
const zonasComSistema = (doc: Record<string, Record<string, Record<string, unknown>>>) =>
  Object.values(doc['ZoneHVAC:EquipmentConnections'] ?? {}).map((c) => c.zone_name).sort();

describe('ambientes climatizáveis', () => {
  it('são os ambientes da planta, com a área de um pavimento e quantos pavimentos', () => {
    expect(ambientesClimatizaveis(planta().geometry)).toEqual([
      { chave: chaveDoAmbiente('Sala'), nome: 'Sala', area: 16, pavimentos: 2 },
      { chave: chaveDoAmbiente('Garagem'), nome: 'Garagem', area: 12, pavimentos: 2 },
    ]);
  });

  it('no modo caixa, são os pavimentos', () => {
    const a = defaultAnswers(); a.geometry = { ...a.geometry, floors: 2 };
    expect(ambientesClimatizaveis(a.geometry).map((x) => [x.chave, x.nome])).toEqual([
      [chaveDoPavimento(0), 'Pavimento 1'], [chaveDoPavimento(1), 'Pavimento 2'],
    ]);
  });

  it('nascem climatizados: resposta ausente, vazia ou de autosave antigo', () => {
    const { hvac } = defaultAnswers();
    expect(hvac.unconditioned).toBeUndefined();
    expect(climatizado(chaveDoAmbiente('Sala'), hvac)).toBe(true);
    expect(climatizado(chaveDoAmbiente('Sala'), { ...hvac, unconditioned: [] })).toBe(true);
    // Zona sem chave vem de fora do assistente e continua como sempre foi.
    expect(climatizado(undefined, { ...hvac, unconditioned: [chaveDoAmbiente('Sala')] })).toBe(true);
  });
});

describe('geração com ambiente não climatizado', () => {
  it('por padrão, toda zona tem sistema e termostato', () => {
    const doc = valido(planta());
    const todas = ['Pavimento 1 · Garagem', 'Pavimento 1 · Sala', 'Pavimento 2 · Garagem', 'Pavimento 2 · Sala'];
    expect(zonasControladas(doc)).toEqual(todas);
    expect(zonasComSistema(doc)).toEqual(todas);
  });

  it('tira sistema e termostato do ambiente desmarcado, em todos os pavimentos', () => {
    const doc = valido(planta([chaveDoAmbiente('Garagem')]));
    expect(zonasControladas(doc)).toEqual(['Pavimento 1 · Sala', 'Pavimento 2 · Sala']);
    expect(zonasComSistema(doc)).toEqual(['Pavimento 1 · Sala', 'Pavimento 2 · Sala']);
    expect(Object.keys(doc['ZoneHVAC:IdealLoadsAirSystem'])).toEqual(['Pavimento 1 · Sala Sistema ideal', 'Pavimento 2 · Sala Sistema ideal']);
    // A zona continua existindo, com cargas internas: só não é controlada.
    expect(doc.Zone['Pavimento 1 · Garagem']).toBeDefined();
  });

  it('sem nenhum ambiente climatizado, não gera tipo vazio e mantém a faixa de conforto', () => {
    const doc = valido(planta([chaveDoAmbiente('Sala'), chaveDoAmbiente('Garagem')]));
    for (const tipo of ['ZoneControl:Thermostat', 'ZoneHVAC:IdealLoadsAirSystem', 'ZoneHVAC:EquipmentList', 'ZoneHVAC:EquipmentConnections']) {
      expect(doc[tipo], tipo).toBeUndefined();
    }
    // O modo Resultados lê a faixa de conforto do termostato do documento (setpoints.ts).
    expect(doc['ThermostatSetpoint:DualSetpoint'][THERMOSTAT_NAME]).toBeDefined();
  });

  it('ignora chave de ambiente que não existe mais', () => {
    expect(zonasComSistema(valido(planta([chaveDoAmbiente('Apagado')])))).toHaveLength(4);
  });

  it('no modo caixa, desmarca um pavimento', () => {
    const a = defaultAnswers(); a.geometry = { ...a.geometry, floors: 2 }; a.hvac = { ...a.hvac, unconditioned: [chaveDoPavimento(0)] };
    expect(zonasComSistema(valido(a))).toEqual(['Pavimento 2']);
  });
});

describe('sincronização com o documento', () => {
  it('desmarcar remove o sistema do documento sem deixar referência órfã, e remarcar o devolve', () => {
    const antes = generateDocument(planta(), templates).document;
    const primeiro = planWizardSync({}, antes, {}, 'overwrite');
    const depois = generateDocument(planta([chaveDoAmbiente('Garagem')]), templates).document;
    const desmarcado = planWizardSync(primeiro.next, depois, primeiro.owned, 'overwrite');
    expect(desmarcado.conflicts).toEqual([]);
    expect(zonasComSistema(desmarcado.next)).toEqual(['Pavimento 1 · Sala', 'Pavimento 2 · Sala']);
    expect(Object.keys(desmarcado.next['Schedule:Compact'])).toEqual(expect.arrayContaining(Object.keys(depois['Schedule:Compact'])));
    expect(checkCrossReferences(desmarcado.next, index)).toEqual([]);

    const remarcado = planWizardSync(desmarcado.next, antes, desmarcado.owned, 'overwrite');
    expect(zonasComSistema(remarcado.next)).toHaveLength(4);
  });
});

describe('marcar e desmarcar', () => {
  it('desmarca e remarca um ambiente', () => {
    const g = planta().geometry;
    const fora = alternarClimatizacao(g, undefined, chaveDoAmbiente('Garagem'), false);
    expect(fora).toEqual([chaveDoAmbiente('Garagem')]);
    expect(alternarClimatizacao(g, fora, chaveDoAmbiente('Garagem'), true)).toEqual([]);
  });

  it('limpa ambiente apagado, mas guarda a escolha do outro modo', () => {
    // Achado da revisão do PR: a primeira versão descartava os pavimentos desmarcados no modo
    // caixa ao mexer na planta, e voltar ao modo caixa esquecia a escolha.
    const g = planta().geometry;
    const antes = [chaveDoAmbiente('Apagado'), chaveDoPavimento(0)];
    expect(alternarClimatizacao(g, antes, chaveDoAmbiente('Sala'), false).sort())
      .toEqual([chaveDoAmbiente('Sala'), chaveDoPavimento(0)].sort());
    // No modo caixa, os ambientes da planta continuam em `rooms`: a escolha deles fica.
    const caixa = { ...g, mode: 'box' as const };
    expect(alternarClimatizacao(caixa, [chaveDoAmbiente('Sala')], chaveDoPavimento(1), false).sort())
      .toEqual([chaveDoAmbiente('Sala'), chaveDoPavimento(1)].sort());
  });

  it('guarda o pavimento que deixou de existir, porque ele volta com o mesmo índice', () => {
    // Segunda rodada da revisão: ir de 3 para 2 pavimentos e mexer na lista esquecia o terceiro.
    const a = defaultAnswers(); const g = { ...a.geometry, floors: 2 };
    expect(alternarClimatizacao(g, [chaveDoPavimento(2)], chaveDoPavimento(0), false).sort())
      .toEqual([chaveDoPavimento(0), chaveDoPavimento(2)].sort());
  });

  it('descarta o que não é chave conhecida', () => {
    expect(alternarClimatizacao(planta().geometry, ['lixo', 'pavimento:x'], chaveDoAmbiente('Sala'), false)).toEqual([chaveDoAmbiente('Sala')]);
  });
});

describe('resumo da Revisão', () => {
  it('diz quantos são climatizados e quais ficam de fora', () => {
    const a = planta();
    expect(resumoDaClimatizacao(a.geometry, a.hvac)).toBe('todos os 2 ambientes climatizados');
    expect(resumoDaClimatizacao(a.geometry, { ...a.hvac, unconditioned: [chaveDoAmbiente('Garagem')] }))
      .toBe('1 de 2 ambientes climatizados; sem climatização: Garagem');
    expect(resumoDaClimatizacao(a.geometry, { ...a.hvac, unconditioned: [chaveDoAmbiente('Sala'), chaveDoAmbiente('Garagem')] }))
      .toBe('nenhum ambiente climatizado — o edifício evolui livre');
    const caixa = defaultAnswers();
    expect(resumoDaClimatizacao(caixa.geometry, caixa.hvac)).toBe('o pavimento climatizado');
  });
});
