/**
 * Extracts Energy+.schema.epJSON for an EnergyPlus release into schema/<version>/.
 * The schema is generated at build time and is NOT committed to the EnergyPlus
 * repository, so it is pulled out of the official release tarball.
 *
 *   npm run fetch-schema -- v26.1.0
 */
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error('Uso: npm run fetch-schema -- v26.1.0');
  process.exit(1);
}
const repo = 'NatLabRockies/EnergyPlus';
const release = JSON.parse(execSync(`curl -sSL https://api.github.com/repos/${repo}/releases/tags/${tag}`).toString());
const asset = (release.assets as { name: string; browser_download_url: string }[]).find((a) =>
  /Linux-Ubuntu.*x86_64\.tar\.gz$/.test(a.name),
);
if (!asset) throw new Error(`Nenhum pacote .tar.gz Linux encontrado para ${tag}`);

const tmp = mkdtempSync(join(tmpdir(), 'eplus-schema-'));
console.log(`Baixando ${asset.name} (extraindo apenas o schema)…`);
execSync(`curl -sSL "${asset.browser_download_url}" | tar -xz -C "${tmp}" --wildcards '*Energy+.schema.epJSON'`, {
  stdio: 'inherit',
  shell: '/bin/bash',
});
const dir = readdirSync(tmp)[0];
const version = tag.slice(1).split('.').slice(0, 2).join('.');
mkdirSync(join('schema', version), { recursive: true });
renameSync(join(tmp, dir, 'Energy+.schema.epJSON'), join('schema', version, 'Energy+.schema.epJSON'));
console.log(`OK → schema/${version}/Energy+.schema.epJSON. Rode "npm run schema".`);
