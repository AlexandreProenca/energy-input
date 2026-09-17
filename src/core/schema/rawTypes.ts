/**
 * Shapes of `Energy+.schema.epJSON` (and of its slimmed variant produced by
 * `slimSchema`). Only the keywords this app reads are typed; everything else is
 * preserved untouched so ajv still sees the full JSON Schema.
 */

export interface RawField {
  type?: 'number' | 'integer' | 'string' | 'array' | 'object';
  enum?: (string | number)[];
  anyOf?: RawField[];
  default?: string | number;
  units?: string;
  'ip-units'?: string;
  unitsBasedOnField?: string;
  note?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  data_type?: 'object_list' | 'external_list';
  object_list?: string[];
  external_list?: string[];
  reference?: string[];
  retaincase?: boolean;
  items?: { type?: 'object'; properties: Record<string, RawField>; required?: string[] };
  minItems?: number;
  maxItems?: number;
}

export interface RawNameField {
  type?: 'string';
  is_required?: boolean;
  reference?: string[];
  'reference-class-name'?: string[];
  retaincase?: boolean;
  default?: string;
  note?: string;
}

export interface RawInstanceSchema {
  type: 'object';
  properties?: Record<string, RawField>;
  required?: string[];
}

export interface RawObjectType {
  type: 'object';
  patternProperties: Record<string, RawInstanceSchema>;
  group: string;
  memo?: string;
  name?: RawNameField;
  maxProperties?: number;
  minProperties?: number;
  min_fields?: number;
  extensible_size?: number;
  format?: string;
  additionalProperties?: boolean;
  legacy_idd?: {
    field_info: Record<string, { field_name: string; field_type: 'a' | 'n' }>;
    fields: string[];
    alphas?: unknown;
    numerics?: unknown;
    extensibles?: string[];
    extension?: string;
  };
  /** Added by slimSchema: field order (without `name`). */
  field_order?: string[];
  /** Added by slimSchema: human-readable field names from the IDD. */
  field_labels?: Record<string, string>;
}

export interface RawSchema {
  $schema?: string;
  required: string[];
  properties: Record<string, RawObjectType>;
  /** Added by slimSchema. */
  epjson_app_meta?: { version: string; source: string; generated: string };
}
