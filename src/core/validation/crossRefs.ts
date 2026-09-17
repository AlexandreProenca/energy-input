import type { EpJsonDocument } from '../epjson/types';
import type { SchemaIndex } from '../schema/schemaIndex';
import type { FieldSpec } from '../schema/fieldSpec';
import type { ValidationIssue } from './issues';

/**
 * Collects every name available for the given reference lists in `doc`.
 * EnergyPlus compares names case-insensitively, so keys are upper-cased.
 * Returns undefined when no object type in the schema provides these lists
 * (e.g. node names), meaning the reference cannot be checked.
 */
export function namesForLists(
  doc: EpJsonDocument,
  index: SchemaIndex,
  lists: string[],
): Map<string, { name: string; type: string }> | undefined {
  const providers = lists.flatMap((l) => index.providersOf(l));
  if (providers.length === 0) return undefined;
  const out = new Map<string, { name: string; type: string }>();
  for (const p of providers) {
    const instances = doc[p.type];
    if (!instances) continue;
    for (const [name, data] of Object.entries(instances)) {
      const value = p.field ? data[p.field] : name;
      if (typeof value === 'string' && value.trim()) out.set(value.toUpperCase(), { name: value, type: p.type });
    }
  }
  return out;
}

/** Best-effort check that reference fields point at existing objects. */
export function checkCrossReferences(doc: EpJsonDocument, index: SchemaIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cache = new Map<string, ReturnType<typeof namesForLists>>();
  const lookup = (lists: string[]) => {
    const key = lists.join(',');
    if (!cache.has(key)) cache.set(key, namesForLists(doc, index, lists));
    return cache.get(key);
  };

  const check = (
    spec: FieldSpec,
    value: unknown,
    base: Omit<ValidationIssue, 'message' | 'severity' | 'source'>,
  ) => {
    if (typeof value !== 'string' || value.trim() === '') return;
    if (spec.kind === 'reference') {
      const names = lookup(spec.lists);
      if (names && !names.has(value.toUpperCase())) {
        issues.push({ ...base, severity: 'warning', source: 'reference', message: `"${value}" não corresponde a nenhum objeto existente (${spec.lists.join(', ')})` });
      }
    } else if (spec.kind === 'classReference') {
      const types = spec.lists.flatMap((l) => index.classMembersOf(l)).map((t) => t.toUpperCase());
      if (types.length && !types.includes(value.toUpperCase())) {
        issues.push({ ...base, severity: 'warning', source: 'reference', message: `"${value}" não é um tipo de objeto válido para este campo` });
      }
    }
  };

  for (const [type, instances] of Object.entries(doc)) {
    const info = index.info(type);
    if (!info) continue;
    const refFields = info.fields.filter(
      (f) => f.kind === 'reference' || f.kind === 'classReference' || (f.kind === 'array' && f.itemFields.some((i) => i.kind === 'reference' || i.kind === 'classReference')),
    );
    if (refFields.length === 0) continue;
    for (const [name, data] of Object.entries(instances)) {
      for (const spec of refFields) {
        const value = data[spec.key];
        if (spec.kind === 'array') {
          if (!Array.isArray(value)) continue;
          value.forEach((row, i) => {
            if (!row || typeof row !== 'object') return;
            for (const sub of spec.itemFields) {
              check(sub, (row as Record<string, unknown>)[sub.key], { objectType: type, objectName: name, field: spec.key, itemIndex: i, itemField: sub.key });
            }
          });
        } else {
          check(spec, value, { objectType: type, objectName: name, field: spec.key });
        }
      }
    }
  }
  return issues;
}

/** Duplicate names within a type that differ only by case (EnergyPlus treats them as equal). */
export function checkDuplicateNames(doc: EpJsonDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [type, instances] of Object.entries(doc)) {
    const seen = new Map<string, string>();
    for (const name of Object.keys(instances)) {
      const up = name.toUpperCase();
      const prev = seen.get(up);
      if (prev !== undefined) {
        issues.push({ severity: 'error', source: 'reference', objectType: type, objectName: name, message: `Nome duplicado: "${name}" e "${prev}" são considerados iguais pelo EnergyPlus` });
      } else seen.set(up, name);
    }
  }
  return issues;
}
