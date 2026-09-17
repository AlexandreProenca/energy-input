import type { EpJsonFragment } from '@/core/epjson/types';
import type { ClimateLocation } from '@/templates/climates/types';
import { byId, type TemplateLibrary } from '@/templates';
import type { CustomLocation, WizardAnswers } from './answers';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export type ResolvedLocation = (ClimateLocation & { kind: 'city' }) | (CustomLocation & { kind: 'custom' });

export function resolveLocation(loc: WizardAnswers['location'], lib: TemplateLibrary): ResolvedLocation {
  if (loc.source === 'custom' && loc.custom) return { ...loc.custom, kind: 'custom' };
  return { ...byId(lib.cities, loc.cityId), kind: 'city' };
}

export function locationDisplayName(l: ResolvedLocation): string {
  return l.kind === 'city' ? `${l.name} - ${l.state}` : l.name;
}

/** Step 2 — Site:Location, heating/cooling design days, ground temperatures. */
export function generateLocation(l: ResolvedLocation): EpJsonFragment {
  return {
    'Site:Location': {
      [locationDisplayName(l)]: {
        latitude: l.latitude,
        longitude: l.longitude,
        time_zone: l.timeZone,
        elevation: l.elevation,
      },
    },
    'SizingPeriod:DesignDay': {
      [l.designDays.heating.name]: l.designDays.heating.data,
      [l.designDays.cooling.name]: l.designDays.cooling.data,
    },
    'Site:GroundTemperature:BuildingSurface': {
      'Site:GroundTemperature:BuildingSurface 1': Object.fromEntries(
        MONTHS.map((m, i) => [`${m}_ground_temperature`, l.groundTemperatures[i] ?? 18]),
      ),
    },
  };
}
