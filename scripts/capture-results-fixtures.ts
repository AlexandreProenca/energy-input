/**
 * T001 — captura de fixtures REAIS de resultados do serviço de simulação.
 *
 * Grava em src/core/results/__fixtures__/ o formato observado de resumo, catálogo de
 * variáveis, séries temporais e artefatos. É a base factual do épico E1: os tipos e os
 * gráficos passam a ser escritos contra resposta real, não contra a prosa do OpenAPI.
 *
 * Dois modos:
 *
 *   # 1. Capturar de uma execução já concluída (não gasta cota, não depende do worker)
 *   SIMULATION_ID=sim_… npx tsx scripts/capture-results-fixtures.ts
 *
 *   # 2. Executar uma simulação anual nova e capturar dela
 *   npx tsx scripts/capture-results-fixtures.ts
 *
 * O token vem de SIMULATION_API_TOKEN ou de .env.local. Fala direto com o serviço (Node
 * não tem CORS), portanto não depende do proxy do Vite. No modo 2 envia apenas um modelo
 * sintético gerado pelo assistente, nunca o documento do usuário.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultAnswers } from '../src/generators/answers';
import { generateDocument } from '../src/generators/compose';
import { templates } from '../src/templates';
import { SimulationApi, terminal, type Simulation } from '../src/features/simulation/api';

const ENGINE = '26.1.0';
const BASE = 'https://homolog.ee.dev.br/v1';
const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'src', 'core', 'results', '__fixtures__');

/**
 * O token nunca é impresso; só se confirma que existe. As aspas são removidas para
 * casar com o `loadEnv` do Vite, que o proxy de desenvolvimento usa sobre o mesmo
 * arquivo: sem isso, `TOKEN="abc"` aqui viraria um Bearer com aspas e daria 401.
 */
function readToken(): string {
  const unquote = (v: string) => v.trim().replace(/^(['"])(.*)\1$/s, '$2').trim();
  const fromEnv = process.env.SIMULATION_API_TOKEN;
  if (fromEnv && unquote(fromEnv)) return unquote(fromEnv);
  const envFile = join(root, '.env.local');
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('SIMULATION_API_TOKEN='));
    const value = line && unquote(line.slice('SIMULATION_API_TOKEN='.length));
    if (value) return value;
  }
  throw new Error('Defina SIMULATION_API_TOKEN no ambiente ou em .env.local.');
}

const token = readToken();
const api = new SimulationApi(token, BASE);
const log = (stage: string, detail: unknown) => console.log(`[${stage}] ${JSON.stringify(detail)}`);

/**
 * O token entra no mapa de higienização por precaução: se o serviço um dia ecoar a
 * credencial em algum campo, ela é trocada antes de virar arquivo versionado
 * (AGENTS.md §7: nenhum segredo versionado). Hoje nenhuma resposta a devolve.
 */
const ids = new Map<string, string>([[token, '<token>']]);
/**
 * Troca identificadores da conta por marcadores estáveis que ainda casam com os padrões
 * do contrato, para que os testes possam validar o formato. Números, nomes de campo e
 * nomes de objeto do modelo ficam intactos.
 */
function scrub(value: unknown): unknown {
  if (typeof value === 'string') {
    let out = value;
    for (const [real, fake] of ids) out = out.split(real).join(fake);
    return out;
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'request_id' ? '<request_id>' : scrub(v)]));
  }
  return value;
}

function write(name: string, value: unknown) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, name), `${JSON.stringify(scrub(value), null, 2)}\n`);
  console.log(`  → ${name}`);
}

/** Consulta crua: para os erros, o corpo estruturado importa mais que a mensagem achatada. */
async function raw(path: string) {
  const response = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, body: (await response.json().catch(() => null)) as unknown };
}

