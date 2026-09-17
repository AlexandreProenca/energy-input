import type { BioclimaticZone } from '@/templates/climates/types';

/**
 * Reference limits from the NBR 15575 simplified procedure (parts 4 and 5).
 * Informational only — shown as a hint in the wizard, not a compliance check.
 */
export interface Nbr15575Check {
  ok: boolean;
  limit: string;
}

export function checkWall(zb: BioclimaticZone, u: number, ct: number, alpha: number): Nbr15575Check {
  const uMax = zb <= 2 ? 2.5 : alpha <= 0.6 ? 3.7 : 2.5;
  const ctOk = zb === 8 || ct >= 130;
  return {
    ok: u <= uMax && ctOk,
    limit: `U ≤ ${uMax.toLocaleString('pt-BR')} W/m²K${zb === 8 ? '' : ' e CT ≥ 130 kJ/m²K'}`,
  };
}

export function checkRoof(zb: BioclimaticZone, u: number, alpha: number): Nbr15575Check {
  let uMax: number;
  if (zb <= 2) uMax = 2.3;
  else if (zb <= 6) uMax = alpha <= 0.6 ? 2.3 : 1.5;
  else uMax = alpha <= 0.4 ? 2.3 : 1.5;
  return { ok: u <= uMax, limit: `U ≤ ${uMax.toLocaleString('pt-BR')} W/m²K` };
}
