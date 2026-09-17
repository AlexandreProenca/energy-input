import type { RawField } from './rawTypes';

/**
 * Normalized description of one epJSON field, derived from its JSON Schema
 * fragment. The Expert-mode form renders one widget per `kind`.
 */
interface FieldBase {
  key: string;
  label: string;
  required: boolean;
  default?: string | number;
  units?: string;
  ipUnits?: string;
  note?: string;
}

export interface NumericBounds {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
}

export type FieldSpec =
  | (FieldBase & NumericBounds & { kind: 'number' | 'integer' })
  | (FieldBase & { kind: 'text'; retainCase: boolean })
  | (FieldBase & { kind: 'enum'; options: string[] })
  | (FieldBase & { kind: 'yesno' })
  | (FieldBase & NumericBounds & { kind: 'autoNumber'; autoValue: 'Autosize' | 'Autocalculate'; integer: boolean })
  | (FieldBase & { kind: 'numberOrText' })
  | (FieldBase & { kind: 'numericEnum'; options: number[] })
  | (FieldBase & { kind: 'reference'; lists: string[] })
  | (FieldBase & { kind: 'classReference'; lists: string[] })
  | (FieldBase & { kind: 'externalList'; lists: string[] })
  | (FieldBase & { kind: 'array'; itemFields: FieldSpec[]; format?: string });

export type FieldKind = FieldSpec['kind'];

export function humanizeKey(key: string): string {
  const s = key.replace(/_+$/, '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function bounds(f: RawField): NumericBounds {
  const b: NumericBounds = {};
  if (f.minimum !== undefined) b.minimum = f.minimum;
  if (f.maximum !== undefined) b.maximum = f.maximum;
  if (f.exclusiveMinimum !== undefined) b.exclusiveMinimum = f.exclusiveMinimum;
  if (f.exclusiveMaximum !== undefined) b.exclusiveMaximum = f.exclusiveMaximum;
  return b;
}

/**
 * Maps a JSON Schema fragment to a FieldSpec.
 * @param classLists reference lists that name object *types* (reference-class-name)
 */
export function toFieldSpec(
  key: string,
  f: RawField,
  opts: { required: boolean; label?: string; classLists: Set<string>; format?: string },
): FieldSpec {
  const base: FieldBase = {
    key,
    label: opts.label ?? humanizeKey(key),
    required: opts.required,
    default: f.default,
    units: f.units,
    ipUnits: f['ip-units'],
    note: f.note,
  };

  if (f.type === 'array' && f.items) {
    const req = new Set(f.items.required ?? []);
    const itemFields = Object.entries(f.items.properties).map(([k, sub]) =>
      toFieldSpec(k, sub, { required: req.has(k), classLists: opts.classLists }),
    );
    return { ...base, kind: 'array', itemFields, format: opts.format };
  }

  if (f.anyOf) {
    const numeric = f.anyOf.find((a) => a.type === 'number' || a.type === 'integer');
    const strEnum = f.anyOf.find((a) => a.type === 'string' && a.enum)?.enum as string[] | undefined;
    const auto = strEnum?.find((e) => e === 'Autosize' || e === 'Autocalculate') as
      | 'Autosize'
      | 'Autocalculate'
      | undefined;
    if (numeric && auto) {
      return { ...base, ...bounds(numeric), kind: 'autoNumber', autoValue: auto, integer: numeric.type === 'integer' };
    }
    const numEnum = f.anyOf.find((a) => a.enum && a.enum.every((e) => typeof e === 'number'));
    if (numEnum) return { ...base, kind: 'numericEnum', options: numEnum.enum as number[] };
    return { ...base, kind: 'numberOrText' };
  }

  if (f.data_type === 'object_list' && f.object_list) {
    const isClass = f.object_list.some((l) => opts.classLists.has(l));
    return { ...base, kind: isClass ? 'classReference' : 'reference', lists: f.object_list };
  }
  if (f.data_type === 'external_list' && f.external_list) {
    return { ...base, kind: 'externalList', lists: f.external_list };
  }

  if (f.enum) {
    const options = (f.enum as string[]).filter((e) => e !== '');
    if (options.length === 2 && options.includes('Yes') && options.includes('No')) {
      return { ...base, kind: 'yesno' };
    }
    return { ...base, kind: 'enum', options };
  }

  if (f.type === 'number' || f.type === 'integer') return { ...base, ...bounds(f), kind: f.type };
  return { ...base, kind: 'text', retainCase: !!f.retaincase };
}

/** Human-readable range hint, e.g. "> 0 e ≤ 0,5". */
export function describeBounds(b: NumericBounds): string | undefined {
  const parts: string[] = [];
  const fmt = (n: number) => n.toLocaleString('pt-BR');
  if (b.exclusiveMinimum !== undefined) parts.push(`> ${fmt(b.exclusiveMinimum)}`);
  else if (b.minimum !== undefined) parts.push(`≥ ${fmt(b.minimum)}`);
  if (b.exclusiveMaximum !== undefined) parts.push(`< ${fmt(b.exclusiveMaximum)}`);
  else if (b.maximum !== undefined) parts.push(`≤ ${fmt(b.maximum)}`);
  return parts.length ? parts.join(' e ') : undefined;
}

/** Returns a pt-BR error message if `value` violates the numeric bounds. */
export function checkBounds(value: number, b: NumericBounds): string | undefined {
  if (b.minimum !== undefined && value < b.minimum) return `Deve ser ≥ ${b.minimum}`;
  if (b.exclusiveMinimum !== undefined && value <= b.exclusiveMinimum) return `Deve ser > ${b.exclusiveMinimum}`;
  if (b.maximum !== undefined && value > b.maximum) return `Deve ser ≤ ${b.maximum}`;
  if (b.exclusiveMaximum !== undefined && value >= b.exclusiveMaximum) return `Deve ser < ${b.exclusiveMaximum}`;
  return undefined;
}
