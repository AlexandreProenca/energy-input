import { create } from 'zustand';
import { SimulationApi, SimulationApiError, isSeriesExpired, seriesCandidates, type Frequency, type TimeSeriesPoint, type SeriesVariable } from '@/features/simulation/api';
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
  /** Temperatura operativa da zona escolhida, e a externa para referência. */
  interna?: SerieCarregada;
  externa?: SerieCarregada;
  /** Zonas que o serviço reconheceu, quando a variável existe em mais de uma. */
  zonas: string[];
  zonaEscolhida?: string;
  /**
   * Frequência de cada zona, como o 422 a informou. Vai junto da chave porque o serviço pede
   * "escolha uma por key e frequency": um modelo que gravasse a mesma zona em horária e
   * diária continuaria ambíguo só com a chave.
   */
  frequenciaDaZona: Record<string, Frequency>;
  carregandoTemperatura: boolean;
  carregarMedidores: () => Promise<void>;
  carregarTemperaturas: (zona?: string) => Promise<void>;
  limpar: () => void;
}

/**
 * A variável de temperatura operativa, e a externa de que a faixa adaptativa depende.
 *
 * Quando a execução tem mais de uma zona, consultar sem `key` devolve **422 com as
 * candidatas** — é a única forma de descobri-las, porque o catálogo é de tipos e não traz
 * chave. Com uma zona só, a consulta sem chave resolve direto.
 */
const OPERATIVA = 'Zone Operative Temperature';
const EXTERNA = 'Site Outdoor Air Drybulb Temperature';

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

/**
 * Carga em curso, para que a mais nova assuma o lugar da anterior.
 *
 * Sem isso, trocar de execução no meio de uma carga travava o painel: a carga antiga
 * abandonava sem repor `carregando: false`, e um guarda por `carregando` impedia a nova de
 * começar — "Lendo os medidores…" para sempre. O `AbortController` ainda interrompe as
 * requisições em voo, que de outro modo continuariam baixando séries de 8 760 pontos que
 * ninguém mais vai ver.
 */
let emCurso: { id: number; abort: AbortController } | undefined;
let tempEmCurso: { id: number; abort: AbortController } | undefined;
let proximaGeracao = 0;

