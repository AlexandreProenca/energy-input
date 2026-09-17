/**
 * Dev-only smoke test: generates wizard files and runs them through a local
 * EnergyPlus install, failing on Severe/Fatal errors. Not used by the app.
 *
 *   EPLUS_DIR=/path/to/EnergyPlus npx tsx scripts/eplus-check.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { templates } from '../src/templates';
import { defaultAnswers, type WizardAnswers } from '../src/generators/answers';
import { generateDocument } from '../src/generators/compose';
import { importLibraryConstruction, importLibraryMaterial } from '../src/generators/library';
import { readGeometryModel } from '../src/core/geometry/model';
import { addOpening, constructionLayers, editConstruction, materialWithThickness, resizeZoneBox } from '../src/core/geometry/edits';
import type { EpJsonDocument } from '../src/core/epjson/types';

const eplus = process.env.EPLUS_DIR;
const epw = process.env.EPW;
if (!eplus || !existsSync(join(eplus, 'energyplus'))) throw new Error('Defina EPLUS_DIR com a pasta do EnergyPlus.');
if (!epw) throw new Error('Defina EPW com um arquivo climático.');

// Optional post-processing with the 3D editor operations.
const editorEdits: Record<string, (d: EpJsonDocument) => EpJsonDocument> = {
  'editor-3d': (d) => {
    d = resizeZoneBox(d, 'Pavimento 1', { width: 14, depth: 9, height: 3.2 }, true);
    d = importLibraryConstruction(d, templates, 'door:metalica').doc;
    d = importLibraryConstruction(d, templates, 'glazing:duplo_lowe').doc;
    let m = readGeometryModel(d);
    d = addOpening(d, m, 'Pavimento 1 - Parede Norte', { category: 'Door', rect: { x: 1, y: 0, width: 0.9, height: 2.1 }, construction: 'Porta - Porta metálica isolada' }).doc;
    m = readGeometryModel(d);
    d = addOpening(d, m, 'Pavimento 2 - Parede Oeste', { category: 'Window', rect: { x: 0.5, y: 1, width: 1.2, height: 1.2 }, construction: 'Janela - Vidro duplo low-E' }).doc;
    m = readGeometryModel(d);
    d = addOpening(d, m, 'Pavimento 1 - Parede Leste', { category: 'GlassDoor', rect: { x: 0.3, y: 0, width: 1.6, height: 2.2 }, construction: 'Janela - Vidro duplo low-E' }).doc;
    const wall = 'Parede externa - Padrão';
    const layers = constructionLayers(d, wall);
    const t = materialWithThickness(d, layers[1], 0.19);
    d = t.doc;
    const eps = importLibraryMaterial(d, templates, 'eps', 0.03);
    d = eps.doc;
    d = editConstruction(d, wall, [layers[0], eps.name, t.name, layers[2]], { mode: 'only', element: 'Pavimento 2 - Parede Sul' }).doc;
    return d;
  },
};

const cases: [string, (a: WizardAnswers) => void][] = [
  ['editor-3d', (a) => {
    a.geometry.floors = 2;
  }],
  ['padrao', () => {}],
  ['escritorio-3pav-isolado', (a) => {
    a.geometry.floors = 3;
    a.geometry.groundFloor = 'raised';
    a.envelope.presetId = 'isolado';
    a.loads.useId = 'escritorio';
    a.hvac = { heatingSetpoint: 20, coolingSetpoint: 24, setbackEnabled: true };
    a.windows = { mode: 'perFacade', wwr: 0, perFacade: { north: 50, south: 30, east: 10, west: 0 }, glazingId: 'duplo_lowe' };
    a.outputs.selected = templates.outputs.map((o) => o.id);
    a.project.northAxis = 30;
  }],
  ['periodo-virada-do-ano', (a) => {
    a.runPeriod = { mode: 'range', beginMonth: 12, beginDay: 1, endMonth: 2, endDay: 28 };
    a.geometry.floors = 2;
  }],
  ['comercio-leve-dias-projeto', (a) => {
    a.envelope.presetId = 'leve';
    a.loads.useId = 'comercio';
    a.runPeriod.mode = 'designDays';
    a.location.cityId = 'am-manaus';
  }],
];

let failed = 0;
for (const [name, mutate] of cases) {
  const a = defaultAnswers();
  mutate(a);
  let { document } = generateDocument(a, templates);
  if (editorEdits[name]) document = editorEdits[name](document);
  const dir = join(process.env.OUT ?? tmpdir(), `eplus-check-${name}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.epJSON`);
  writeFileSync(file, JSON.stringify(document, null, 2));
  try {
    execFileSync(join(eplus, 'energyplus'), ['-w', epw, '-d', dir, file], { stdio: 'pipe' });
  } catch {
    /* inspect the .err file below */
  }
  const err = readFileSync(join(dir, 'eplusout.err'), 'utf8');
  const severe = err.split('\n').filter((l) => /\*\*\s*(Severe|Fatal)\s*\*\*/.test(l));
  const warnings = err.split('\n').filter((l) => /\*\*\s*Warning\s*\*\*/.test(l));
  const ok = /EnergyPlus Completed Successfully/.test(err) && severe.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}: ${severe.length} severe, ${warnings.length} warnings → ${dir}`);
  for (const l of [...severe, ...warnings]) console.log('   ', l.trim());
}
process.exit(failed ? 1 : 0);
