import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RawSchema } from './schema/rawTypes';
import { slimSchema } from './schema/slim';
import { SchemaIndex } from './schema/schemaIndex';
import { EpJsonValidator } from './validation/validate';

/** Test helper: loads the vendored schema once per test file. */
let cached: { schema: RawSchema; index: SchemaIndex; validator: EpJsonValidator } | undefined;
export function loadTestSchema() {
  if (!cached) {
    const raw = JSON.parse(readFileSync(resolve(__dirname, '../../schema/26.1/Energy+.schema.epJSON'), 'utf8')) as RawSchema;
    const schema = slimSchema(raw);
    cached = { schema, index: new SchemaIndex(schema), validator: new EpJsonValidator(schema) };
  }
  return cached;
}