async function runNewSimulation(): Promise<Simulation> {
  const engines = await api.engines();
  if (!engines.engines.some((e) => e.version === ENGINE)) throw new Error(`Motor ${ENGINE} indisponível.`);

  // `city` vazio lista o catálogo do tenant — a busca por nome é exata e o acervo é
  // pequeno, então filtrar do lado de cá é mais honesto do que adivinhar a grafia.
  const weather = await api.weather('');
  const station = weather.itens.find((w) => /floriano/i.test(w.city)) ?? weather.itens[0];
  if (!station) throw new Error('O catálogo de climas do tenant está vazio; não há como executar em modo anual.');
  log('clima', { id: station.id, cidade: station.city, disponiveis: weather.itens.length });

  // Ano completo, dois pavimentos (duas zonas provocam a ambiguidade de chave) e o preset
  // de conforto ligado, que é o que grava a temperatura operativa. A cidade do projeto
  // acompanha a estação: EPW e Site:Location divergentes geram aviso no motor.
  const answers = defaultAnswers();
  answers.project.buildingName = 'Captura de resultados Energy Input';
  answers.location = { source: 'city', cityId: 'sc-florianopolis', zb: 3 };
  answers.runPeriod.mode = 'year';
  answers.geometry.floors = 2;
  answers.outputs.selected = ['resumo', 'cargas', 'conta', 'conforto'];
  const generated = generateDocument(answers, templates);
  log('modelo', { zonas: generated.info.zones.map((z) => z.name) });

  const model = await api.uploadModel(JSON.stringify(generated.document), 'captura-resultados.epJSON');
  ids.set(model.id, 'mdl_01M2KXAZ9WQK8YT4N6P0R2S5V7').set(model.versao.id, 'mv_01M2KXB16RP92SR9SCA3PBVMSF');
  ids.set(station.id, 'wx_bra_sc_florianopolis_838970_tenant');
  log('upload', { modelo: model.id, versao: model.versao.id });

  let sim = await api.create(
    {
      model_version_id: model.versao.id,
      engine_version: ENGINE,
      run_type: 'annual',
      weather_id: station.id,
      options: { sqlite: true, expand_objects: false, readvars: false },
    },
    randomUUID(),
  );
  log('execucao', { simulacao: sim.id, status: sim.status });

  const started = Date.now();
  for (let i = 0; i < 240 && !terminal(sim.status); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    sim = await api.status(sim.id);
    if (i % 6 === 0) log('aguardando', { status: sim.status, segundos: Math.round((Date.now() - started) / 1000) });
  }
  return sim;
}

// ---------------------------------------------------------------------------
// 1. Descobrir a execução de onde capturar.
// ---------------------------------------------------------------------------
const chosen = process.env.SIMULATION_ID?.trim();
let sim: Simulation;

if (chosen) {
  if (!/^sim_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(chosen)) throw new Error(`"${chosen}" não é um identificador de simulação válido.`);
  sim = await api.status(chosen);
  log('adotada', { simulacao: sim.id, status: sim.status, tipo: sim.run_type, duracao: sim.duration_seconds ?? null });
} else {
  sim = await runNewSimulation();
  log('terminou', { status: sim.status, motivo: sim.failure_reason ?? null, duracao: sim.duration_seconds ?? null });
}
ids.set(sim.id, 'sim_01M2KXB9D4TQ7F3S0YJ8N5VZQK').set(sim.model_version_id, 'mv_01M2KXB16RP92SR9SCA3PBVMSF');

if (sim.status !== 'succeeded') {
  // O diagnóstico é o entregável quando a execução falha — é o que destrava (ou para) o épico.
  const [diagnostics, logs] = await Promise.all([
    api.diagnostics(sim.id).catch((e) => ({ erro: String(e) })),
    api.logs(sim.id).catch((e) => ({ erro: String(e) })),
  ]);
  console.log(JSON.stringify({ diagnostics, logs }, null, 2));
  throw new Error(`A simulação terminou em "${sim.status}". Fixtures não foram gravadas.`);
}

