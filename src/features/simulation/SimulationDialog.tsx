import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BarChart3, Ban, Check, Download, Loader2, LogIn, MapPin, Play, RefreshCw, RotateCcw, Square, X } from 'lucide-react';
import { Button, Callout, Dialog, Field, cx, fmt } from '@/ui/primitives';
import { useDocumentStore } from '@/store/documentStore';
import { useUiStore } from '@/store/uiStore';
import { useValidation } from '@/hooks/useValidation';
import {
  climaMaisProximo, etapasDaExecucao, localDoModelo, motoresCompativeis, motorPreferido, pontoDeBusca,
  type Etapa,
} from '@/core/simulation/acompanhamento';
import { SimulationApi, terminal, type Weather } from './api';
import { useSimulationStore } from './simulationStore';
import { useAuthStore } from '@/features/auth/authStore';

const STATUS: Record<string, string> = { queued: 'Na fila', running: 'Simulando', succeeded: 'Concluída', failed: 'Falhou', cancelled: 'Cancelada', timeout: 'Tempo limite excedido' };
/** Raio da busca de clima em volta do modelo. O mesmo padrão do serviço. */
const RAIO_KM = 100;

/**
 * Duas vistas (T028). **Configurar:** conecta sozinho ao abrir e já traz o motor compatível e o
 * clima mais próximo do modelo escolhidos — o usuário só confere e clica em Simular.
 * **Acompanhar:** a linha do tempo da execução e, no fim, "Analisar resultados" ou o
 * diagnóstico da falha.
 */
