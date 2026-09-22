/**
 * Conversão de unidades dos resultados.
 *
 * O motor mistura unidades na mesma lista: `Summary.end_uses` devolve energia em `GJ` e
 * **água em `m3`**, lado a lado, sempre com os 14 recursos mesmo quando zerados. As séries
 * vêm em `J`. Converter tudo para kWh sem olhar a unidade mente na linha de água — por isso
 * `toKwh` **recusa** o que não reconhece em vez de arriscar um fator.
 *
 * `src/core/` é puro: nada aqui importa React, Zustand, Three.js ou DOM.
 */

/** Joule por quilowatt-hora. */
const J_POR_KWH = 3_600_000;

/**
 * Joules por unidade, por grafia **normalizada**. Só energia entra aqui: `m3`, `C`, `W` e
 * afins não têm conversão para kWh e precisam ser recusados, não aproximados.
 *
 * A tabela guarda joules, e não o fator direto para kWh, por precisão: `3,6e6 × (1/3,6e6)`
 * dá `0,9999999999999999`, enquanto `3,6e6 × 1 / 3,6e6` dá exatamente 1. Uma divisão só, no
 * fim, em vez de multiplicar por um recíproco já arredondado.
 */
const PARA_J: Record<string, number> = {
  j: 1,
  kj: 1_000,
  mj: 1_000_000,
  gj: 1_000_000_000,
  wh: 3_600,
  kwh: J_POR_KWH,
  mwh: J_POR_KWH * 1_000,
};

/**
 * Normaliza a grafia da unidade. O EnergyPlus escreve `J` em alguns lugares e `[J]` em
 * outros, com espaços à volta e caixa inconsistente — comparar a string crua erra conforme
 * o arquivo de onde ela veio.
 */
export function normalizeUnit(units: string | null | undefined): string {
  return (units ?? '').trim().replace(/^\[|\]$/g, '').trim().toLowerCase();
}

/**
 * Converte para kWh, ou devolve `null` quando a unidade não é de energia ou é desconhecida.
 *
 * O `null` é deliberado e precisa ser tratado por quem chama: silenciosamente devolver o
 * valor original faria um gráfico somar metros cúbicos com quilowatt-hora.
 */
export function toKwh(value: number | null | undefined, units: string | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const joules = PARA_J[normalizeUnit(units)];
  return joules === undefined ? null : (value * joules) / J_POR_KWH;
}

/** `true` quando a unidade é de energia e, portanto, convertível para kWh. */
export const isEnergyUnit = (units: string | null | undefined): boolean =>
  PARA_J[normalizeUnit(units)] !== undefined;

/** Grafia pt-BR para exibição. Unidade desconhecida volta como veio, sem inventar. */
const ROTULOS: Record<string, string> = {
  j: 'J', kj: 'kJ', mj: 'MJ', gj: 'GJ', wh: 'Wh', kwh: 'kWh', mwh: 'MWh',
  w: 'W', kw: 'kW', c: '°C', k: 'K', m2: 'm²', m3: 'm³', hours: 'h', '': '—',
};
export const formatUnit = (units: string | null | undefined): string =>
  ROTULOS[normalizeUnit(units)] ?? (units ?? '').trim();
