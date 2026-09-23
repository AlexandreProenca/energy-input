import type { EpJsonDocument } from '@/core/epjson/types';

/**
 * O que o diálogo de simulação decide sem tela (T028): as etapas da execução, o motor e o clima
 * que ele já traz escolhidos. Fica aqui, e não no componente, porque o Vitest deste projeto roda
 * sem DOM — e são estas as decisões que definem o que o usuário vê.
 */

export type EtapaId = 'envio' | 'fila' | 'motor' | 'resultados';
export type EstadoDaEtapa = 'feita' | 'atual' | 'pendente' | 'falhou' | 'interrompida';
export interface Etapa { id: EtapaId; titulo: string; estado: EstadoDaEtapa }

export interface Andamento {
  /** Enviando o modelo ou pedindo a simulação agora. */
  enviando: boolean;
  /** O modelo já foi enviado e existe uma solicitação guardada. */
  tentativa: boolean;
  /** Estado da simulação no serviço, quando ela já existe. */
  status?: string;
  /** Resumo, diagnóstico e arquivos já consultados depois do fim. */
  resultadosProntos: boolean;
}

const TITULOS: Record<EtapaId, string> = {
  envio: 'Envio do modelo',
  fila: 'Na fila',
  motor: 'EnergyPlus',
  resultados: 'Resultados',
};
const ORDEM: EtapaId[] = ['envio', 'fila', 'motor', 'resultados'];

/** Monta a linha do tempo a partir de quantas etapas terminaram e de como está a seguinte. */
function linha(feitas: number, seguinte?: EstadoDaEtapa): Etapa[] {
  return ORDEM.map((id, i) => ({
    id, titulo: TITULOS[id],
    estado: i < feitas ? 'feita' : i === feitas && seguinte ? seguinte : 'pendente',
  }));
}

/**
 * As quatro etapas de uma execução: envio → fila → EnergyPlus → resultados.
 *
 * O serviço só informa o estado atual, não a história. Por isso falha e tempo esgotado são
 * atribuídos ao EnergyPlus, que é onde acontecem na prática, e o cancelamento também — o
 * serviço não diz se a execução chegou a sair da fila. Estado desconhecido, de uma versão futura
 * do serviço, conta como fila: ainda não terminou, e é o que o usuário precisa saber.
 */
export function etapasDaExecucao(a: Andamento): Etapa[] {
  switch (a.status) {
    case undefined:
      if (a.enviando) return linha(0, 'atual');
      return a.tentativa ? linha(0, 'falhou') : linha(0);
    case 'queued': return linha(1, 'atual');
    case 'running': return linha(2, 'atual');
    case 'succeeded': return a.resultadosProntos ? linha(4) : linha(3, 'atual');
    case 'failed':
    case 'timeout': return linha(2, 'falhou');
    case 'cancelled': return linha(2, 'interrompida');
    default: return linha(1, 'atual');
  }
}

/** Onde o modelo está, para achar o clima: o primeiro `Site:Location` com coordenadas válidas. */
export interface LocalDoModelo { nome: string; latitude: number; longitude: number }
export function localDoModelo(doc: EpJsonDocument): LocalDoModelo | undefined {
  for (const [nome, campos] of Object.entries(doc['Site:Location'] ?? {})) {
    const latitude = Number(campos.latitude), longitude = Number(campos.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { nome, latitude, longitude };
    }
  }
  return undefined;
}

/** `lat,lon` como o parâmetro `near` de `/weather` exige: no máximo quatro casas decimais. */
export const pontoDeBusca = (l: LocalDoModelo): string =>
  `${Number(l.latitude.toFixed(4))},${Number(l.longitude.toFixed(4))}`;

const serie = (versao: string) => versao.split('.').slice(0, 2).join('.');
const comparar = (a: string, b: string) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

/** Motores da mesma série (`maior.menor`) que o `Version` do modelo — os únicos que o leem. */
export const motoresCompativeis = (versoes: string[], versaoDoModelo: string): string[] =>
  versaoDoModelo ? versoes.filter(v => serie(v) === serie(versaoDoModelo)) : [];

/**
 * O motor que o diálogo já traz escolhido: o padrão do serviço se for compatível, senão a
 * versão compatível mais nova. Nenhum compatível, nenhum escolhido — o diálogo avisa.
 */
export function motorPreferido(versoes: string[], padrao: string | undefined, versaoDoModelo: string): string {
  const compativeis = motoresCompativeis(versoes, versaoDoModelo);
  if (padrao && compativeis.includes(padrao)) return padrao;
  return [...compativeis].sort(comparar).at(-1) ?? '';
}

/**
 * O clima mais próximo do modelo, entre os que a busca por `near` devolveu. O raio já foi
 * aplicado pelo serviço; aqui só se escolhe o menor `distance_km`, sem confiar na ordem da lista.
 * Item sem distância fica por último: não há como saber se está perto.
 */
export function climaMaisProximo<T extends { id: string; distance_km?: number | null }>(itens: T[]): T | undefined {
  const d = (w: T) => (typeof w.distance_km === 'number' ? w.distance_km : Infinity);
  return itens.reduce<T | undefined>((melhor, w) => (!melhor || d(w) < d(melhor) ? w : melhor), undefined);
}