export function SimulationDialog() {
  const s = useSimulationStore();
  const sessao = useAuthStore(state => state.estado);
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
  const [connected, setConnected] = useState(false);
  /**
   * "Nova simulação" só troca a vista: a execução anterior continua no store — e no modo
   * Resultados — até outra começar, porque `start` é quem a substitui. Fechar o diálogo sem
   * simular não apaga o que o usuário estava analisando.
   */
  const [formulario, setFormulario] = useState(false);
  /** Resultado da busca automática de clima: achou, não achou ou não havia local no modelo. */
  const [climaAuto, setClimaAuto] = useState<'achado' | 'nenhum' | 'sem-local' | 'falhou'>();
  const [downloadLinks, setDownloadLinks] = useState<Record<string, string>>({});
  const modelVersion = String(Object.values(doc.Version ?? {})[0]?.version_identifier ?? '');
  const local = useMemo(() => localDoModelo(doc), [doc]);
  const compatible = motoresCompativeis(engines, modelVersion);
  const pending = !!s.simulation && !terminal(s.simulation.status);
  const uncertain = !!s.attempt && !s.simulation;
  const acompanhando = (!!s.simulation || !!s.attempt || !!s.phase) && !formulario;
  const disabled = working || s.busy;
  const selected = weather.find(w => w.id === weatherId);
  // Sem chave: o proxy a injeta do ambiente (T027). A interface nunca vê a credencial.
  const api = () => new SimulationApi();
  const perform = async (action: () => Promise<void>) => {
    if (working) return;
    setWorking(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setWorking(false); }
  };
  const connect = () => perform(async () => {
    const data = await api().engines();
    const versions = data.engines.map(e => e.version);
    setEngines(versions);
    setEngine(motorPreferido(versions, data.default, modelVersion));
    setConnected(true);
    if (s.simulation) await s.refresh();
    if (!local) { setClimaAuto('sem-local'); return; }
    // A busca de clima falhar não desfaz a conexão: o motor já foi escolhido, e a busca manual e
    // o envio de EPW continuam disponíveis — por isso o erro fica só no bloco do clima.
    let perto: { itens: Weather[] };
    try { perto = await api().weatherNear(pontoDeBusca(local), RAIO_KM); }
    catch (e) { setClimaAuto('falhou'); setError(`Não foi possível buscar o clima perto do modelo: ${e instanceof Error ? e.message : String(e)}`); return; }
    const melhor = climaMaisProximo(perto.itens);
    setWeather(perto.itens);
    setWeatherId(melhor?.id ?? '');
    setClimaAuto(melhor ? 'achado' : 'nenhum');
  });
  // Conecta uma vez por abertura: a lista de motores e o clima não mudam enquanto o diálogo
  // está aberto, e o botão "Tentar de novo" cobre a falha.
  const tentou = useRef(false);
  useEffect(() => {
    // Fechar volta à vista de acompanhamento: uma execução aberta por outro caminho (pelo ID,
    // no modo Resultados) não pode ficar escondida atrás do formulário na próxima abertura.
    if (!s.open) { tentou.current = false; setFormulario(false); return; }
    // Sem sessão não há o que conectar (T032). Quando a pessoa entra, com o diálogo ainda aberto
    // atrás da tela de login, a conexão acontece aqui.
    if (sessao !== 'autenticado') { tentou.current = false; setConnected(false); setEngines([]); return; }
    if (tentou.current) return;
    tentou.current = true;
    void connect();
  }, [s.open, sessao]);
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
  const analisar = () => { s.setOpen(false); useUiStore.getState().setMode('results'); };
  const etapas = etapasDaExecucao({
    enviando: !!s.phase, tentativa: !!s.attempt, status: s.simulation?.status,
    resultadosProntos: !!s.simulation && s.resultadosDe === s.simulation.id,
  });
  const concluida = s.simulation?.status === 'succeeded' && s.resultadosDe === s.simulation.id;
  const semSucesso = !!s.simulation && terminal(s.simulation.status) && s.simulation.status !== 'succeeded';

  return <Dialog open={s.open} onClose={() => s.setOpen(false)} title={acompanhando ? 'Acompanhar simulação' : 'Simular modelo'} icon={<Play size={18} />} size="xl">
    {sessao !== 'autenticado' ? <div className="space-y-4">
      {sessao === 'verificando'
        ? <p role="status" className="flex items-center gap-2 text-sm text-brand-700"><Loader2 className="animate-spin" size={16} /> Verificando sua sessão…</p>
        : <>
          <p className="text-sm text-slate-600">Para simular, entre com o e-mail e a senha da sua conta. A simulação, o modelo enviado e os resultados ficam na sua organização.</p>
          <Button variant="primary" icon={<LogIn size={16} />} onClick={() => useAuthStore.getState().abrirLogin()}>Entrar</Button>
          <p className="text-xs text-slate-500">O arquivo continua disponível em Baixar, sem conta.</p>
        </>}
    </div> : <div className="space-y-5">
      {(error || s.error) && <Callout tone="error">{error || s.error}
        {!connected && !working && <Button size="sm" className="ml-2" onClick={() => void connect()}>Tentar de novo</Button>}
      </Callout>}

      {!acompanhando && <>
        <p className="text-sm text-slate-600">Envia uma cópia do modelo atual para <strong>homolog.ee.dev.br</strong>. Você pode continuar editando; os resultados pertencem à cópia enviada.</p>
        {working && !connected && <p role="status" className="flex items-center gap-2 text-sm text-brand-700"><Loader2 className="animate-spin" size={16} /> Conectando ao serviço de simulação…</p>}
        {connected && <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`EnergyPlus (modelo ${modelVersion || 'sem versão'})`}>
              <select className="input" value={engine} onChange={e => setEngine(e.target.value)} disabled={disabled}>
                <option value="">Selecione o motor</option>{compatible.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Período da simulação">
              <select className="input" value={runType} onChange={e => setRunType(e.target.value as typeof runType)} disabled={disabled}>
                <option value="annual">Período climático do modelo (com EPW)</option><option value="design_day">Somente dias de projeto</option>
              </select>
            </Field>
          </div>
          {!compatible.length && <Callout tone="warning">O serviço não oferece um motor compatível com a versão deste modelo.</Callout>}
          {runType === 'annual' && <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold">Arquivo climático</h3>
            {selected ? <p className="flex items-start gap-2 text-sm"><MapPin size={16} className="mt-0.5 shrink-0 text-brand-600" />
              <span><strong>{selected.city} · {selected.region}</strong> · estação {selected.station} · {selected.source}
                {typeof selected.distance_km === 'number' && local && <span className="text-slate-500"> — a {fmt(selected.distance_km, 1)} km de {local.nome}</span>}</span></p>
              : climaAuto === 'nenhum' && local ? <Callout tone="warning">Nenhum arquivo climático do catálogo a até {RAIO_KM} km de {local.nome}. Envie o EPW do projeto ou busque outra cidade.</Callout>
              : climaAuto === 'sem-local' ? <Callout tone="info">O modelo não tem local (Site:Location) com coordenadas. Busque a cidade ou envie o EPW.</Callout>
              : climaAuto === 'falhou' ? <Callout tone="warning">A busca automática do clima falhou. Busque a cidade ou envie o EPW.</Callout>
              : null}
            <details open={!selected && !!climaAuto}><summary className="cursor-pointer text-sm font-medium text-brand-700">{selected ? 'Trocar o clima' : 'Buscar ou enviar um clima'}</summary><div className="mt-3 space-y-3">
              <div className="flex items-end gap-2"><Field label="Buscar cidade"><input className="input" value={city} onChange={e => { setCity(e.target.value); setCursor(null); }} placeholder="Florianopolis" /></Field>
                <Button disabled={disabled} onClick={() => void search()}>Buscar</Button></div>
              {weather.length > 0 && <Field label="Estação / arquivo EPW"><select className="input" value={weatherId} onChange={e => setWeatherId(e.target.value)} disabled={disabled}>
                <option value="">Selecione um clima</option>{weather.map(w => <option key={w.id} value={w.id}>{w.city} · {w.region} · estação {w.station} · {w.source}</option>)}
              </select></Field>}
              {cursor && <Button size="sm" disabled={disabled} onClick={() => void search(true)}>Mais estações</Button>}
              <div className="space-y-2 border-t border-slate-100 pt-3"><p className="text-sm font-medium">Enviar meu arquivo EPW</p>
                <Field label="Arquivo EPW"><input type="file" accept=".epw" disabled={disabled} onChange={e => setFile(e.target.files?.[0])} /></Field>
                <Field label="Licença do arquivo"><input className="input" maxLength={60} value={license} onChange={e => setLicense(e.target.value)} placeholder="Informe a licença ou autorização de uso" /></Field>
                <Button disabled={disabled || !file || !license.trim()} onClick={() => void upload()}>Enviar EPW</Button>
              </div>
            </div></details>
          </div>}
          {validation.errors > 0 && <Callout tone="error">Corrija os {validation.errors} erros de validação antes de simular.</Callout>}
          <Button variant="primary" size="lg" icon={<Play size={16} />} disabled={disabled || !compatible.includes(engine) || validation.errors > 0 || (runType === 'annual' && !weatherId)}
            onClick={() => { setDownloadLinks({}); setFormulario(false); void s.start(engine, runType, weatherId); }}>Simular</Button>
        </section>}
        <details><summary className="cursor-pointer text-sm font-medium text-brand-700">Acompanhar uma simulação pelo ID</summary><div className="mt-2 flex items-end gap-2">
          <Field label="ID da simulação"><input className="input" value={trackId} onChange={e => setTrackId(e.target.value)} placeholder="sim_…" /></Field>
          <Button disabled={disabled || !trackId.trim()} onClick={() => { setDownloadLinks({}); setFormulario(false); void s.track(trackId.trim()); }}>Consultar simulação</Button>
        </div></details>
      </>}

      {acompanhando && <section className="space-y-4">
        <LinhaDoTempo etapas={etapas} />
        <p role="status" className="text-sm font-medium text-slate-700">
          {s.phase ?? (s.simulation ? (s.simulation.status === 'succeeded' && !concluida ? 'Concluída — consultando os resultados…' : STATUS[s.simulation.status] ?? s.simulation.status) : 'O pedido não teve resposta.')}
        </p>
        {s.simulation && <p className="break-all text-xs text-slate-500">{s.simulation.id}{s.attempt ? ` · ${s.attempt.fileName} · cópia enviada ${new Date(s.attempt.sentAt).toLocaleString('pt-BR')}` : ''}</p>}

        {pending && <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-xs text-slate-500">Você pode fechar e continuar editando. A execução continua no servidor, e este painel volta a acompanhá-la.</p>
          <Button size="sm" icon={<RefreshCw size={14} />} disabled={disabled} onClick={() => void s.refresh()}>Atualizar</Button>
          <Button size="sm" variant="danger" icon={<Square size={14} />} disabled={disabled} onClick={() => void s.cancel()}>Cancelar simulação</Button>
        </div>}

        {uncertain && !s.phase && <Callout tone="info">O modelo já foi enviado. Retome a mesma solicitação para evitar simulações duplicadas.
          <Button className="ml-2" disabled={disabled} onClick={() => void s.retry()}>Retomar solicitação</Button>
          {s.canRestart && <Button className="ml-2" disabled={disabled} onClick={s.discardRejected}>Preparar nova solicitação</Button>}
        </Callout>}

        {concluida && <div className="space-y-3 rounded-xl bg-brand-50 p-4">
          <p className="text-sm text-slate-700">
            {s.simulation!.run_type === 'design_day'
              ? 'Simulação concluída. Dias de projeto não representam o ano: consumo e conforto anuais não se aplicam.'
              : `Simulação concluída${s.simulation!.duration_seconds ? ` em ${fmt(s.simulation!.duration_seconds, 0)} s` : ''}. Os resultados estão prontos para análise.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" icon={<BarChart3 size={16} />} onClick={analisar}>Analisar resultados</Button>
            <Button icon={<RotateCcw size={14} />} disabled={disabled} onClick={() => setFormulario(true)}>Nova simulação</Button>
          </div>
        </div>}

        {semSucesso && <div className="space-y-3">
          <Callout tone={s.simulation!.status === 'cancelled' ? 'warning' : 'error'}>
            {s.simulation!.failure_reason ?? (s.simulation!.status === 'cancelled' ? 'A simulação foi cancelada.' : 'A simulação não terminou. Veja o diagnóstico abaixo.')}
          </Callout>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<ArrowLeft size={14} />} onClick={() => s.setOpen(false)}>Ajustar o modelo</Button>
            <Button icon={<RotateCcw size={14} />} disabled={disabled} onClick={() => setFormulario(true)}>Nova simulação</Button>
          </div>
        </div>}

        {s.diagnostics && <details open={semSucesso}><summary className="cursor-pointer font-medium">Diagnóstico do EnergyPlus</summary>
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
        {s.artifacts && s.artifacts.itens.length > 0 && <details><summary className="cursor-pointer font-medium">Arquivos da execução ({s.artifacts.itens.length})</summary><div className="mt-2 space-y-2">
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
        </div></details>}
      </section>}
    </div>}
  </Dialog>;
}

const MARCA: Record<Etapa['estado'], string> = {
  feita: 'border-brand-600 bg-brand-600 text-white',
  atual: 'border-brand-600 bg-white text-brand-700',
  pendente: 'border-slate-300 bg-white text-slate-400',
  falhou: 'border-red-600 bg-red-600 text-white',
  interrompida: 'border-amber-500 bg-amber-500 text-white',
};
const LEITURA: Record<Etapa['estado'], string> = { feita: 'concluída', atual: 'em andamento', pendente: 'a seguir', falhou: 'falhou', interrompida: 'interrompida' };

function LinhaDoTempo({ etapas }: { etapas: Etapa[] }) {
  return <ol className="grid grid-cols-4 gap-2" aria-label="Etapas da simulação">
    {etapas.map((e, i) => <li key={e.id} className="flex flex-col items-center gap-1 text-center" aria-current={e.estado === 'atual' ? 'step' : undefined}>
      <div className="flex w-full items-center">
        <span className={cx('h-0.5 flex-1', i === 0 ? 'invisible' : e.estado === 'pendente' ? 'bg-slate-200' : 'bg-brand-600')} />
        <span className={cx('flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold', MARCA[e.estado])}>
          {e.estado === 'feita' ? <Check size={16} /> : e.estado === 'atual' ? <Loader2 size={16} className="animate-spin" />
            : e.estado === 'falhou' ? <X size={16} /> : e.estado === 'interrompida' ? <Ban size={14} /> : i + 1}
        </span>
        <span className={cx('h-0.5 flex-1', i === etapas.length - 1 ? 'invisible' : etapas[i + 1].estado === 'pendente' ? 'bg-slate-200' : 'bg-brand-600')} />
      </div>
      <span className={cx('text-xs', e.estado === 'pendente' ? 'text-slate-400' : 'font-medium text-slate-700')}>{e.titulo}</span>
      <span className="sr-only">{LEITURA[e.estado]}</span>
    </li>)}
  </ol>;
}