export const useResultsStore = create<ResultsState>((set, get) => ({
  carregando: false,
  carregandoTemperatura: false,
  expirada: false,
  medidores: [],
  ausentes: [],
  zonas: [],
  frequenciaDaZona: {},

  limpar: () => {
    emCurso?.abort.abort();
    emCurso = undefined;
    set({
      simulationId: undefined, medidores: [], ausentes: [], erro: undefined, expirada: false,
      carregando: false, carregandoTemperatura: false, interna: undefined, externa: undefined,
      zonas: [], zonaEscolhida: undefined, frequenciaDaZona: {},
    });
  },

  /**
   * Temperatura operativa de uma zona, com a externa junto.
   *
   * Sem `zona`, consulta sem chave: resolve direto quando há uma só, e devolve 422 com as
   * candidatas quando há várias — que é como as zonas são descobertas, já que o catálogo
   * não as traz.
   */
  async carregarTemperaturas(zona?: string) {
    const simulation = useSimulationStore.getState().simulation;
    if (!simulation || simulation.status !== 'succeeded') return;

    tempEmCurso?.abort.abort();
    const minha = ++proximaGeracao;
    const abort = new AbortController();
    tempEmCurso = { id: minha, abort };
    const atual = () => tempEmCurso?.id === minha;

    set({ carregandoTemperatura: true, erro: undefined, zonaEscolhida: zona });
    try {
      const frequencia = zona ? get().frequenciaDaZona[zona] : undefined;
      const interna = await api().allTimeseries(
        simulation.id,
        { variable: OPERATIVA, ...(zona ? { key: zona } : {}), ...(frequencia ? { frequency: frequencia } : {}) },
        12,
        abort.signal,
      );
      if (!atual()) return;
      // A externa pode faltar sem que isso invalide o painel: ela só é necessária para a
      // faixa adaptativa, e a fixa continua valendo.
      const externa = await api()
        .allTimeseries(simulation.id, { variable: EXTERNA }, 12, abort.signal)
        .catch(() => undefined);
      if (!atual()) return;
      tempEmCurso = undefined;
      set({
        carregandoTemperatura: false,
        interna: { variable: interna.variable, itens: interna.itens, completa: interna.completa },
        externa: externa && { variable: externa.variable, itens: externa.itens, completa: externa.completa },
        zonaEscolhida: interna.variable.key || zona,
        zonas: get().zonas.length ? get().zonas : [interna.variable.key].filter(Boolean),
      });
    } catch (e) {
      if (!atual()) return;
      tempEmCurso = undefined;
      const candidatas = seriesCandidates(e);
      // Só a consulta SEM zona descobre candidatas. Se o usuário já escolheu uma e ela
      // falhou, repor a lista e limpar a escolha o devolveria ao seletor para escolher de
      // novo, em laço — o erro tem de aparecer.
      if (candidatas.length && !zona) {
        const zonas = [...new Set(candidatas.map((c) => c.key))];
        const frequenciaDaZona: Record<string, Frequency> = {};
        for (const c of candidatas) if (c.frequency && !frequenciaDaZona[c.key]) frequenciaDaZona[c.key] = c.frequency;
        set({ zonas, frequenciaDaZona });
        // Abre a primeira zona em vez de esperar a escolha. Parado no seletor, os dois
        // painéis diriam "esta execução não registrou a temperatura operativa" — falso, e
        // o mesmo tipo de defeito da T008. A troca continua no seletor.
        return get().carregarTemperaturas(zonas[0]);
      }
      // 422 sem candidatas, na consulta sem zona, é "a execução não registrou a variável":
      // ausência esperada, como nos medidores, e o painel explica em vez de acusar erro.
      if (!zona && e instanceof SimulationApiError && e.status === 422) {
        set({ carregandoTemperatura: false, interna: undefined, externa: undefined });
        return;
      }
      set({
        carregandoTemperatura: false,
        expirada: isSeriesExpired(e) || get().expirada,
        erro: isSeriesExpired(e) ? undefined : e instanceof Error ? e.message : String(e),
      });
    }
  },

  async carregarMedidores() {
    const simulation = useSimulationStore.getState().simulation;
    // Só execução concluída tem série. Antes disso o serviço responde 409, e pedir seria
    // transformar um estado normal da interface em erro.
    if (!simulation || simulation.status !== 'succeeded') return;
    // Já carregada e parada: nada a fazer. Carregando, porém, **não** bloqueia — é o caso
    // de troca de execução, em que a nova precisa assumir.
    if (get().simulationId === simulation.id && !get().carregando) return;

    emCurso?.abort.abort();
    const minha = ++proximaGeracao;
    const abort = new AbortController();
    emCurso = { id: minha, abort };
    const atual = () => emCurso?.id === minha;

    set({ carregando: true, erro: undefined, expirada: false, medidores: [], ausentes: [], simulationId: simulation.id });
    const encontrados: SerieCarregada[] = [];
    const ausentes: string[] = [];
    let expirada = false;
    let erro: string | undefined;

    for (const medidor of MEDIDORES) {
      // Uma carga mais nova assumiu: abandonar em silêncio é melhor que escrever a série de
      // uma simulação sobre o painel de outra. Quem assumiu já cuida de `carregando`.
      if (!atual()) return;
      try {
        const serie = await api().allTimeseries(simulation.id, { variable: medidor.nome }, 12, abort.signal);
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

    if (!atual()) return;
    emCurso = undefined;
    set({ carregando: false, medidores: encontrados, ausentes, expirada, erro });
  },
}));
