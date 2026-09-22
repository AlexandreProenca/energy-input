import { describe, expect, it } from 'vitest';
import { TABELAS, rotuloDeArea, rotuloDeConforto, rotuloDeRecurso, rotuloDeUsoFinal, rotuloDoResumo } from '../rotulos';
import summary from '../__fixtures__/summary.json';

/**
 * A cobertura é conferida contra a **fixture real** da T001, e não contra uma lista escrita
 * aqui: uma lista à mão validaria a si mesma, que é como o dicionário antigo carregou
 * `InteriorLighting` (sem espaço) por todo esse tempo sem nunca casar com nada.
 */
describe('cobertura dos nomes que a API realmente devolve', () => {
  it('traduz todos os usos finais do resumo', () => {
    const faltando = summary.end_uses.map((u) => u.category).filter((c) => !(c in TABELAS.usosFinais));
    expect(faltando).toEqual([]);
    // 14 categorias: o motor devolve todas sempre, mesmo zeradas.
    expect(summary.end_uses).toHaveLength(14);
  });

  it('traduz todos os recursos, de `end_uses` e de `peak_demand`', () => {
    const nomes = new Set([
      ...summary.end_uses.flatMap((u) => u.resources.map((r) => r.resource)),
      ...summary.peak_demand.map((p) => p.resource),
    ]);
    expect([...nomes].filter((r) => !(r in TABELAS.recursos))).toEqual([]);
    expect(nomes.size).toBe(14);
  });

  it('traduz todas as áreas e todos os indicadores de conforto', () => {
    expect(summary.building_area.map((a) => a.name).filter((n) => !(n in TABELAS.areas))).toEqual([]);
    expect(summary.comfort.map((c) => c.name).filter((n) => !(n in TABELAS.conforto))).toEqual([]);
  });
});

describe('rotuloDoResumo', () => {
  it('acha o nome sem que quem chama saiba de qual lista ele veio', () => {
    // É o que a tabela do diálogo precisa: ela concatena as três listas e ali o nome já
    // perdeu a origem.
    expect(rotuloDoResumo('unconditioned')).toBe('Área não climatizada');
    expect(rotuloDoResumo('occupied_cooling_setpoint_not_met')).toBe('Fora do setpoint de resfriamento');
    expect(rotuloDoResumo('Electricity')).toBe('Eletricidade');
    expect(rotuloDoResumo('Interior Lighting')).toBe('Iluminação interna');
  });
});

describe('nome desconhecido', () => {
  /**
   * Devolver o original, e nunca string vazia: rótulo em inglês é um defeito visível na
   * tela, e uma célula vazia é um dado que sumiu sem deixar rastro.
   */
  it('passa adiante em vez de virar vazio', () => {
    for (const f of [rotuloDeUsoFinal, rotuloDeRecurso, rotuloDeArea, rotuloDeConforto, rotuloDoResumo]) {
      expect(f('Something The Engine Invented')).toBe('Something The Engine Invented');
      expect(f('')).toBe('');
    }
  });
});

describe('a grafia é a da API, com espaço', () => {
  /**
   * O defeito que motivou este módulo. O dicionário antigo em `SimulationDialog.tsx` tinha
   * `InteriorLighting` e `InteriorEquipment` colados, enquanto a API manda com espaço — as
   * duas entradas nunca casaram, e o painel mostrava o nome em inglês.
   */
  it('casa a grafia com espaço e não a colada', () => {
    expect(rotuloDeUsoFinal('Interior Lighting')).toBe('Iluminação interna');
    expect(rotuloDeUsoFinal('Interior Equipment')).toBe('Equipamentos internos');
    expect(rotuloDeUsoFinal('InteriorLighting')).toBe('InteriorLighting');
  });

  /**
   * Com `ZoneHVAC:IdealLoadsAirSystem`, que é o que `src/generators/hvac.ts` escreve, a
   * climatização aparece nesses dois recursos e não em `Electricity`. Rotulá-los como
   * "distrito" deixaria o usuário procurando um sistema de distrito que não existe.
   */
  it('nomeia os recursos do sistema ideal pelo que eles significam', () => {
    expect(rotuloDeRecurso('District Cooling')).toBe('Resfriamento (sistema ideal)');
    expect(rotuloDeRecurso('District Heating Water')).toBe('Aquecimento (sistema ideal)');
  });
});
