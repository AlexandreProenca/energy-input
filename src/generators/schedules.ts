import type { EpJsonFragment, EpObject } from '@/core/epjson/types';
import type { ScheduleRule } from '@/templates/buildingUses/types';

export const LIMITS = {
  fraction: 'Fração',
  temperature: 'Temperatura',
  activity: 'Nível de atividade',
  control: 'Tipo de controle',
} as const;

export const SCHEDULES = {
  alwaysOn: 'Sempre ligado',
  occupancy: 'Ocupação',
  lighting: 'Iluminação',
  equipment: 'Equipamentos',
  activity: 'Atividade das pessoas',
  heating: 'Setpoint de aquecimento',
  cooling: 'Setpoint de resfriamento',
  controlType: 'Tipo de controle do termostato',
} as const;

export function scheduleTypeLimits(): EpJsonFragment {
  return {
    ScheduleTypeLimits: {
      [LIMITS.fraction]: { lower_limit_value: 0, upper_limit_value: 1, numeric_type: 'Continuous', unit_type: 'Dimensionless' },
      [LIMITS.temperature]: { lower_limit_value: -60, upper_limit_value: 200, numeric_type: 'Continuous', unit_type: 'Temperature' },
      [LIMITS.activity]: { lower_limit_value: 0, numeric_type: 'Continuous', unit_type: 'ActivityLevel' },
      [LIMITS.control]: { lower_limit_value: 0, upper_limit_value: 4, numeric_type: 'Discrete', unit_type: 'Control' },
    },
  };
}

/** Converts readable rules into Schedule:Compact `data` rows. */
export function compactData(rules: ScheduleRule[]): { field: string | number }[] {
  const rows: { field: string | number }[] = [{ field: 'Through: 12/31' }];
  for (const rule of rules) {
    rows.push({ field: `For: ${rule.days}` });
    for (const [until, value] of rule.steps) {
      rows.push({ field: `Until: ${until}` }, { field: value });
    }
  }
  return rows;
}

export function compactSchedule(limits: string, rules: ScheduleRule[]): EpObject {
  return { schedule_type_limits_name: limits, data: compactData(rules) };
}

export function constantRules(value: number): ScheduleRule[] {
  return [{ days: 'AllDays', steps: [['24:00', value]] }];
}

/** Maps each step of `rules` through fn, merging consecutive equal values. */
export function mapRules(rules: ScheduleRule[], fn: (v: number) => number): ScheduleRule[] {
  return rules.map((r) => {
    const steps: ScheduleRule['steps'] = [];
    for (const [until, v] of r.steps) {
      const mapped = fn(v);
      if (steps.length && steps[steps.length - 1][1] === mapped) steps[steps.length - 1] = [until, mapped];
      else steps.push([until, mapped]);
    }
    return { days: r.days, steps };
  });
}

/** Expands rules to a 7×24 grid (Mon..Sun) for previews. Design days/holidays ignored. */
export function weeklyProfile(rules: ScheduleRule[]): number[][] {
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return dayNames.map((day) => {
    const rule =
      rules.find((r) => {
        const tokens = r.days.split(/\s+/);
        return tokens.includes(day) || tokens.includes('AllDays') || (tokens.includes('Weekdays') && !['Saturday', 'Sunday'].includes(day)) || (tokens.includes('Weekends') && ['Saturday', 'Sunday'].includes(day));
      }) ?? rules.find((r) => r.days.includes('AllOtherDays'));
    const hours = new Array(24).fill(0);
    if (!rule) return hours;
    let h = 0;
    for (const [until, v] of rule.steps) {
      const end = Number(until.split(':')[0]);
      for (; h < end && h < 24; h++) hours[h] = v;
    }
    return hours;
  });
}
