import { create } from 'zustand';
import { SimulationApi, isSeriesExpired, type TimeSeriesPoint, type SeriesVariable } from '@/features/simulation/api';
import { useSimulationStore } from '@/features/simulation/simulationStore';

/**
 * Séries de resultado da execução adotada.
 *
 * **Nada aqui é persistido.** Um ano horário são 8 760 pontos por variável, e gravá-los em
 * `sessionStorage` estouraria a cota; além disso a credencial e os resultados ficam só em
 * memória por decisão de projeto (AGENTS.md §7).
 */

export interface SerieCarregada {
  variable: SeriesVariable;
  itens: TimeSeriesPoint[];
  /** `false` quando a paginação parou no teto ou num cursor que se repete. */
  completa: boolean;
}

interface ResultsState {
  /** Execução de que as séries abaixo vieram. Protege contra resposta atrasada. */
  simulationId?: string;
  carregando: boolean;
  /** A série expirou com o `.sql`; o resumo permanente continua valendo. */
  expirada: boolean;
  erro?: string;
  /** Medidores encontrados, na ordem em que foram procurados. */
  medidores: SerieCarregada[];
  /** Variáveis que a execução não registrou, para o painel explicar a ausência. */
  ausentes: string[];
  carregarMedidores: () => Promise<void>;
  limpar: () => void;
}

/**
 * Medidores procurados, do mais específico para o mais abrangente.
 *
 * A busca é por tentativa porque o catálogo (`/results/variables`) é de **tipos** vindos do
 * RDD/MDD e não diz o que a execução gravou — confirmado na T001, em que uma variável
 * registrada nem aparecia na primeira página do catálogo.
 *
 * `EnergyTransfer` vem junto de propósito: com `ZoneHVAC:IdealLoadsAirSystem`, que é o que
 * este aplicativo gera, a climatização **não** aparece como `Electricity`.
 */
const MEDIDORES = [
  { nome: 'Electricity:Facility', rotulo: 'Eletricidade', cor: '#187352' },
  { nome: 'InteriorLights:Electricity', rotulo: 'Iluminação', cor: '#f6b73c' },
  { nome: 'InteriorEquipment:Electricity', rotulo: 'Equipamentos', cor: '#77c8a4' },
  { nome: 'DistrictHeatingWater:Facility', rotulo: 'Aquecimento', cor: '#ef6c35' },
  { nome: 'DistrictCooling:Facility', rotulo: 'Resfriamento', cor: '#5b9bc0' },
  { nome: 'NaturalGas:Facility', rotulo: 'Gás natural', cor: '#94a3b8' },
  { nome: 'EnergyTransfer:Facility', rotulo: 'Energia transferida', cor: '#248f66' },
] as const;

export const rotuloDoMedidor = (nome: string) =>
  MEDIDORES.find((m) => m.nome === nome)?.rotulo ?? nome;
export const corDoMedidor = (nome: string) =>
  MEDIDORES.find((m) => m.nome === nome)?.cor ?? '#94a3b8';

const api = () => new SimulationApi(useSimulationStore.getState().token);

export const useResultsStore = create<ResultsState>((set, get) => ({
  carregando: false,
  expirada: false,
  medidores: [],
  ausentes: [],

  limpar: () => set({ simulationId: undefined, medidores: [], ausentes: [], erro: undefined, expirada: false }),

  async carregarMedidores() {
    const simulation = useSimulationStore.getState().simulation;
    // Só execução concluída tem série. Antes disso o serviço responde 409, e pedir seria
    // transformar um estado normal da interface em erro.
    if (!simulation || simulation.status !== 'succeeded') return;
    if (get().carregando || get().simulationId === simulation.id) return;

    set({ carregando: true, erro: undefined, expirada: false, medidores: [], ausentes: [], simulationId: simulation.id });
    const encontrados: SerieCarregada[] = [];
    const ausentes: string[] = [];
    let expirada = false;
    let erro: string | undefined;

    for (const medidor of MEDIDORES) {
      // A execução pode ter sido trocada enquanto a busca corria: abandonar em silêncio é
      // melhor que escrever a série de uma simulação sobre o painel de outra.
      if (useSimulationStore.getState().simulation?.id !== simulation.id) return;
      try {
        const serie = await api().allTimeseries(simulation.id, { variable: medidor.nome });
        encontrados.push({ variable: serie.variable, itens: serie.itens, completa: serie.completa });
      } catch (e) {
        if (isSeriesExpired(e)) { expirada = true; break; }
        // 422 é "a execução não registrou esta variável" — ausência esperada, não falha.
        if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 422) {
          ausentes.push(medidor.nome);
          continue;
        }
        erro = e instanceof Error ? e.message : String(e);
        break;
      }
    }

    if (useSimulationStore.getState().simulation?.id !== simulation.id) return;
    set({ carregando: false, medidores: encontrados, ausentes, expirada, erro });
  },
}));
