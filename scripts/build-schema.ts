/**
 * Converts every vendored `schema/<version>/Energy+.schema.epJSON` into the slim
 * variant served by the app (`public/schema/<version>/schema.json`) and writes a
 * manifest listing the available versions. The newest version is the default.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slimSchema } from '../src/core/schema/slim';
import type { RawSchema } from '../src/core/schema/rawTypes';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'schema');
const outDir = join(root, 'public', 'schema');

const versions = readdirSync(srcDir)
  .filter((v) => existsSync(join(srcDir, v, 'Energy+.schema.epJSON')))
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

for (const version of versions) {
  const src = join(srcDir, version, 'Energy+.schema.epJSON');
  const dest = join(outDir, version, 'schema.json');
  if (existsSync(dest) && statSync(dest).mtimeMs > statSync(src).mtimeMs) continue;
  const raw = JSON.parse(readFileSync(src, 'utf8')) as RawSchema;
  const slim = slimSchema(raw, `EnergyPlus ${version} (Energy+.schema.epJSON)`);
  mkdirSync(join(outDir, version), { recursive: true });
  writeFileSync(dest, JSON.stringify(slim));
  console.log(`schema ${version}: ${Object.keys(slim.properties).length} tipos → ${dest}`);
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ default: versions[0], versions }, null, 2));
