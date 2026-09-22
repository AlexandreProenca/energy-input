/**
 * Dicionário pt-BR dos nomes que o resumo permanente devolve em inglês.
 *
 * Puro e sem dependência (AGENTS.md §7). Está em `src/core/` para poder ser testado: o teste
 * que importa percorre a **fixture real** e exige tradução para todo nome que ela contém —
 * uma lista escrita à mão validaria a si mesma.
 *
 * ## Por que este arquivo existe
 *
 * O dicionário anterior vivia em `SimulationDialog.tsx` com sete entradas, e duas delas
 * eram **dado morto**: estavam grafadas `InteriorLighting` e `InteriorEquipment`, enquanto
 * a API manda `Interior Lighting` e `Interior Equipment`, com espaço. Nunca casaram. Os três
 * indicadores de conforto e `unconditioned` não tinham entrada nenhuma e apareciam crus, do
 * jeito que saíram do motor: `occupied_heating_setpoint_not_met`.
 *
 * Toda função aqui **devolve o nome original quando não conhece a chave**, nunca string
 * vazia: rótulo em inglês é um defeito visível, e uma célula vazia é um dado que sumiu.
 */

/** Usos finais do motor, na grafia exata que a API devolve em `end_uses[].category`. */
const USOS_FINAIS: Record<string, string> = {
  Heating: 'Aquecimento',
  Cooling: 'Resfriamento',
  'Interior Lighting': 'Iluminação interna',
  'Exterior Lighting': 'Iluminação externa',
  'Interior Equipment': 'Equipamentos internos',
  'Exterior Equipment': 'Equipamentos externos',
  Fans: 'Ventiladores',
  Pumps: 'Bombas',
  'Heat Rejection': 'Rejeição de calor',
  Humidification: 'Umidificação',
  'Heat Recovery': 'Recuperação de calor',
  'Water Systems': 'Sistemas de água',
  Refrigeration: 'Refrigeração',
  Generators: 'Geradores',
};

/**
 * Recursos energéticos, na grafia de `resources[].resource`.
 *
 * `District Cooling` e `District Heating Water` não são tradução decorativa: com
 * `ZoneHVAC:IdealLoadsAirSystem`, que é o que `src/generators/hvac.ts` escreve, a
 * climatização aparece **nesses** recursos e não em `Electricity`. Chamá-los de "água gelada
 * de distrito" no contexto de um modelo residencial confundiria; o rótulo diz o que o número
 * significa para quem lê.
 */
const RECURSOS: Record<string, string> = {
  Electricity: 'Eletricidade',
  'Natural Gas': 'Gás natural',
  Gasoline: 'Gasolina',
  Diesel: 'Diesel',
  Coal: 'Carvão',
  'Fuel Oil No 1': 'Óleo combustível 1',
  'Fuel Oil No 2': 'Óleo combustível 2',
  Propane: 'GLP',
  'Other Fuel 1': 'Outro combustível 1',
  'Other Fuel 2': 'Outro combustível 2',
  'District Cooling': 'Resfriamento (sistema ideal)',
  'District Heating Water': 'Aquecimento (sistema ideal)',
  'District Heating Steam': 'Aquecimento a vapor',
  Water: 'Água',
};

/** Áreas de `building_area[].name`. */
const AREAS: Record<string, string> = {
  total: 'Área total',
  conditioned: 'Área climatizada',
  unconditioned: 'Área não climatizada',
};

/**
 * Indicadores de `comfort[].name`.
 *
 * Os dois primeiros medem **controle**, não conforto: contam o tempo em que a temperatura
 * ficou fora do setpoint durante a ocupação. Nos modelos deste aplicativo dão
 * estruturalmente zero, porque `src/generators/hvac.ts` escreve `NoLimit` — um sistema ideal
 * ilimitado sempre atende o setpoint. Chamá-los de "desconforto" mostraria zero para sempre,
 * então o rótulo diz o que eles são.
 */
const CONFORTO: Record<string, string> = {
  occupied_heating_setpoint_not_met: 'Fora do setpoint de aquecimento',
  occupied_cooling_setpoint_not_met: 'Fora do setpoint de resfriamento',
  simple_ashrae_55_not_comfortable: 'Fora da zona de conforto (ASHRAE 55 simples)',
};

const traduzir = (tabela: Record<string, string>) => (nome: string) => tabela[nome] ?? nome;

export const rotuloDeUsoFinal = traduzir(USOS_FINAIS);
export const rotuloDeRecurso = traduzir(RECURSOS);
export const rotuloDeArea = traduzir(AREAS);
export const rotuloDeConforto = traduzir(CONFORTO);

/**
 * Rótulo de qualquer nome do resumo, sem que quem chama precise saber de qual lista ele veio.
 *
 * É o que a tabela do diálogo de simulação precisa: ela concatena `building_area`, `comfort`
 * e `peak_demand` numa lista só, e ali o nome já perdeu a origem.
 */
export function rotuloDoResumo(nome: string): string {
  return AREAS[nome] ?? CONFORTO[nome] ?? RECURSOS[nome] ?? USOS_FINAIS[nome] ?? nome;
}

/**
 * As tabelas, expostas **para o teste de cobertura**.
 *
 * O teste percorre a fixture real e exige que todo nome que ela contém tenha chave aqui. Sem
 * acesso às tabelas isso não seria verificável: `rotuloDeRecurso('Diesel')` devolve `'Diesel'`
 * tanto por tradução quanto por fallback, e um nome sem entrada passaria calado — que é
 * exatamente como `InteriorLighting` sobreviveu no dicionário antigo.
 */
export const TABELAS = {
  usosFinais: USOS_FINAIS,
  recursos: RECURSOS,
  areas: AREAS,
  conforto: CONFORTO,
} as const;
