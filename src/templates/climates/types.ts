import type { EpObject } from '@/core/epjson/types';
import type { ClimateSummary } from '@/core/weather/epw';

/** NBR 15220-3 bioclimatic zone. */
export type BioclimaticZone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ClimateLocation {
  id: string;
  name: string;
  state: string;
  /** Zona bioclimática NBR 15220-3 (pode ser ajustada pelo usuário). */
  zb: BioclimaticZone;
  station: string;
  latitude: number;
  longitude: number;
  timeZone: number;
  elevation: number;
  epwFileName: string;
  /** ZIP with EPW/DDY/STAT at climate.onebuilding.org. */
  downloadUrl: string;
  summary: ClimateSummary;
  designDays: {
    heating: { name: string; data: EpObject };
    cooling: { name: string; data: EpObject };
  };
  /** "ASHRAE (DDY)" or "estimado do EPW". */
  designDaySource: string;
  /** Site:GroundTemperature:BuildingSurface, Jan–Dez. */
  groundTemperatures: number[];
}
