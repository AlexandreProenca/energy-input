import { useMemo, useState } from 'react';
import { CloudSun, Download, FileUp, MapPin, Search, Snowflake, Sun, ThermometerSun } from 'lucide-react';
import { clsx } from 'clsx';
import { templates } from '@/templates';
import type { BioclimaticZone, ClimateLocation } from '@/templates/climates/types';
import type { CustomLocation } from '@/generators/answers';
import { resolveLocation } from '@/generators/location';
import { estimateDesignDays, estimateSlabGroundTemps, parseEpw } from '@/core/weather/epw';
import { parseDdy } from '@/core/weather/ddy';
import { readTextFile } from '@/lib/files';
import { useSchema } from '@/store/schemaStore';
import { useUiStore } from '@/store/uiStore';
import { Badge, Callout, Field, Segmented, StatTile, fmt } from '@/ui/primitives';
import { Dropzone } from '@/ui/Dropzone';
import { MonthlyTempChart } from '../illustrations';
import { SectionTitle, useStepAnswers } from './common';

const ZB_COLORS = ['#3b82f6', '#38bdf8', '#34d399', '#a3e635', '#facc15', '#fb923c', '#f97316', '#ef4444'];

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function nearestCity(lat: number, lon: number): ClimateLocation {
  let best = templates.cities[0];
  let bestD = Infinity;
  for (const c of templates.cities) {
    const d = (c.latitude - lat) ** 2 + ((c.longitude - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function LocationStep() {
  const [loc, update] = useStepAnswers('location');
  const { index } = useSchema();
  const toast = useUiStore((s) => s.toast);
  const [tab, setTab] = useState<'city' | 'file'>(loc.source === 'custom' ? 'file' : 'city');
  const [query, setQuery] = useState('');
  const [epwInfo, setEpwInfo] = useState<{ text: string; name: string } | undefined>();
  const [busy, setBusy] = useState(false);

  const resolved = resolveLocation(loc, templates);
  const cities = useMemo(() => {
    const q = normalize(query.trim());
    return templates.cities.filter((c) => !q || normalize(`${c.name} ${c.state}`).includes(q));
  }, [query]);

  const buildCustom = (epwText: string, epwName: string, ddyText?: string): CustomLocation => {
    const epw = parseEpw(epwText);
    const label = epw.location.city.replace(/\./g, ' ');
    let designDays = estimateDesignDays(epw.hourly, label);
    let designDaySource = 'estimado do EPW';
    if (ddyText) {
      designDays = parseDdy(index, ddyText);
      designDaySource = 'ASHRAE (DDY)';
    }
    return {
      name: [label, epw.location.state, epw.location.country].filter(Boolean).join(' - '),
      latitude: epw.location.latitude,
      longitude: epw.location.longitude,
      timeZone: epw.location.timeZone,
      elevation: epw.location.elevation,
      epwFileName: epwName,
      designDays,
      designDaySource,
      groundTemperatures: estimateSlabGroundTemps(epw.summary),
      summary: epw.summary,
    };
  };

  const onEpw = async (file: File) => {
    setBusy(true);
    try {
      const text = await readTextFile(file);
      const custom = buildCustom(text, file.name);
      setEpwInfo({ text, name: file.name });
      update({ source: 'custom', custom, zb: nearestCity(custom.latitude, custom.longitude).zb });
      toast(`Arquivo climático de ${custom.name} carregado.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível ler o arquivo EPW.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDdy = async (file: File) => {
    if (!epwInfo) return;
    try {
      const custom = buildCustom(epwInfo.text, epwInfo.name, await readTextFile(file));
      update({ source: 'custom', custom });
      toast('Dias de projeto ASHRAE carregados do arquivo DDY.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível ler o arquivo DDY.', 'error');
    }
  };

  const summary = resolved.summary;
  const heatDD = resolved.designDays.heating.data.maximum_dry_bulb_temperature as number;
  const coolDD = resolved.designDays.cooling.data.maximum_dry_bulb_temperature as number;

  return (
    <div className="space-y-6">
      <Segmented
        ariaLabel="Origem dos dados climáticos"
        value={tab}
        onChange={(t) => {
          setTab(t);
          if (t === 'city') update({ source: 'city' });
          else if (loc.custom) update({ source: 'custom' });
        }}
        options={[
          { value: 'city', label: 'Escolher uma cidade', icon: <MapPin size={15} /> },
          { value: 'file', label: 'Usar meu arquivo climático', icon: <FileUp size={15} /> },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          {tab === 'city' ? (
            <>
              <div className="relative mb-3">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input pl-9" placeholder="Buscar cidade ou UF…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar cidade" />
              </div>
              <ul role="listbox" aria-label="Cidades" className="scrollbar-thin max-h-[300px] space-y-1 overflow-y-auto pr-1 xl:max-h-[520px]">
                {cities.map((c) => {
                  const active = loc.source === 'city' && loc.cityId === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => update({ source: 'city', cityId: c.id })}
                        className={clsx(
                          'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                          active ? 'border-brand-500 bg-brand-50' : 'border-transparent hover:bg-slate-100',
                        )}
                      >
                        <MapPin size={16} className={active ? 'text-brand-600' : 'text-slate-400'} />
                        <span className="flex-1 text-sm font-medium text-slate-800">
                          {c.name} <span className="text-slate-400">· {c.state}</span>
                        </span>
                        <span className="text-xs tabular-nums text-slate-500">{fmt(c.summary.annualMeanDryBulb)} °C</span>
                        <span className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: ZB_COLORS[c.zb - 1] }}>
                          ZB{c.zb}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {cities.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Nenhuma cidade encontrada. Use a aba “Usar meu arquivo climático”.</li>}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                Dados TMYx 2011–2025 de climate.onebuilding.org. Sua cidade não está na lista? Baixe o arquivo EPW mais próximo nesse site e carregue-o na outra aba.
              </p>
            </>
          ) : (
            <div className="space-y-3">
              <Dropzone
                accept=".epw"
                onFile={onEpw}
                icon={<CloudSun size={20} />}
                title={busy ? 'Lendo arquivo…' : loc.custom?.epwFileName ? `Carregado: ${loc.custom.epwFileName}` : 'Arquivo climático .EPW'}
                description="Arraste aqui ou clique para escolher. Latitude, longitude, altitude e temperaturas são lidas do arquivo."
              />
              <Dropzone
                accept=".ddy"
                compact
                onFile={onDdy}
                icon={<ThermometerSun size={18} />}
                title="Opcional: arquivo .DDY (dias de projeto ASHRAE)"
                description={epwInfo ? 'Mais preciso que a estimativa feita a partir do EPW.' : 'Carregue primeiro o EPW.'}
              />
              <Callout tone="info">Sem o DDY, os dias de projeto são estimados a partir das horas mais quentes e mais frias do EPW (percentis 99,6% e 0,4%).</Callout>
            </div>
          )}
        </div>

        {/* Details (shown first when the columns stack) */}
        <div className="order-first space-y-4 rounded-2xl bg-slate-50 p-4 sm:p-5 xl:order-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-slate-900">{resolved.kind === 'city' ? `${resolved.name} - ${resolved.state}` : resolved.name}</p>
              <p className="text-xs text-slate-500">
                {resolved.kind === 'city' ? `Estação ${resolved.station}` : resolved.epwFileName} · dias de projeto: {resolved.designDaySource}
              </p>
            </div>
            {resolved.kind === 'city' && (
              <a
                href={resolved.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm hover:bg-brand-50"
              >
                <Download size={14} /> Baixar EPW
              </a>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Latitude" value={fmt(resolved.latitude, 2)} unit="°" />
            <StatTile label="Longitude" value={fmt(resolved.longitude, 2)} unit="°" />
            <StatTile label="Altitude" value={fmt(resolved.elevation, 0)} unit="m" />
          </div>
          {summary && (
            <div className="rounded-xl bg-white p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">Temperatura média mensal</p>
              <MonthlyTempChart values={summary.monthlyMeanDryBulb} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <StatTile icon={<Snowflake size={13} className="text-sky-500" />} label="Frio de projeto" value={fmt(heatDD)} unit="°C" />
            <StatTile icon={<Sun size={13} className="text-orange-500" />} label="Calor de projeto" value={fmt(coolDD)} unit="°C" />
          </div>

          <Field
            label="Zona bioclimática (NBR 15220-3)"
            help="Divide o Brasil em 8 zonas de clima semelhante. Usamos a zona para indicar os limites de referência da NBR 15575 para paredes e coberturas. A zona sugerida é aproximada: confira na norma e ajuste se necessário."
          >
            <div role="radiogroup" aria-label="Zona bioclimática" className="flex flex-wrap gap-1.5">
              {([1, 2, 3, 4, 5, 6, 7, 8] as BioclimaticZone[]).map((z) => (
                <button
                  key={z}
                  type="button"
                  role="radio"
                  aria-checked={loc.zb === z}
                  onClick={() => update({ zb: z })}
                  className={clsx(
                    'h-9 w-11 rounded-lg text-sm font-semibold transition',
                    loc.zb === z ? 'text-white shadow-md ring-2 ring-offset-2' : 'bg-white text-slate-600 hover:bg-slate-100',
                  )}
                  style={loc.zb === z ? { background: ZB_COLORS[z - 1], ['--tw-ring-color' as string]: ZB_COLORS[z - 1] } : undefined}
                >
                  {z}
                </button>
              ))}
            </div>
          </Field>
          {summary && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="blue">Graus-dia de aquecimento: {summary.hdd18}</Badge>
              <Badge tone="amber">Graus-dia de resfriamento: {summary.cdd24}</Badge>
            </div>
          )}
        </div>
      </div>

      <div>
        <SectionTitle icon={<CloudSun size={16} />}>Para rodar a simulação</SectionTitle>
        <p className="text-sm text-slate-600">
          O arquivo epJSON guarda a localização e os dias de projeto. Para a simulação anual, o EnergyPlus também precisa do arquivo climático
          {resolved.kind === 'city' ? <> <strong>{resolved.epwFileName}</strong> (botão “Baixar EPW”)</> : <> <strong>{resolved.epwFileName}</strong></>}.
        </p>
      </div>
    </div>
  );
}
