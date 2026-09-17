import type { SchemaIndex } from '../schema/schemaIndex';
import type { EpObject } from '../epjson/types';

export interface IdfObject {
  type: string;
  values: string[];
}

/**
 * Minimal IDF text reader, used only for importing `.ddy` design-day files
 * (they are IDF snippets). Not a general IDF importer — epJSON is the only
 * supported model format.
 */
export function parseIdfObjects(text: string): IdfObject[] {
  const noComments = text
    .split(/\r?\n/)
    .map((line) => {
      const i = line.indexOf('!');
      return i >= 0 ? line.slice(0, i) : line;
    })
    .join('\n');
  return noComments
    .split(';')
    .map((chunk) => chunk.split(',').map((v) => v.trim()))
    .filter((parts) => parts.length > 0 && parts[0] !== '')
    .map(([type, ...values]) => ({ type, values }));
}

/**
 * Converts positional IDF values to an epJSON object using the schema's field
 * order. Numbers are parsed and enum values are matched case-insensitively to
 * the schema's canonical spelling (DDY files use e.g. "Wetbulb" vs "WetBulb").
 */
export function idfToEpJson(index: SchemaIndex, obj: IdfObject): { type: string; name: string; data: EpObject } | undefined {
  const type = index.typeNames.find((t) => t.toUpperCase() === obj.type.toUpperCase());
  if (!type) return undefined;
  const info = index.info(type)!;
  const values = [...obj.values];
  const name = info.hasName ? values.shift() ?? '' : `${type} 1`;
  const data: EpObject = {};
  info.fields.forEach((spec, i) => {
    const raw = values[i];
    if (raw === undefined || raw === '') return;
    switch (spec.kind) {
      case 'number':
      case 'integer': {
        const n = Number(raw);
        if (Number.isFinite(n)) data[spec.key] = n;
        break;
      }
      case 'autoNumber': {
        const n = Number(raw);
        data[spec.key] = Number.isFinite(n) ? n : spec.autoValue;
        break;
      }
      case 'enum': {
        data[spec.key] = spec.options.find((o) => o.toUpperCase() === raw.toUpperCase()) ?? raw;
        break;
      }
      case 'yesno':
        data[spec.key] = raw.toUpperCase().startsWith('Y') ? 'Yes' : 'No';
        break;
      case 'array':
        break; // design days have no extensible fields
      default:
        data[spec.key] = raw;
    }
  });
  return { type, name, data };
}
