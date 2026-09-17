import type { EpJsonDocument, EpJsonFragment, EpObject } from './types';
import type { SchemaIndex } from '../schema/schemaIndex';

/*
 * Immutable operations on epJSON documents. Every function returns a new
 * document and shares untouched object types/instances with the input, which
 * keeps undo/redo cheap.
 */

export function countObjects(doc: EpJsonDocument): number {
  return Object.values(doc).reduce((n, inst) => n + Object.keys(inst).length, 0);
}

export function getObject(doc: EpJsonDocument, type: string, name: string): EpObject | undefined {
  return doc[type]?.[name];
}

export function setObject(doc: EpJsonDocument, type: string, name: string, data: EpObject): EpJsonDocument {
  return { ...doc, [type]: { ...(doc[type] ?? {}), [name]: data } };
}

export function deleteObject(doc: EpJsonDocument, type: string, name: string): EpJsonDocument {
  const inst = doc[type];
  if (!inst || !(name in inst)) return doc;
  const { [name]: _removed, ...rest } = inst;
  const next = { ...doc };
  if (Object.keys(rest).length === 0) delete next[type];
  else next[type] = rest;
  return next;
}

/** Sets or clears (value === undefined) a single field. */
export function setField(doc: EpJsonDocument, type: string, name: string, field: string, value: unknown): EpJsonDocument {
  const current = doc[type]?.[name] ?? {};
  const next: EpObject = { ...current };
  if (value === undefined) delete next[field];
  else next[field] = value;
  return setObject(doc, type, name, next);
}

export function nameExists(doc: EpJsonDocument, type: string, name: string, ignore?: string): boolean {
  const up = name.toUpperCase();
  return Object.keys(doc[type] ?? {}).some((n) => n.toUpperCase() === up && n !== ignore);
}

/** "Base", "Base 2", "Base 3"… — first name not used within the type. */
export function uniqueName(doc: EpJsonDocument, type: string, base: string): string {
  if (!nameExists(doc, type, base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!nameExists(doc, type, candidate)) return candidate;
  }
}

export function cloneObject(doc: EpJsonDocument, type: string, name: string): { doc: EpJsonDocument; name: string } {
  const src = doc[type]?.[name];
  if (!src) return { doc, name };
  const newName = uniqueName(doc, type, `${name} (cópia)`);
  return { doc: setObject(doc, type, newName, structuredClone(src)), name: newName };
}

/** Where a name of `type` is referenced from. */
export interface ReferenceSite {
  type: string;
  name: string;
  field: string;
  itemIndex?: number;
  itemField?: string;
}

export function findReferences(doc: EpJsonDocument, index: SchemaIndex, type: string, name: string): ReferenceSite[] {
  const info = index.info(type);
  if (!info) return [];
  const lists = new Set(info.nameReferences);
  if (lists.size === 0) return [];
  const up = name.toUpperCase();
  const sites: ReferenceSite[] = [];
  const matches = (lists2: string[], v: unknown) =>
    lists2.some((l) => lists.has(l)) && typeof v === 'string' && v.toUpperCase() === up;

  for (const [t, instances] of Object.entries(doc)) {
    const ti = index.info(t);
    if (!ti) continue;
    for (const spec of ti.fields) {
      if (spec.kind === 'reference') {
        for (const [n, data] of Object.entries(instances)) {
          if (matches(spec.lists, data[spec.key])) sites.push({ type: t, name: n, field: spec.key });
        }
      } else if (spec.kind === 'array') {
        const subs = spec.itemFields.filter((s) => s.kind === 'reference');
        if (!subs.length) continue;
        for (const [n, data] of Object.entries(instances)) {
          const rows = data[spec.key];
          if (!Array.isArray(rows)) continue;
          rows.forEach((row, i) => {
            for (const s of subs) {
              if (s.kind === 'reference' && matches(s.lists, (row as EpObject)?.[s.key])) {
                sites.push({ type: t, name: n, field: spec.key, itemIndex: i, itemField: s.key });
              }
            }
          });
        }
      }
    }
  }
  return sites;
}

