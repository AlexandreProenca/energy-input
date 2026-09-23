import { describe, expect, it } from 'vitest';
import {
  climaMaisProximo, etapasDaExecucao, localDoModelo, motoresCompativeis, motorPreferido, pontoDeBusca,
  type Andamento,
} from '../acompanhamento';

const estados = (a: Partial<Andamento>) =>
  etapasDaExecucao({ enviando: false, tentativa: false, resultadosProntos: false, ...a }).map(e => e.estado);

describe('etapas da execução', () => {
  it('seguem o ciclo feliz, uma etapa atual por vez', () => {
    expect(estados({ enviando: true })).toEqual(['atual', 'pendente', 'pendente', 'pendente']);
    expect(estados({ tentativa: true, status: 'queued' })).toEqual(['feita', 'atual', 'pendente', 'pendente']);
    expect(estados({ tentativa: true, status: 'running' })).toEqual(['feita', 'feita', 'atual', 'pendente']);
    expect(estados({ tentativa: true, status: 'succeeded' })).toEqual(['feita', 'feita', 'feita', 'atual']);
    expect(estados({ tentativa: true, status: 'succeeded', resultadosProntos: true })).toEqual(['feita', 'feita', 'feita', 'feita']);
  });

  it('marcam o envio como falho quando o pedido ficou sem resposta', () => {
    // Modelo enviado, pedido de simulação sem resposta: é o caso do "Retomar solicitação".
    expect(estados({ tentativa: true })).toEqual(['falhou', 'pendente', 'pendente', 'pendente']);
  });

  it('atribuem falha e tempo esgotado ao EnergyPlus, e o cancelamento como interrupção', () => {
    expect(estados({ status: 'failed' })).toEqual(['feita', 'feita', 'falhou', 'pendente']);
    expect(estados({ status: 'timeout' })).toEqual(['feita', 'feita', 'falhou', 'pendente']);
    expect(estados({ status: 'cancelled' })).toEqual(['feita', 'feita', 'interrompida', 'pendente']);
  });

  it('não chamam de concluída a execução acompanhada pelo ID sem resultados consultados', () => {
    // Acompanhar pelo ID não tem tentativa local; o que encerra "Resultados" é a consulta.
    expect(estados({ status: 'succeeded' }).at(-1)).toBe('atual');
  });

  it('tratam estado desconhecido como ainda em andamento', () => {
    expect(estados({ status: 'provisioning' })).toEqual(['feita', 'atual', 'pendente', 'pendente']);
  });

  it('têm sempre os mesmos quatro títulos, na ordem', () => {
    expect(etapasDaExecucao({ enviando: false, tentativa: false, resultadosProntos: false }).map(e => e.titulo))
      .toEqual(['Envio do modelo', 'Na fila', 'EnergyPlus', 'Resultados']);
  });
});

describe('local do modelo', () => {
  it('lê nome e coordenadas do Site:Location', () => {
    const doc = { 'Site:Location': { 'Florianópolis - SC': { latitude: -27.67, longitude: -48.55, time_zone: -3 } } };
    expect(localDoModelo(doc)).toEqual({ nome: 'Florianópolis - SC', latitude: -27.67, longitude: -48.55 });
  });

  it('ignora local sem coordenadas válidas', () => {
    expect(localDoModelo({})).toBeUndefined();
    expect(localDoModelo({ 'Site:Location': { X: { latitude: 'autocalculate', longitude: 10 } } })).toBeUndefined();
    expect(localDoModelo({ 'Site:Location': { X: { latitude: 95, longitude: 10 } } })).toBeUndefined();
  });

  it('forma o ponto de busca que o parâmetro `near` aceita', () => {
    // O contrato só aceita `-?\d{1,3}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?`: sem notação científica.
    expect(pontoDeBusca({ nome: 'X', latitude: -27.670000001, longitude: -48.5 })).toBe('-27.67,-48.5');
    expect(pontoDeBusca({ nome: 'X', latitude: 0.00001, longitude: 0 })).toBe('0,0');
    expect(pontoDeBusca({ nome: 'X', latitude: -23.5505, longitude: -46.6333 })).toMatch(/^-?\d{1,3}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/);
  });
});

describe('motor escolhido', () => {
  it('só oferece motores da mesma série do modelo', () => {
    expect(motoresCompativeis(['25.2.0', '26.1.0', '26.1.1'], '26.1')).toEqual(['26.1.0', '26.1.1']);
    expect(motoresCompativeis(['26.1.0'], '')).toEqual([]);
  });

  it('prefere o padrão do serviço, se compatível, e senão a versão compatível mais nova', () => {
    expect(motorPreferido(['26.1.0', '26.1.1', '25.2.0'], '26.1.0', '26.1')).toBe('26.1.0');
    expect(motorPreferido(['26.1.10', '26.1.9', '25.2.0'], '25.2.0', '26.1')).toBe('26.1.10');
    expect(motorPreferido(['25.2.0'], '25.2.0', '26.1')).toBe('');
  });
});

describe('clima mais próximo', () => {
  it('escolhe a menor distância sem confiar na ordem da lista', () => {
    expect(climaMaisProximo([{ id: 'b', distance_km: 40 }, { id: 'a', distance_km: 7.8 }])?.id).toBe('a');
  });

  it('deixa por último o clima sem distância, e não escolhe nada numa lista vazia', () => {
    expect(climaMaisProximo([{ id: 'sem', distance_km: null }, { id: 'perto', distance_km: 90 }])?.id).toBe('perto');
    expect(climaMaisProximo([])).toBeUndefined();
  });
});
