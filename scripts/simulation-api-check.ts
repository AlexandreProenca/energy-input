/** Opt-in live integration check. Sends only a generated test model, never the user's document. */
import { randomUUID } from 'node:crypto';
import { defaultAnswers } from '../src/generators/answers';
import { generateDocument } from '../src/generators/compose';
import { templates } from '../src/templates';
import { SimulationApi, terminal } from '../src/features/simulation/api';
const api = new SimulationApi('', 'http://127.0.0.1:5173/simulation-api/v1');
const a = defaultAnswers();
a.project.buildingName = 'Validação da integração Energy Input'; a.runPeriod.mode = 'designDays';
const engines = await api.engines();
if (!engines.engines.some(e => e.version === '26.1.0')) throw new Error('Motor 26.1.0 indisponível.');
const model = await api.uploadModel(JSON.stringify(generateDocument(a, templates).document), 'validacao-integracao.epJSON');
const key = randomUUID();
const body = { model_version_id: model.versao.id, engine_version: '26.1.0', run_type: 'design_day' as const,
  options: { sqlite: true, expand_objects: false, readvars: false } };
let sim = await api.create(body, key);
const replay = await api.create(body, key);
if (replay.id !== sim.id) throw new Error('A repetição não preservou o id.');
console.log(JSON.stringify({ model: model.id, simulation: sim.id, status: sim.status, idempotency: 'ok' }));
for (let i = 0; i < 60 && !terminal(sim.status); i++) {
  await new Promise(resolve => setTimeout(resolve, 3000)); sim = await api.status(sim.id);
}
console.log(JSON.stringify({ simulation: sim.id, status: sim.status, reason: sim.failure_reason }));
if (sim.status !== 'succeeded') {
  console.log(JSON.stringify({ diagnostics: await api.diagnostics(sim.id), logs: await api.logs(sim.id) }));
  throw new Error('A simulação não concluiu com sucesso.');
}
const summary = await api.summary(sim.id), errors = await api.diagnostics(sim.id), artifacts = await api.artifacts(sim.id);
console.log(JSON.stringify({ area: summary.building_area, verdict: errors.verdict, artifacts: artifacts.itens.length, complete: artifacts.complete }));
const artifact = artifacts.itens.find(a => a.name.endsWith('.err'));
if (!artifact) throw new Error('Diagnóstico .err ausente.');
const download = await api.download(sim.id, artifact.name);
const response = await fetch(download.download_url);
if (!response.ok) throw new Error('Falha no download do artefato.');
console.log(JSON.stringify({ download: artifact.name, bytes: (await response.arrayBuffer()).byteLength, status: response.status }));