/**
 * Renames an object, keeping its position in the instance map. When
 * `propagate` is true, every reference field pointing at the old name is
 * updated too.
 */
export function renameObject(
  doc: EpJsonDocument,
  index: SchemaIndex,
  type: string,
  oldName: string,
  newName: string,
  propagate: boolean,
): EpJsonDocument {
  const inst = doc[type];
  if (!inst || !(oldName in inst) || oldName === newName) return doc;
  const sites = propagate ? findReferences(doc, index, type, oldName) : [];
  const renamed: Record<string, EpObject> = {};
  for (const [n, data] of Object.entries(inst)) renamed[n === oldName ? newName : n] = data;
  let next: EpJsonDocument = { ...doc, [type]: renamed };

  for (const s of sites) {
    // The referencing object may be the renamed object itself.
    const refName = s.type === type && s.name === oldName ? newName : s.name;
    const obj = next[s.type][refName];
    if (s.itemIndex === undefined) {
      next = setObject(next, s.type, refName, { ...obj, [s.field]: newName });
    } else {
      const rows = [...(obj[s.field] as EpObject[])];
      rows[s.itemIndex] = { ...rows[s.itemIndex], [s.itemField!]: newName };
      next = setObject(next, s.type, refName, { ...obj, [s.field]: rows });
    }
  }
  return next;
}

/** Shallow-merges a fragment: fragment objects replace same-named ones. */
export function mergeFragment(doc: EpJsonDocument, fragment: EpJsonFragment): EpJsonDocument {
  const next = { ...doc };
  for (const [type, instances] of Object.entries(fragment)) {
    next[type] = { ...(next[type] ?? {}), ...instances };
  }
  return next;
}

export function mergeFragments(...fragments: EpJsonFragment[]): EpJsonDocument {
  return fragments.reduce<EpJsonDocument>((d, f) => mergeFragment(d, f), {});
}

/**
 * Returns a copy with object types in schema order and each object's fields in
 * IDD order, so exported files are stable and diff-friendly.
 */
export function orderDocument(doc: EpJsonDocument, index: SchemaIndex): EpJsonDocument {
  const typeOrder = new Map(index.typeNames.map((t, i) => [t, i]));
  const types = Object.keys(doc).sort((a, b) => (typeOrder.get(a) ?? 1e9) - (typeOrder.get(b) ?? 1e9));
  const out: EpJsonDocument = {};
  for (const type of types) {
    const info = index.info(type);
    const order = info?.fields.map((f) => f.key) ?? [];
    out[type] = {};
    for (const [name, data] of Object.entries(doc[type])) {
      const keys = Object.keys(data).sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
      });
      out[type][name] = Object.fromEntries(keys.map((k) => [k, data[k]]));
    }
  }
  return out;
}

export function serializeDocument(doc: EpJsonDocument, index?: SchemaIndex): string {
  return JSON.stringify(index ? orderDocument(doc, index) : doc, null, 2) + '\n';
}

/** Placeholder key used for types without a name field, e.g. "Timestep 1". */
export function placeholderName(type: string): string {
  return `${type} 1`;
}

export interface DocumentDiff {
  added: { type: string; name: string }[];
  removed: { type: string; name: string }[];
  changed: { type: string; name: string }[];
  unchanged: number;
}

export function diffDocuments(before: EpJsonDocument, after: EpJsonDocument): DocumentDiff {
  const diff: DocumentDiff = { added: [], removed: [], changed: [], unchanged: 0 };
  const types = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const type of types) {
    const a = before[type] ?? {};
    const b = after[type] ?? {};
    for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(name in a)) diff.added.push({ type, name });
      else if (!(name in b)) diff.removed.push({ type, name });
      else if (stableStringify(a[name]) !== stableStringify(b[name])) diff.changed.push({ type, name });
      else diff.unchanged++;
    }
  }
  return diff;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
