import type { EpJsonFragment } from '@/core/epjson/types';
import type { WizardAnswers } from './answers';

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function clampDay(month: number, day: number): number {
  return Math.min(Math.max(1, Math.round(day)), DAYS_IN_MONTH[month - 1] ?? 31);
}

/** Step 3 — RunPeriod (full year or a date range). */
export function generateRunPeriod(rp: WizardAnswers['runPeriod']): EpJsonFragment {
  const year = rp.mode !== 'range';
  const [bm, bd, em, ed] = year ? [1, 1, 12, 31] : [rp.beginMonth, clampDay(rp.beginMonth, rp.beginDay), rp.endMonth, clampDay(rp.endMonth, rp.endDay)];
  return {
    RunPeriod: {
      [year ? 'Ano completo' : 'Período personalizado']: {
        begin_month: bm,
        begin_day_of_month: bd,
        end_month: em,
        end_day_of_month: ed,
        use_weather_file_holidays_and_special_days: 'Yes',
        use_weather_file_daylight_saving_period: 'No',
        apply_weekend_holiday_rule: 'No',
        use_weather_file_rain_indicators: 'Yes',
        use_weather_file_snow_indicators: 'Yes',
      },
    },
  };
}
