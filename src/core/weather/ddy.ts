import type { SchemaIndex } from '../schema/schemaIndex';
import type { DesignDayPair } from './epw';
import { idfToEpJson, parseIdfObjects } from './idf';

/**
 * Picks the annual heating 99.6 % and cooling 0.4 % dry-bulb design days from a
 * `.ddy` file (falling back to 99 % / 1 % when the stricter ones are absent).
 */
export function parseDdy(index: SchemaIndex, text: string): DesignDayPair {
  const dds = parseIdfObjects(text)
    .filter((o) => o.type.toUpperCase() === 'SIZINGPERIOD:DESIGNDAY')
    .map((o) => idfToEpJson(index, o)!)
    .filter(Boolean);
  const find = (patterns: RegExp[]) => {
    for (const p of patterns) {
      const hit = dds.find((d) => p.test(d.name));
      if (hit) return hit;
    }
    return undefined;
  };
  const heating = find([/Htg 99\.6% Condns DB$/i, /Htg 99% Condns DB$/i, /Heating 99\.6%/i]);
  const cooling = find([/Clg \.4% Condns DB=>MWB/i, /Clg 1% Condns DB=>MWB/i, /Cooling 0?\.4%/i]);
  if (!heating || !cooling) {
    throw new Error('O arquivo DDY não contém os dias de projeto anuais de aquecimento (99,6%) e resfriamento (0,4%).');
  }
  return { heating, cooling };
}
