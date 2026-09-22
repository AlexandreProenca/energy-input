import { useState } from 'react';
import { Download, Loader2, Play, RefreshCw, Square } from 'lucide-react';
import { Button, Callout, Dialog, Field, fmt } from '@/ui/primitives';
import { useDocumentStore } from '@/store/documentStore';
import { useValidation } from '@/hooks/useValidation';
import { rotuloDeRecurso, rotuloDeUsoFinal, rotuloDoResumo } from '@/core/results/rotulos';
import { SimulationApi, terminal, type Weather } from './api';
import { useSimulationStore } from './simulationStore';

const STATUS: Record<string, string> = { queued: 'Na fila', running: 'Simulando', succeeded: 'Concluída', failed: 'Falhou', cancelled: 'Cancelada', timeout: 'Tempo limite excedido' };
export function SimulationDialog() {
  const s = useSimulationStore();
  const doc = useDocumentStore(state => state.doc);
  const validation = useValidation();
  const [engines, setEngines] = useState<string[]>([]);
  const [engine, setEngine] = useState('');
  const [runType, setRunType] = useState<'annual' | 'design_day'>(Object.keys(doc.RunPeriod ?? {}).length ? 'annual' : 'design_day');
  const [trackId, setTrackId] = useState('');
  const [city, setCity] = useState('');
  const [weather, setWeather] = useState<Weather[]>([]);
  const [weatherId, setWeatherId] = useState('');
  const [cursor, setCursor] = useState<string | null>();
  const [license, setLicense] = useState('');
  const [file, setFile] = useState<File>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [downloadLinks, setDownloadLinks] = useState<Record<string, string>>({});
  const modelVersion = String(Object.values(doc.Version ?? {})[0]?.version_identifier ?? '');
  const compatible = engines.filter(v => v.split('.').slice(0, 2).join('.') === modelVersion.split('.').slice(0, 2).join('.'));
  const pending = !!s.simulation && !terminal(s.simulation.status);
  const uncertain = !!s.attempt && !s.simulation;
  const disabled = working || s.busy;
  const api = () => new SimulationApi(useSimulationStore.getState().token);
  const perform = async (action: () => Promise<void>) => {
    if (working) return;
    setWorking(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setWorking(false); }
  };
  const connect = () => perform(async () => {
    const data = await api().engines();
    setEngines(data.engines.map(e => e.version));
    setEngine(data.engines.find(e => e.version.split('.').slice(0, 2).join('.') === modelVersion.split('.').slice(0, 2).join('.'))?.version ?? '');
    if (s.simulation) await s.refresh();
  });
  const search = (more = false) => perform(async () => {
    const data = await api().weather(city.trim(), more ? cursor ?? undefined : undefined);
    setWeather(previous => more ? [...previous, ...data.itens] : data.itens);
    if (!more) setWeatherId(''); setCursor(data.proximo_cursor);
    if (!data.itens.length) setError('Nenhum clima encontrado. Busque outra cidade ou envie um EPW.');
  });
  const upload = () => perform(async () => {
    if (!file) return;
    const data = await api().uploadWeather(file, license.trim());
    setWeather(previous => [data, ...previous.filter(w => w.id !== data.id)]); setWeatherId(data.id);
  });
  const result = s.summary;
  return <Dialog open={s.open} onClose={() => s.setOpen(false)} title="Simular modelo" icon={<Play size={18} />} size="xl">
    <div className="space-y-5">
      <p className="text-sm text-slate-600">Envie uma cópia do modelo atual para <strong>homolog.ee.dev.br</strong>. As edições locais continuam disponíveis; os resultados pertencem à cópia enviada.</p>
      <section className="space-y-3 rounded-xl bg-slate-50 p-4">
        <h3 className="font-semibold">Conexão</h3>
        <Field label="Chave de API ou token (opcional quando configurado no servidor local)">
          <input className="input" type="password" autoComplete="off" spellCheck={false} value={s.token} onChange={e => { s.setToken(e.target.value); setEngines([]); }} placeholder="Credencial de homologação" />
        </Field>
        <p className="text-xs text-slate-500">A credencial digitada é mantida apenas em memória nesta página.</p>
        <Button onClick={() => void connect()} disabled={disabled}>Conectar à API</Button>
      </section>
      {(error || s.error) && <Callout tone="error">{error || s.error}</Callout>}
      {engines.length > 0 && <section className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`EnergyPlus (modelo ${modelVersion || 'sem versão'})`}>
            <select className="input" value={engine} onChange={e => setEngine(e.target.value)} disabled={disabled || pending || uncertain}>
              <option value="">Selecione o motor</option>{compatible.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Período da simulação">
            <select className="input" value={runType} onChange={e => setRunType(e.target.value as typeof runType)} disabled={disabled || pending || uncertain}>
              <option value="annual">Período climático do modelo (com EPW)</option><option value="design_day">Somente dias de projeto</option>
            </select>
          </Field>
        </div>
        {!compatible.length && <Callout tone="warning">A API não oferece um motor compatível com a versão deste modelo.</Callout>}
        {runType === 'annual' && <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold">Arquivo climático da execução</h3>
          <p className="text-xs text-slate-500">Selecione explicitamente a estação correspondente ao projeto. Um EPW usado no assistente precisa ser enviado aqui para ficar disponível na API.</p>
          <div className="flex items-end gap-2"><Field label="Buscar cidade"><input className="input" value={city} onChange={e => { setCity(e.target.value); setCursor(null); }} placeholder="São Paulo" /></Field>
            <Button disabled={disabled || pending || uncertain} onClick={() => void search()}>Buscar</Button></div>
          <Field label="Estação / arquivo EPW"><select className="input" value={weatherId} onChange={e => setWeatherId(e.target.value)} disabled={disabled || pending || uncertain}>
            <option value="">Selecione um clima</option>{weather.map(w => <option key={w.id} value={w.id}>{w.city} · {w.region} · estação {w.station} · {w.source}</option>)}
          </select></Field>
          {weatherId && <p className="text-xs text-slate-500">{weatherId} · lat. {weather.find(w => w.id === weatherId)?.latitude}, lon. {weather.find(w => w.id === weatherId)?.longitude}</p>}
          {cursor && <Button size="sm" disabled={disabled} onClick={() => void search(true)}>Mais estações</Button>}
          <details><summary className="cursor-pointer text-sm font-medium text-brand-700">Enviar meu arquivo EPW</summary><div className="mt-3 space-y-2">
            <Field label="Arquivo EPW"><input type="file" accept=".epw" disabled={disabled || pending || uncertain} onChange={e => setFile(e.target.files?.[0])} /></Field>
            <Field label="Licença do arquivo"><input className="input" maxLength={60} value={license} onChange={e => setLicense(e.target.value)} placeholder="Informe a licença ou autorização de uso" /></Field>
            <Button disabled={disabled || !file || !license.trim() || pending || uncertain} onClick={() => void upload()}>Enviar EPW</Button>
          </div></details>
        </div>}
        {validation.errors > 0 && <Callout tone="error">Corrija os {validation.errors} erros de validação antes de enviar o modelo.</Callout>}
        <Button variant="primary" icon={s.busy ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />} disabled={disabled || pending || uncertain || !compatible.includes(engine) || validation.errors > 0 || (runType === 'annual' && !weatherId)}
          onClick={() => { setDownloadLinks({}); void s.start(engine, runType, weatherId); }}>Enviar modelo e simular</Button>
      </section>}
      {!pending && <details><summary className="cursor-pointer text-sm font-medium text-brand-700">Acompanhar uma simulação pelo ID</summary><div className="mt-2 flex items-end gap-2">
        <Field label="ID da simulação"><input className="input" value={trackId} onChange={e => setTrackId(e.target.value)} placeholder="sim_…" /></Field>
        <Button disabled={disabled || !trackId.trim()} onClick={() => { setDownloadLinks({}); void s.track(trackId.trim()); }}>Consultar simulação</Button>
      </div></details>}
      {s.phase && <p role="status" className="text-sm text-brand-700">{s.phase}</p>}
      {uncertain && <Callout tone="info">O modelo já foi enviado. Retome a mesma solicitação para evitar simulações duplicadas.
        <Button className="ml-2" disabled={disabled} onClick={() => void s.retry()}>Retomar solicitação</Button>
        {s.canRestart && <Button className="ml-2" disabled={disabled} onClick={s.discardRejected}>Preparar nova solicitação</Button>}
      </Callout>}
      {s.simulation && <section className="space-y-3 rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3"><h3 role="status" className="font-semibold">{STATUS[s.simulation.status] ?? s.simulation.status}</h3>
          <Button size="sm" icon={<RefreshCw size={14} />} disabled={disabled} onClick={() => void s.refresh()}>Atualizar status</Button>
          {pending && <Button size="sm" variant="danger" icon={<Square size={14} />} disabled={disabled} onClick={() => void s.cancel()}>Cancelar simulação</Button>}
        </div>
        <p className="break-all text-xs text-slate-500">{s.simulation.id} · {s.attempt?.fileName}{s.attempt ? ` · cópia enviada ${new Date(s.attempt.sentAt).toLocaleString('pt-BR')}` : ''}</p>
        <p className="text-xs text-slate-500">{pending ? 'Você pode fechar este painel e continuar editando. A execução continua no servidor.' : 'Esta execução foi encerrada. Os dados abaixo pertencem à cópia enviada.'}</p>
        {s.simulation.failure_reason && <Callout tone="error">{s.simulation.failure_reason}</Callout>}
        {result && <div className="space-y-3">
          {result.run_type === 'design_day' && <Callout tone="info">Dias de projeto não representam consumo anual. Energia e conforto podem aparecer zerados.</Callout>}
          <h4 className="font-medium">Resultados</h4>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Indicador</th><th>Valor</th><th>Unidade</th></tr></thead><tbody>
            {[...result.building_area, ...result.comfort, ...result.peak_demand.map(r => ({ ...r, name: `Pico · ${rotuloDeRecurso(r.resource)}` })),
              ...result.end_uses.flatMap(u => u.resources.map(r => ({ ...r, name: `${rotuloDeUsoFinal(u.category)} · ${rotuloDeRecurso(r.resource)}` })))].map((r, i) =>
              <tr key={i} className="border-t border-slate-100"><td className="py-2 pr-3">{rotuloDoResumo(r.name)}</td><td className="pr-3 tabular-nums">{fmt(r.value, 2)}</td><td>{r.units}</td></tr>)}
          </tbody></table></div>
        </div>}
        {s.diagnostics && <details open={s.simulation.status !== 'succeeded'}><summary className="cursor-pointer font-medium">Diagnóstico do EnergyPlus</summary>
          {!s.diagnostics.available && <p className="text-sm">Diagnóstico ainda indisponível.</p>}
          {s.diagnostics.verdict && <p className="text-sm">{s.diagnostics.verdict.severe_errors} erros graves · {s.diagnostics.verdict.warnings} avisos · {s.diagnostics.verdict.elapsed}</p>}
          {s.diagnostics.fatal && <p className="text-sm text-red-700">{s.diagnostics.fatal}</p>}
          <ul className="max-h-64 space-y-2 overflow-auto text-xs">{s.diagnostics.entries?.map((e, i) => <li key={i} className="rounded bg-slate-50 p-2"><strong>{e.severity}</strong>: {e.message}{e.details?.map((d, j) => <p key={j}>{d}</p>)}{e.remedy && <p>{e.remedy}</p>}</li>)}</ul>
          {s.diagnostics.truncated && <p className="text-xs">Lista parcial. Consulte o arquivo .err completo abaixo.</p>}
        </details>}
        {s.logs && <details><summary className="cursor-pointer font-medium">Eventos da execução ({s.logs.attempts} tentativa(s))</summary>
          <ul className="text-xs">{s.logs.events.map((e, i) => <li key={i}>{new Date(e.at).toLocaleString('pt-BR')} · {e.event}</li>)}</ul>
          {s.logs.err_tail && <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs">{s.logs.err_tail}</pre>}
        </details>}
        {s.artifacts && <div className="space-y-2"><h4 className="font-medium">Arquivos da execução</h4>
          {s.artifacts.itens.length === 0 && <p className="text-xs text-slate-500">Nenhum arquivo disponível para esta execução.</p>}
          {!s.artifacts.complete && <p className="text-xs text-amber-700">A lista de arquivos está incompleta. Atualize o status para consultar novamente.</p>}
          {s.artifacts.itens.map(a => <div key={a.name} className="flex flex-wrap items-center gap-2 text-sm"><span className="mr-auto break-all">{a.name} <span className="text-xs text-slate-500">({fmt(a.size_bytes / 1024, 1)} KB)</span></span>
            <Button size="sm" icon={<Download size={14} />} disabled={disabled} onClick={() => void perform(async () => {
              const { download_url } = await api().download(s.simulation!.id, a.name);
              const url = new URL(download_url); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Link de download inválido.');
              setDownloadLinks(prev => ({ ...prev, [a.name]: url.href }));
            })}>Gerar link</Button>
            {downloadLinks[a.name] && <a className="text-brand-700 underline" href={downloadLinks[a.name]} target="_blank" rel="noreferrer noopener">Baixar arquivo</a>}
          </div>)}
          <p className="text-xs text-slate-500">Os links expiram. Gere outro se necessário.</p>
        </div>}
      </section>}
    </div>
  </Dialog>;
}
