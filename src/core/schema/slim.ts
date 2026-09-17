import type { RawSchema } from './rawTypes';

/**
 * Drops the bulky `legacy_idd` block (≈45% of the file) while keeping the two
 * things the editor needs from it: field order and IDD field labels. The result
 * is still a valid JSON Schema for ajv. Used by the build script and when a
 * user uploads a different schema version at runtime.
 */
export function slimSchema(raw: RawSchema, source = 'Energy+.schema.epJSON'): RawSchema {
  const properties: RawSchema['properties'] = {};
  for (const [type, def] of Object.entries(raw.properties)) {
    const { legacy_idd, ...rest } = def;
    const out = { ...rest };
    if (legacy_idd) {
      out.field_order = legacy_idd.fields.filter((f) => f !== 'name');
      out.field_labels = Object.fromEntries(
        Object.entries(legacy_idd.field_info).map(([k, v]) => [k, v.field_name]),
      );
      // Extensible array fields are not in legacy `fields`; append them last.
      if (legacy_idd.extension && !out.field_order.includes(legacy_idd.extension)) {
        out.field_order.push(legacy_idd.extension);
      }
    }
    properties[type] = out;
  }
  return {
    $schema: raw.$schema,
    required: raw.required,
    properties,
    epjson_app_meta: { version: detectSchemaVersion(raw), source, generated: new Date().toISOString() },
  };
}

export function detectSchemaVersion(raw: RawSchema): string {
  const inst = raw.properties.Version?.patternProperties;
  const first = inst && Object.values(inst)[0];
  const def = first?.properties?.version_identifier?.default;
  // The schema stores this default as a number (26.1), despite type "string".
  return def !== undefined ? String(def) : 'desconhecida';
}

/** Basic structural sanity check for user-uploaded schema files. */
export function looksLikeEpJsonSchema(value: unknown): value is RawSchema {
  if (!value || typeof value !== 'object') return false;
  const v = value as RawSchema;
  return !!v.properties && typeof v.properties === 'object' && !!v.properties.Building && !!v.properties.Zone;
}