// ---------------------------------------------------------------------------
// 2. Resultados permanentes.
// ---------------------------------------------------------------------------
const summary = await api.summary(sim.id);
write('summary.json', summary);
log('resumo', {
  end_uses: summary.end_uses.map((u) => u.category),
  comfort: summary.comfort.map((c) => `${c.name} = ${c.value} ${c.units}`),
  peak: summary.peak_demand.map((p) => `${p.resource} = ${p.value} ${p.units}`),
});

write('artifacts.json', await api.artifacts(sim.id));

/** O catálogo pagina; a primeira página basta como fixture, mas é de TIPOS, sem chaves. */
const catalog = await api.request<{ items: { name: string; type: string }[]; total: number }>(
  `/simulations/${sim.id}/results/variables?limit=200`,
);
write('catalogo-variaveis.json', catalog);
log('catalogo', { total: catalog.total, na_pagina: catalog.items.length, medidores: catalog.items.filter((i) => i.type === 'meter').length });

// ---------------------------------------------------------------------------
// 3. Séries. O catálogo não traz chaves, então elas vêm do 422 de ambiguidade.
// ---------------------------------------------------------------------------
interface SeriesPage { variable: { name: string; key: string; units: string | null }; itens: unknown[]; proximo_cursor?: string | null }
const seriesPath = (q: Record<string, string>) => `/simulations/${sim.id}/results/timeseries?${new URLSearchParams(q)}`;

/**
 * O catálogo lista o que o modelo PODERIA relatar (RDD/MDD), não o que foi gravado —
 * o próprio contrato avisa. Não há endpoint que responda "o que esta execução registrou",
 * então a descoberta é por tentativa: variável ausente devolve 422
 * "variável inexistente nesta simulação". A `key` vem de volta na resposta que der 200.
 */
const PROCURADAS: { variable: string; nome: string; limite: number }[] = [
  { variable: 'EnergyTransfer:Facility', nome: 'serie-medidor-energia.json', limite: 48 },
  { variable: 'Electricity:Facility', nome: 'serie-medidor-eletricidade.json', limite: 48 },
  { variable: 'Zone Operative Temperature', nome: 'serie-temperatura-operativa.json', limite: 72 },
  { variable: 'Zone Mean Air Temperature', nome: 'serie-temperatura-do-ar.json', limite: 72 },
  { variable: 'Site Outdoor Air Drybulb Temperature', nome: 'serie-temperatura-externa.json', limite: 72 },
];

const ausentes: string[] = [];
let erroCapturado = false;

for (const { variable, nome, limite } of PROCURADAS) {
  const resposta = await raw(seriesPath({ variable }));
  if (resposta.status === 200) {
    const page = resposta.body as SeriesPage;
    log('serie', {
      variavel: page.variable.name, chave: page.variable.key,
      unidade: page.variable.units, pontos: page.itens.length,
    });
    // Uma página horária inteira passa de 1 MB; a fixture guarda o formato, não o volume.
    write(nome, { ...page, itens: page.itens.slice(0, limite), _pontos_na_pagina_original: page.itens.length });
    continue;
  }
  ausentes.push(variable);
  if (resposta.status === 422 && !erroCapturado) {
    // O 422 é o mesmo código para "não existe" e para ambiguidade de chave; o seletor
    // de séries precisa distinguir os dois pelo corpo, então o formato vira fixture.
    write('erro-422-variavel-inexistente.json', { _http_status: resposta.status, ...(resposta.body as object) });
    erroCapturado = true;
  } else if (resposta.status !== 422) {
    console.error(`[serie] ${variable}: HTTP ${resposta.status} ${JSON.stringify(resposta.body)}`);
  }
}
if (ausentes.length) log('ausentes', { nao_gravadas_por_esta_execucao: ausentes });

console.log('\nFixtures gravadas em src/core/results/__fixtures__/.');
