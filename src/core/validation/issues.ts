export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: IssueSeverity;
  /** Object type; undefined for file-level problems. */
  objectType?: string;
  objectName?: string;
  /** Field key (top-level field of the object). */
  field?: string;
  /** Index inside an extensible array, when applicable. */
  itemIndex?: number;
  itemField?: string;
  message: string;
  source: 'schema' | 'reference' | 'file';
}

export function issueKey(i: ValidationIssue): string {
  return [i.objectType, i.objectName, i.field, i.itemIndex, i.itemField, i.message].join('|');
}
