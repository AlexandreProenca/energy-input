import { describe, expect, it } from 'vitest';
import { parseSeriesCandidates } from '../candidatas';
import ambigua from '../__fixtures__/erro-422-chave-ambigua.json';
import inexistente from '../__fixtures__/erro-422-chave-inexistente.json';
import variavelInexistente from '../__fixtures__/erro-422-variavel-inexistente.json';

const A = 'PAVIMENTO 1 · AMBIENTE A';
const B = 'PAVIMENTO 1 · AMBIENTE B';

/**
 * Os três 422 de `/results/timeseries`, capturados de uma execução real com duas zonas. Os
 * nomes dos ambientes foram trocados (é projeto de usuário, e o repositório é público); o
 * formato — maiúsculas, ` · `, aspas — é o do serviço.
 */
describe('as candidatas do 422', () => {
  it('lê chave e frequência da consulta ambígua', () => {
    // O defeito: a mensagem inteira, `candidata: key='…', frequency=hourly`, virava a zona.
    expect(parseSeriesCandidates(ambigua)).toEqual([
      { key: A, frequency: 'hourly' },
      { key: B, frequency: 'hourly' },
    ]);
  });

  it('lê as mesmas candidatas do 422 de chave inexistente', () => {
    // O prefixo muda (`existe:`), a chave não.
    expect(parseSeriesCandidates(inexistente)).toEqual([
      { key: A, frequency: 'hourly' },
      { key: B, frequency: 'hourly' },
    ]);
  });

  it('não inventa candidata no 422 de variável não registrada', () => {
    // A primeira versão devolvia "a simulação não registrou '…'" como se fosse uma zona.
    expect(parseSeriesCandidates(variavelInexistente)).toEqual([]);
  });
});

describe('formatos-limite', () => {
  const com = (...mensagens: string[]) => ({ errors: mensagens.map((message) => ({ field: 'key', message })) });

  it('mantém inteiro o nome com apóstrofo', () => {
    expect(parseSeriesCandidates(com("candidata: key='SALA D'ÁGUA', frequency=hourly"))).toEqual([
      { key: "SALA D'ÁGUA", frequency: 'hourly' },
    ]);
  });

  it('omite a frequência desconhecida em vez de repassá-la', () => {
    expect(parseSeriesCandidates(com("candidata: key='Z', frequency=quinzenal"))).toEqual([{ key: 'Z' }]);
  });

  it('distingue a mesma zona em frequências diferentes, e descarta repetição', () => {
    expect(parseSeriesCandidates(com(
      "candidata: key='Z', frequency=hourly",
      "candidata: key='Z', frequency=daily",
      "candidata: key='Z', frequency=hourly",
    ))).toEqual([{ key: 'Z', frequency: 'hourly' }, { key: 'Z', frequency: 'daily' }]);
  });

  it('corpo ausente ou sem `errors` não tem candidatas', () => {
    expect(parseSeriesCandidates(undefined)).toEqual([]);
    expect(parseSeriesCandidates({})).toEqual([]);
    expect(parseSeriesCandidates(com("candidata: key='', frequency=hourly"))).toEqual([]);
  });
});
