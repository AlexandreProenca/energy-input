import type { EpObject } from '../epjson/types';

export interface EpwLocation {
  city: string;
  state: string;
  country: string;
  source: string;
  wmo: string;
  latitude: number;
  longitude: number;
  timeZone: number;
  elevation: number;
}

export interface ClimateSummary {
  /** Mean dry-bulb per month, °C. */
  monthlyMeanDryBulb: number[];
  annualMeanDryBulb: number;
  minDryBulb: number;
  maxDryBulb: number;
  /** Heating degree-days base 18 °C and cooling degree-days base 24 °C (from daily means). */
  hdd18: number;
  cdd24: number;
}

export interface DesignDayPair {
  heating: { name: string; data: EpObject };
  cooling: { name: string; data: EpObject };
}

export interface EpwData {
  location: EpwLocation;
  summary: ClimateSummary;
  hours: number;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

interface Hour {
  month: number;
  day: number;
  db: number;
  dp: number;
  p: number;
  wd: number;
  ws: number;
}

function parseHours(lines: string[]): Hour[] {
  const hours: Hour[] = [];
  for (const line of lines) {
    const c = line.split(',');
    if (c.length < 22) continue;
    const month = Number(c[1]);
    if (!(month >= 1 && month <= 12)) continue;
    hours.push({
      month,
      day: Number(c[2]),
      db: Number(c[6]),
      dp: Number(c[7]),
      p: Number(c[9]),
      wd: Number(c[20]),
      ws: Number(c[21]),
    });
  }
  return hours;
}

export function parseEpwLocation(firstLine: string): EpwLocation {
  const c = firstLine.split(',');
  if (c[0]?.trim().toUpperCase() !== 'LOCATION') throw new Error('Arquivo EPW inválido: a primeira linha deve começar com LOCATION.');
  const num = (i: number) => {
    const n = Number(c[i]);
    if (!Number.isFinite(n)) throw new Error('Arquivo EPW inválido: coordenadas não numéricas.');
    return n;
  };
  return {
    city: c[1]?.trim() ?? '',
    state: c[2]?.trim() ?? '',
    country: c[3]?.trim() ?? '',
    source: c[4]?.trim() ?? '',
    wmo: c[5]?.trim() ?? '',
    latitude: num(6),
    longitude: num(7),
    timeZone: num(8),
    elevation: num(9),
  };
}

function percentile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

function summarize(hours: Hour[]): ClimateSummary {
  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  const byDay = new Map<string, number[]>();
  for (const h of hours) {
    byMonth[h.month - 1].push(h.db);
    const k = `${h.month}-${h.day}`;
    const arr = byDay.get(k) ?? [];
    arr.push(h.db);
    byDay.set(k, arr);
  }
  let hdd = 0;
  let cdd = 0;
  for (const temps of byDay.values()) {
    const m = mean(temps);
    hdd += Math.max(0, 18 - m);
    cdd += Math.max(0, m - 24);
  }
  const dbs = hours.map((h) => h.db);
  return {
    monthlyMeanDryBulb: byMonth.map((m) => round1(mean(m))),
    annualMeanDryBulb: round1(mean(dbs)),
    minDryBulb: round1(Math.min(...dbs)),
    maxDryBulb: round1(Math.max(...dbs)),
    hdd18: Math.round(hdd),
    cdd24: Math.round(cdd),
  };
}

export function parseEpw(text: string): EpwData & { hourly: Hour[] } {
  const lines = text.split(/\r?\n/);
  const location = parseEpwLocation(lines[0] ?? '');
  const dataStart = lines.findIndex((l) => l.toUpperCase().startsWith('DATA PERIODS'));
  const hourly = parseHours(lines.slice(dataStart >= 0 ? dataStart + 1 : 8));
  if (hourly.length < 8000) throw new Error(`Arquivo EPW incompleto: ${hourly.length} horas encontradas (esperado 8760).`);
  return { location, summary: summarize(hourly), hours: hourly.length, hourly };
}

/**
 * Approximates ASHRAE annual design conditions from hourly data when no .ddy
 * file is available: heating 99.6 % and cooling 0.4 % dry-bulb, with mean
 * coincident dew point, wind and pressure. Good enough for a first sizing run;
 * a .ddy file (ASHRAE Handbook values) should be preferred when available.
 */
export function estimateDesignDays(hourly: Hour[], label: string): DesignDayPair {
  const sorted = hourly.map((h) => h.db).sort((a, b) => a - b);
  const heatDb = percentile(sorted, 0.004);
  const coolDb = percentile(sorted, 0.996);
  const near = (target: number) => hourly.filter((h) => Math.abs(h.db - target) <= 1);
  const cold = near(heatDb);
  const hot = near(coolDb);

  const monthly = summarize(hourly).monthlyMeanDryBulb;
  const coldest = monthly.indexOf(Math.min(...monthly)) + 1;
  const hottest = monthly.indexOf(Math.max(...monthly)) + 1;

  const ranges: number[] = [];
  for (let d = 1; d <= DAYS_IN_MONTH[hottest - 1]; d++) {
    const t = hourly.filter((h) => h.month === hottest && h.day === d).map((h) => h.db);
    if (t.length) ranges.push(Math.max(...t) - Math.min(...t));
  }
  const pressure = Math.round(mean(hourly.map((h) => h.p).filter((p) => p > 50000 && p < 120000)));
  const windDir = (hs: Hour[]) => {
    const x = mean(hs.map((h) => Math.sin((h.wd * Math.PI) / 180)));
    const y = mean(hs.map((h) => Math.cos((h.wd * Math.PI) / 180)));
    return Math.round(((Math.atan2(x, y) * 180) / Math.PI + 360) % 360);
  };

  const base = {
    dry_bulb_temperature_range_modifier_type: 'DefaultMultipliers',
    humidity_condition_type: 'DewPoint',
    barometric_pressure: pressure,
    rain_indicator: 'No',
    snow_indicator: 'No',
    daylight_saving_time_indicator: 'No',
    solar_model_indicator: 'ASHRAEClearSky',
  };
  return {
    heating: {
      name: `${label} Aquecimento 99.6% (estimado do EPW)`,
      data: {
        month: coldest,
        day_of_month: 21,
        day_type: 'WinterDesignDay',
        maximum_dry_bulb_temperature: round1(heatDb),
        daily_dry_bulb_temperature_range: 0,
        ...base,
        wetbulb_or_dewpoint_at_maximum_dry_bulb: round1(Math.min(heatDb, mean(cold.map((h) => h.dp)))),
        wind_speed: round1(mean(cold.map((h) => h.ws))),
        wind_direction: windDir(cold),
        sky_clearness: 0,
      },
    },
    cooling: {
      name: `${label} Resfriamento 0.4% (estimado do EPW)`,
      data: {
        month: hottest,
        day_of_month: 21,
        day_type: 'SummerDesignDay',
        maximum_dry_bulb_temperature: round1(coolDb),
        daily_dry_bulb_temperature_range: round1(mean(ranges)),
        ...base,
        wetbulb_or_dewpoint_at_maximum_dry_bulb: round1(Math.min(coolDb, mean(hot.map((h) => h.dp)))),
        wind_speed: round1(mean(hot.map((h) => h.ws))),
        wind_direction: windDir(hot),
        sky_clearness: 1,
      },
    },
  };
}

/**
 * Monthly temperatures for Site:GroundTemperature:BuildingSurface (the
 * temperature *under the slab*, not undisturbed soil). Simplified rule:
 * annual mean plus a damped monthly swing, clamped to the 15–25 °C range
 * EnergyPlus recommends for this object.
 */
export function estimateSlabGroundTemps(summary: Pick<ClimateSummary, 'monthlyMeanDryBulb' | 'annualMeanDryBulb'>): number[] {
  return summary.monthlyMeanDryBulb.map((m) =>
    round1(Math.min(25, Math.max(15, summary.annualMeanDryBulb + 0.5 * (m - summary.annualMeanDryBulb)))),
  );
}
