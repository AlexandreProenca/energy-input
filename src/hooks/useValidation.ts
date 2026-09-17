import { useEffect, useMemo, useState } from 'react';
import type { EpJsonDocument } from '@/core/epjson/types';
import { checkCrossReferences, checkDuplicateNames } from '@/core/validation/crossRefs';
import type { ValidationIssue } from '@/core/validation/issues';
import { useDocumentStore } from '@/store/documentStore';
import { useSchemaStore } from '@/store/schemaStore';

export interface ValidationSummary {
  issues: ValidationIssue[];
  errors: number;
  warnings: number;
  byObject: Map<string, ValidationIssue[]>;
  pending: boolean;
}

export const objectKey = (type?: string, name?: string) => `${type ?? ''}::${name ?? ''}`;

function useDebounced<T>(value: T, ms: number): [T, boolean] {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return [debounced, debounced !== value];
}

/** Schema + cross-reference validation of the current document, debounced. */
export function useValidation(delay = 250): ValidationSummary {
  const doc = useDocumentStore((s) => s.doc);
  const index = useSchemaStore((s) => s.index);
  const validator = useSchemaStore((s) => s.validator);
  const [debounced, pending] = useDebounced<EpJsonDocument>(doc, delay);

  return useMemo(() => {
    const issues = validator && index ? [...validator.validate(debounced), ...checkCrossReferences(debounced, index), ...checkDuplicateNames(debounced)] : [];
    const byObject = new Map<string, ValidationIssue[]>();
    for (const i of issues) {
      const k = objectKey(i.objectType, i.objectName);
      byObject.set(k, [...(byObject.get(k) ?? []), i]);
    }
    return {
      issues,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      byObject,
      pending,
    };
  }, [debounced, validator, index, pending]);
}
