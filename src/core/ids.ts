/**
 * Identificadores da API de simulação.
 *
 * Contrato: https://homolog.ee.dev.br/v1/openapi.json (2026-09-22). Cada recurso usa um
 * prefixo próprio seguido de um ULID em Crockford base32 — 26 caracteres, o primeiro
 * limitado a `0-7` (o teto do timestamp de 48 bits), e o alfabeto sem `I`, `L`, `O` e `U`
 * para não confundir com `1` e `0`.
 *
 * Este módulo existe porque o mesmo padrão estava escrito três vezes — duas em
 * `simulationStore.ts` e uma no allowlist do proxy — e um estudo (`std_`) precisaria de
 * uma quarta. Padrão repetido é padrão que diverge.
 */

/** Corpo do ULID, sem o prefixo do recurso. */
export const ULID = '[0-7][0-9A-HJKMNP-TV-Z]{25}';

const exact = (prefixo: string) => new RegExp(`^${prefixo}_${ULID}$`);

export const SIMULATION_ID = exact('sim');
export const STUDY_ID = exact('std');
export const MODEL_ID = exact('mdl');
export const MODEL_VERSION_ID = exact('mv');

export const isSimulationId = (value: string): boolean => SIMULATION_ID.test(value);
export const isStudyId = (value: string): boolean => STUDY_ID.test(value);

/**
 * Clima não é ULID: o identificador é descritivo e minúsculo
 * (`wx_bra_sc_florianopolis_838970_inmet`).
 */
export const WEATHER_ID = /^wx_[a-z0-9][a-z0-9_-]{0,56}$/;
