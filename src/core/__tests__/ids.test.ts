import { describe, expect, it } from 'vitest';
import {
  MODEL_ID,
  MODEL_VERSION_ID,
  SIMULATION_ID,
  STUDY_ID,
  WEATHER_ID,
  isSimulationId,
  isStudyId,
} from '../ids';

/**
 * Os padrões daqui são cópia do contrato, e cópia diverge calada. Estes testes existem para
 * que a divergência apareça: o lado esquerdo é o que o módulo produz, o direito é o literal
 * transcrito de `https://homolog.ee.dev.br/v1/openapi.json` (consultado em 2026-09-22).
 */
describe('padrões de identificador contra o contrato', () => {
  it.each([
    ['SIMULATION_ID', SIMULATION_ID, '^sim_[0-7][0-9A-HJKMNP-TV-Z]{25}$'],
    ['STUDY_ID', STUDY_ID, '^std_[0-7][0-9A-HJKMNP-TV-Z]{25}$'],
    ['MODEL_ID', MODEL_ID, '^mdl_[0-7][0-9A-HJKMNP-TV-Z]{25}$'],
    ['MODEL_VERSION_ID', MODEL_VERSION_ID, '^mv_[0-7][0-9A-HJKMNP-TV-Z]{25}$'],
    ['WEATHER_ID', WEATHER_ID, '^wx_[a-z0-9][a-z0-9_-]{0,56}$'],
  ])('%s reproduz o padrão do contrato caractere a caractere', (_nome, regex, contrato) => {
    expect(regex.source).toBe(contrato);
  });

  it('aceita os identificadores de exemplo do próprio contrato', () => {
    expect(SIMULATION_ID.test('sim_01M2KXB9D4TQ7F3S0YJ8N5VZQK')).toBe(true);
    expect(STUDY_ID.test('std_01M2KXBC7E9GH4J6K8M0N2P4Q6')).toBe(true);
    expect(MODEL_VERSION_ID.test('mv_01M2KXB16RP92SR9SCA3PBVMSF')).toBe(true);
    // Clima não é ULID: o identificador é descritivo e minúsculo.
    expect(WEATHER_ID.test('wx_bra_sc_florianopolis_838970_inmet')).toBe(true);
    expect(WEATHER_ID.test('wx_bra_florianopolis_tenant_inmet_987621ec')).toBe(true);
  });

  it('não confunde um prefixo com outro', () => {
    // A troca silenciosa de prefixo mandaria a consulta para o recurso errado.
    expect(isSimulationId('std_01M2KXBC7E9GH4J6K8M0N2P4Q6')).toBe(false);
    expect(isStudyId('sim_01M2KXB9D4TQ7F3S0YJ8N5VZQK')).toBe(false);
    expect(MODEL_ID.test('mv_01M2KXB16RP92SR9SCA3PBVMSF')).toBe(false);
    // `mv_` é prefixo de nada, mas `mdl_` e `mv_` compartilham o `m`: âncora importa.
    expect(MODEL_VERSION_ID.test('mdl_01M2KXAZ9WQK8YT4N6P0R2S5V7')).toBe(false);
  });

  it('recusa corpo ULID malformado', () => {
    expect(isSimulationId('sim_91M2KXB9D4TQ7F3S0YJ8N5VZQK')).toBe(false); // não começa em 0-7
    expect(isSimulationId('sim_01M2KXB9D4TQ7F3S0YJ8N5VZQ')).toBe(false); // 25 caracteres
    expect(isSimulationId('sim_01M2KXB9D4TQ7F3S0YJ8N5VZQKK')).toBe(false); // 27
    expect(isSimulationId('sim_01m2kxb9d4tq7f3s0yj8n5vzqk')).toBe(false); // minúsculas
    // I, L, O e U ficam fora do alfabeto Crockford para não confundir com 1 e 0.
    for (const letra of ['I', 'L', 'O', 'U']) {
      expect(isSimulationId(`sim_01M2KXB9D4TQ7F3S0YJ8N5VZQ${letra}`)).toBe(false);
    }
  });

  it('recusa entrada vazia e sem prefixo', () => {
    expect(isSimulationId('')).toBe(false);
    expect(isStudyId('')).toBe(false);
    expect(isSimulationId('01M2KXB9D4TQ7F3S0YJ8N5VZQK')).toBe(false);
  });
});
