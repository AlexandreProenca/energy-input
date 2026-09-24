import { useState } from 'react';
import { BarChart3, CalendarClock, CircleSlash, Hourglass, Loader2, LogIn, Play, Search } from 'lucide-react';
import { isSimulationId } from '@/core/ids';
import { Button, Callout, Field } from '@/ui/primitives';
import { useSimulationStore } from '@/features/simulation/simulationStore';
import { useAuthStore } from '@/features/auth/authStore';
import { estadoDoPainel, semAnoCompleto } from './estado';
import { ConsumoPanel } from './panels/ConsumoPanel';
import { TemperaturaPanel } from './panels/TemperaturaPanel';
import { DesconfortoPanel } from './panels/DesconfortoPanel';

/**
 * Casca do modo Resultados.
 *
 * A navegação e os estados de exceção vieram na T006, antes dos painéis (T008, T010, T011),
 * de propósito: são eles que decidem o que o usuário vê quando **não** há gráfico para
 * mostrar, e adiá-los produziria três painéis cada um inventando o seu.
 */

const STATUS: Record<string, string> = {
  queued: 'na fila',
  running: 'em execução',
  succeeded: 'concluída',
  failed: 'falhou',
  cancelled: 'cancelada',
  timeout: 'expirou por tempo',
};

/** Estado vazio com um título, uma explicação e, quando cabe, uma ação. */
function Vazio({ icon, title, children, action }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">{icon}</div>
      <p className="text-base font-semibold text-slate-900">{title}</p>
      <div className="text-sm leading-relaxed text-slate-600">{children}</div>
      {action}
    </div>
  );
}

/**
 * Adoção de uma execução pelo identificador.
 *
 * Aparece tanto no estado vazio quanto ao lado de um resultado já aberto: sem a segunda,
 * quem adotasse uma execução ficaria preso a ela — não haveria como comparar com outra sem
 * recarregar a página.
 */
function ConsultarPorId({ compacto = false }: { compacto?: boolean }) {
  const [id, setId] = useState('');
  const busy = useSimulationStore((s) => s.busy);
  const valido = isSimulationId(id.trim());
  /**
   * Lê o valor de onde ele está no momento do evento, e não do fecho do render.
   * Digitação rápida (ou colagem) enfileira os `onChange` que o React ainda não aplicou, e
   * o `Enter` cairia num `id` desatualizado — a tecla não faria nada, sem erro nenhum.
   */
  const abrir = (valor: string) => {
    const limpo = valor.trim();
    if (isSimulationId(limpo) && !busy) void useSimulationStore.getState().track(limpo);
  };
  const campo = (
    <input
      className="input"
      placeholder="sim_…"
      value={id}
      onChange={(e) => setId(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') abrir(e.currentTarget.value); }}
      spellCheck={false}
      aria-label="Identificador da execução"
    />
  );
  return (
    <div className="flex w-full max-w-md items-end gap-2">
      {compacto ? <div className="min-w-0 flex-1">{campo}</div> : (
        <Field label="Consultar por identificador" hint="O painel abre o resultado de uma execução anterior, mesmo de outra sessão.">
          {campo}
        </Field>
      )}
      <Button variant="secondary" disabled={!valido || busy} onClick={() => abrir(id)}>
        <Search size={15} /> Abrir
      </Button>
    </div>
  );
}

export default function ResultsShell() {
  const simulation = useSimulationStore((s) => s.simulation);
  const summary = useSimulationStore((s) => s.summary);
  const sessao = useAuthStore((s) => s.estado);

  const estado = estadoDoPainel(simulation);

  // 0. Sem sessão (T032): os resultados são da organização de quem entrou.
  if (sessao !== 'autenticado') {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-6">
        <Vazio icon={sessao === 'verificando' ? <Loader2 size={22} className="animate-spin" /> : <LogIn size={22} />} title={sessao === 'verificando' ? 'Verificando sua sessão…' : 'Entre para ver resultados'}>
          {sessao === 'anonimo' && <>
            As simulações e os resultados ficam na sua organização, no serviço de simulação.
            <div className="mt-5 flex justify-center">
              <Button variant="primary" onClick={() => useAuthStore.getState().abrirLogin()}><LogIn size={15} /> Entrar</Button>
            </div>
          </>}
        </Vazio>
      </div>
    );
  }

  // 1. Nenhuma execução nesta sessão.
  if (estado === 'sem-execucao' || !simulation) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-6">
        <Vazio icon={<BarChart3 size={22} />} title="Nenhum resultado para mostrar ainda">
          Os gráficos são desenhados a partir de uma simulação concluída. Rode o modelo, ou
          abra uma execução anterior pelo identificador.
          <div className="mt-5 flex flex-col items-center gap-4">
            <Button onClick={() => useSimulationStore.getState().setOpen(true)}>
              <Play size={15} /> Simular modelo
            </Button>
            <ConsultarPorId />
          </div>
        </Vazio>
      </div>
    );
  }

  // 2. Execução em andamento — o painel não tem o que desenhar, mas também não é erro.
  if (estado === 'em-andamento') {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-6">
        <Vazio icon={<Hourglass size={22} />} title={`A simulação está ${STATUS[simulation.status] ?? simulation.status}`}>
          Os resultados aparecem aqui quando ela terminar. O acompanhamento continua mesmo
          com este painel fechado.
        </Vazio>
      </div>
    );
  }

  // 3. Terminou sem sucesso: o diagnóstico vive no diálogo de simulação, não aqui.
  if (estado === 'sem-sucesso') {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-6">
        <Vazio
          icon={<CircleSlash size={22} />}
          title={`A simulação ${STATUS[simulation.status] ?? simulation.status}`}
          action={
            <div className="flex flex-col items-center gap-4">
              <Button variant="secondary" onClick={() => useSimulationStore.getState().setOpen(true)}>
                Ver diagnóstico
              </Button>
              <ConsultarPorId />
            </div>
          }
        >
          {simulation.failure_reason
            ? <>O serviço informou: <span className="font-medium">{simulation.failure_reason}</span></>
            : 'O serviço não informou o motivo.'}
        </Vazio>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Resultados</h1>
          <p className="text-xs text-slate-500">
            Execução <span className="font-mono">{simulation.id}</span> · motor {simulation.engine_version}
          </p>
        </div>
        <ConsultarPorId compacto />
      </div>

      {/*
        Dias de projeto simulam duas datas extremas, não o ano. Consumo anual e horas de
        desconforto não existem — e desenhá-los como zero seria pior que não desenhar.
        O aviso repete o que o diálogo de simulação já diz, de propósito: quem chega aqui
        direto pelo modo Resultados não passou por lá.
      */}
      {semAnoCompleto(simulation) && (
        <Callout tone="warning" icon={<CalendarClock size={18} />} title="Execução em dias de projeto">
          Dias de projeto dimensionam o sistema em duas datas extremas; eles não representam o
          ano. Consumo anual e horas de desconforto só fazem sentido numa execução climática
          (<span className="font-medium">annual</span>).
        </Callout>
      )}

      <ConsumoPanel simulation={simulation} summary={summary} />

      <TemperaturaPanel simulation={simulation} />

      <DesconfortoPanel simulation={simulation} summary={summary} />
    </div>
  );
}
