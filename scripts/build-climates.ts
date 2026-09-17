/**
 * Builds src/templates/climates/br-cities.json from climate.onebuilding.org
 * TMYx files: site data from the EPW header, monthly climate summary from the
 * hourly data, and ASHRAE design days from the DDY. Only these derived values
 * are bundled — the EPW itself is downloaded by the user when running.
 *
 *   npm run climates
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaIndex } from '../src/core/schema/schemaIndex';
import type { RawSchema } from '../src/core/schema/rawTypes';
import { parseDdy } from '../src/core/weather/ddy';
import { estimateDesignDays, estimateSlabGroundTemps, parseEpw } from '../src/core/weather/epw';
import type { BioclimaticZone, ClimateLocation } from '../src/templates/climates/types';

const root = fileURLToPath(new URL('..', import.meta.url));
const cache = join(root, '.cache', 'climates');
const BASE = 'https://climate.onebuilding.org/WMO_Region_3_South_America/BRA_Brazil/';

// [folder/file stem, display name, UF, zona bioclimática NBR 15220-3]
const CITIES: [string, string, string, BioclimaticZone][] = [
  ['AC_Acre/BRA_AC_Rio.Branco-Medici.Intl.AP.829170', 'Rio Branco', 'AC', 8],
  ['AL_Alagoas/BRA_AL_Maceio-Palmares.Intl.AP.829930', 'Maceió', 'AL', 8],
  ['AM_Amazonas/BRA_AM_Manaus-Gomes.Intl.AP.821110', 'Manaus', 'AM', 8],
  ['AP_Amapa/BRA_AP_Macapa-Alcolumbre.Intl.AP.820990', 'Macapá', 'AP', 8],
  ['BA_Bahia/BRA_BA_Salvador-Magalhaes.Intl.AP.832480', 'Salvador', 'BA', 8],
  ['CE_Ceara/BRA_CE_Fortaleza-Pinto.Martins.Intl.AP.823980', 'Fortaleza', 'CE', 8],
  ['DF_Distrito_Federal/BRA_DF_Brasilia-Kubitschek.Intl.AP.833780', 'Brasília', 'DF', 4],
  ['ES_Espirito_Santo/BRA_ES_Vitoria-Aguiar.Salles.AP.836490', 'Vitória', 'ES', 8],
  ['GO_Goias/BRA_GO_Goiania-Santa.Genoveva.AP.834240', 'Goiânia', 'GO', 6],
  ['MA_Maranhao/BRA_MA_Sao.Luis-Machado.Intl.AP.822810', 'São Luís', 'MA', 8],
  ['MG_Minas_Gerais/BRA_MG_Belo.Horizonte-Pampulha-Andrade.AP.835830', 'Belo Horizonte', 'MG', 3],
  ['MS_Mato_Grosso_do_Sul/BRA_MS_Campo.Grande.Intl.AP.836120', 'Campo Grande', 'MS', 6],
  ['MT_Mato_Grosso/BRA_MT_Cuiaba-Rondon.Intl.AP.833620', 'Cuiabá', 'MT', 7],
  ['PA_Para/BRA_PA_Belem-Val.de.Cans.Intl.AP.821930', 'Belém', 'PA', 8],
  ['PB_Paraiba/BRA_PB_Joao.Pessoa.827980', 'João Pessoa', 'PB', 8],
  ['PE_Pernambuco/BRA_PE_Recife-Guararapes-Freyre.Intl.AP.828990', 'Recife', 'PE', 8],
  ['PE_Pernambuco/BRA_PE_Petrolina.819910', 'Petrolina', 'PE', 7],
  ['PI_Piaui/BRA_PI_Teresina-Portella.AP.825790', 'Teresina', 'PI', 7],
  ['PR_Parana/BRA_PR_Curitiba-Pena.Intl.AP.838400', 'Curitiba', 'PR', 1],
  ['PR_Parana/BRA_PR_Londrina-Richa.AP.837680', 'Londrina', 'PR', 3],
  ['RJ_Rio_de_Janeiro/BRA_RJ_Rio.de.Janeiro-Santos.Dumont.AP.837550', 'Rio de Janeiro', 'RJ', 8],
  ['RN_Rio_Grande_do_Norte/BRA_RN_Natal.Intl.AP.825990', 'Natal', 'RN', 8],
  ['RO_Rondonia/BRA_RO_Porto.Velho-Oliveira.Intl.AP.828240', 'Porto Velho', 'RO', 8],
  ['RR_Roraima/BRA_RR_Boa.Vista.Intl.AP.820220', 'Boa Vista', 'RR', 8],
  ['RS_Rio_Grande_do_Sul/BRA_RS_Porto.Alegre-Salgado.Filho.Intl.AP.839710', 'Porto Alegre', 'RS', 3],
  ['RS_Rio_Grande_do_Sul/BRA_RS_Santa.Maria.839360', 'Santa Maria', 'RS', 2],
  ['RS_Rio_Grande_do_Sul/BRA_RS_Caxias.do.Sul.839420', 'Caxias do Sul', 'RS', 1],
  ['RS_Rio_Grande_do_Sul/BRA_RS_Pelotas-Lopes.Neto.Intl.AP.839850', 'Pelotas', 'RS', 2],
  ['SC_Santa_Catarina/BRA_SC_Florianopolis-Luz.Intl.AP.838990', 'Florianópolis', 'SC', 3],
  ['SE_Sergipe/BRA_SE_Aracaju-Santa.Maria.Intl.AP.830950', 'Aracaju', 'SE', 8],
  ['SP_Sao_Paulo/BRA_SP_Sao.Paulo-Congonhas.AP.837800', 'São Paulo', 'SP', 3],
  ['SP_Sao_Paulo/BRA_SP_Campinas-Viracopos.Intl.AP.837210', 'Campinas', 'SP', 3],
  ['SP_Sao_Paulo/BRA_SP_Campos.do.Jordao.868720', 'Campos do Jordão', 'SP', 1],
  ['TO_Tocantins/BRA_TO_Palmas-Rodrigues.AP.830650', 'Palmas', 'TO', 7],
];
const PERIOD = 'TMYx.2011-2025';

const schema = JSON.parse(readFileSync(join(root, 'public/schema/26.1/schema.json'), 'utf8')) as RawSchema;
const index = new SchemaIndex(schema);
mkdirSync(cache, { recursive: true });

const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const out: ClimateLocation[] = [];

for (const [path, name, uf, zb] of CITIES) {
  const stem = path.split('/')[1] + '_' + PERIOD;
  const dir = join(cache, stem);
  const url = `${BASE}${path}_${PERIOD}.zip`;
  if (!existsSync(dir)) {
    const zip = `${dir}.zip`;
    execSync(`curl -sSfL -o "${zip}" "${url}"`);
    execSync(`unzip -o -q "${zip}" '*.epw' '*.ddy' -d "${dir}"`);
  }
  const files = readdirSync(dir);
  const epwName = files.find((f) => f.endsWith('.epw'))!;
  const epw = parseEpw(readFileSync(join(dir, epwName), 'latin1'));
  let dd;
  let ddSource = 'ASHRAE (DDY)';
  try {
    dd = parseDdy(index, readFileSync(join(dir, files.find((f) => f.endsWith('.ddy'))!), 'latin1'));
  } catch {
    dd = estimateDesignDays(epw.hourly, name);
    ddSource = 'estimado do EPW';
  }
  const rename = (d: { name: string; data: Record<string, unknown> }, label: string) => ({ name: `${name} ${label}`, data: d.data });
  out.push({
    id: `${uf.toLowerCase()}-${slug(name)}`,
    name,
    state: uf,
    zb,
    station: epw.location.city.replace(/\./g, ' '),
    latitude: epw.location.latitude,
    longitude: epw.location.longitude,
    timeZone: epw.location.timeZone,
    elevation: epw.location.elevation,
    epwFileName: epwName,
    downloadUrl: url,
    summary: epw.summary,
    designDays: {
      heating: rename(dd.heating, 'Aquecimento 99.6% TBS'),
      cooling: rename(dd.cooling, 'Resfriamento 0.4% TBS'),
    },
    designDaySource: ddSource,
    groundTemperatures: estimateSlabGroundTemps(epw.summary),
  });
  console.log(`✓ ${name}/${uf} ZB${zb} — média ${epw.summary.annualMeanDryBulb} °C, projeto ${dd.heating.data.maximum_dry_bulb_temperature}/${dd.cooling.data.maximum_dry_bulb_temperature} °C (${ddSource})`);
}

out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
writeFileSync(join(root, 'src/templates/climates/br-cities.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`${out.length} cidades gravadas.`);
