import { describe, expect, it } from 'vitest';
import { lerResposta } from '../resposta';
import { SYSTEM_PROMPT } from '../prompts';

describe('leitura da resposta da API do modelo (T029)', () => {
  it('extrai o texto da primeira escolha', () => {
    expect(lerResposta({ choices: [{ message: { content: '{"summary":"ok"}' }, finish_reason: 'stop' }] }))
      .toEqual({ bruto: '{"summary":"ok"}', cortada: false });
  });

  it('marca a resposta cortada pelo limite de tokens', () => {
    // Foi o que reprovou o PR #24: o JSON parou no meio, e o erro dizia só "formato inválido".
    expect(lerResposta({ choices: [{ message: { content: '{"findings":[{"title":"x"' }, finish_reason: 'length' }] }))
      .toEqual({ bruto: '{"findings":[{"title":"x"', cortada: true });
  });

  it('tolera corpo sem escolha, sem mensagem ou com conteúdo que não é texto', () => {
    expect(lerResposta({})).toEqual({ bruto: '', cortada: false });
    expect(lerResposta(null)).toEqual({ bruto: '', cortada: false });
    expect(lerResposta({ choices: [{ message: { content: 42 } }] })).toEqual({ bruto: '', cortada: false });
  });
});

describe('o prompt protege o próprio formato', () => {
  it('pede no máximo cinco achados e campos curtos', () => {
    expect(SYSTEM_PROMPT).toMatch(/NO MÁXIMO 5 achados/);
    expect(SYSTEM_PROMPT).toMatch(/400 caracteres/);
  });
});
