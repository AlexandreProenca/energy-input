import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BarChart3, Box, Play, Download, Loader2, Redo2, RotateCcw, Sparkles, TriangleAlert, Undo2, Wrench, Zap } from 'lucide-react';
import { useSchemaStore } from '@/store/schemaStore';
import { useUiStore, type AppMode } from '@/store/uiStore';
import { useWizardStore } from '@/store/wizardStore';
import { useDocumentStore } from '@/store/documentStore';
import { restoreSnapshot, startAutosave } from '@/store/persistence';
import { resetProject } from '@/store/resetProject';
import { defaultAnswers } from '@/generators/answers';
import { exportCurrentDocument } from '@/lib/exportDocument';
import { Button, Dialog, IconButton, Segmented } from '@/ui/primitives';
import { Toasts } from '@/ui/Toasts';
import { WizardShell } from '@/features/wizard/WizardShell';
import { useSimulationStore } from '@/features/simulation/simulationStore';
import { ConflictDialog } from '@/features/wizard/ConflictDialog';

const SimulationDialog = lazy(() => import('@/features/simulation/SimulationDialog').then(m => ({ default: m.SimulationDialog })));
const ExpertShell = lazy(() => import('@/features/expert/ExpertShell'));
const GeometryEditor = lazy(() => import('@/features/geometry/GeometryEditor'));
const ResultsShell = lazy(() => import('@/features/results/ResultsShell'));

/** Cada modo carregado sob demanda, exceto o assistente, que é a tela inicial. */
const MODOS: Partial<Record<AppMode, (revision: number) => JSX.Element>> = {
  geometry: (revision) => <GeometryEditor key={revision} />,
  expert: (revision) => <ExpertShell key={revision} />,
  results: (revision) => <ResultsShell key={revision} />,
};

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
        <Zap size={20} className="fill-sun-400 text-sun-400" />
      </div>
      <div className="hidden leading-tight sm:block">
        <p className="text-sm font-bold text-slate-900">Energy Input</p>
        <p className="text-[11px] text-slate-500">Arquivos epJSON para EnergyPlus</p>
      </div>
    </div>
  );
}

function Header() {
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  const canUndo = useDocumentStore((s) => s.past.length > 0);
  const canRedo = useDocumentStore((s) => s.future.length > 0);
  const version = useSchemaStore((s) => s.version);
  const origin = useDocumentStore((s) => s.origin);
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-2 px-4 sm:gap-3">
        <Logo />
        <div className="mx-auto">
          <Segmented
            ariaLabel="Modo do aplicativo"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'basic', label: <span className="hidden sm:inline">Assistente</span>, icon: <Sparkles size={15} /> },
              { value: 'geometry', label: <span className="hidden sm:inline">Editor 3D</span>, icon: <Box size={15} /> },
              { value: 'expert', label: <span className="hidden sm:inline">Especialista</span>, icon: <Wrench size={15} /> },
              { value: 'results', label: <span className="hidden sm:inline">Resultados</span>, icon: <BarChart3 size={15} /> },
            ]}
          />
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Desfazer (Ctrl+Z)" disabled={!canUndo} onClick={() => useDocumentStore.getState().undo()}>
            <Undo2 size={17} />
          </IconButton>
          <IconButton label="Refazer (Ctrl+Shift+Z)" className="hidden sm:inline-flex" disabled={!canRedo} onClick={() => useDocumentStore.getState().redo()}>
            <Redo2 size={17} />
          </IconButton>
          <IconButton label="Resetar edição" onClick={() => setResetOpen(true)}>
            <RotateCcw size={17} />
          </IconButton>
          <IconButton label="Simular modelo" onClick={() => useSimulationStore.getState().setOpen(true)}><Play size={17} /></IconButton>
          <Button variant="primary" size="sm" icon={<Download size={15} />} onClick={() => exportCurrentDocument()} className="ml-1" aria-label="Baixar arquivo .epJSON">
            <span className="hidden sm:inline">Baixar</span>
          </Button>
          {version && <span className="ml-2 hidden rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500 lg:inline">E+ {version}</span>}
        </div>
      </div>
      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        icon={<RotateCcw size={18} />}
        title={origin.kind === 'upload' ? 'Restaurar arquivo inicial?' : 'Voltar ao início do assistente?'}
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetProject();
                setResetOpen(false);
              }}
            >
              {origin.kind === 'upload' ? 'Restaurar arquivo' : 'Recomeçar assistente'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{origin.kind === 'upload'
          ? origin.recovered
            ? `Este projeto foi salvo antes do recurso de reset. Será restaurado o primeiro estado recuperado de ${origin.fileName}; o upload original não está disponível.`
            : `As edições serão descartadas e ${origin.fileName} voltará ao conteúdo original do upload.`
          : 'As edições serão descartadas e você voltará ao primeiro passo do assistente, com as respostas padrão.'} Baixe o arquivo antes, se quiser guardar as alterações. O histórico de desfazer também será limpo.</p>
      </Dialog>
    </header>
  );
}

function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y') return;
      e.preventDefault();
      const ds = useDocumentStore.getState();
      if (e.key.toLowerCase() === 'y' || e.shiftKey) ds.redo();
      else ds.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const status = useSchemaStore((s) => s.status);
  const error = useSchemaStore((s) => s.error);
  const mode = useUiStore((s) => s.mode);
  const revision = useDocumentStore((s) => s.revision);
  const booted = useRef(false);
  useUndoShortcuts();

  useEffect(() => {
    void useSchemaStore.getState().load();
  }, []);

  useEffect(() => {
    if (status !== 'ready' || booted.current) return;
    booted.current = true;
    const restored = restoreSnapshot();
    if (restored) {
      useUiStore.getState().toast(`Projeto restaurado do navegador (salvo em ${new Date(restored).toLocaleString('pt-BR')}).`, 'info');
    } else {
      useWizardStore.getState().startFresh(defaultAnswers());
      useDocumentStore.setState({ past: [], future: [] });
    }
    startAutosave();
  }, [status]);

  if (status !== 'ready') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <Logo />
        {status === 'error' ? (
          <>
            <TriangleAlert className="text-red-500" size={32} />
            <p className="max-w-md text-sm text-slate-600">{error}</p>
            <Button variant="primary" onClick={() => void useSchemaStore.getState().load()}>
              Tentar novamente
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="animate-spin text-brand-600" size={32} />
            <p className="text-sm text-slate-500">Carregando o schema do EnergyPlus (858 tipos de objeto)…</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      {mode === 'basic' ? (
        <WizardShell key={revision} />
      ) : (
        <Suspense fallback={<div className="flex h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-brand-600" /></div>}>
          {/*
            Busca por modo, e não um encadeamento de ternários: com o ternário anterior,
            qualquer modo novo caía silenciosamente no ExpertShell — o `results` teria
            aberto o editor de objetos em vez do painel.
          */}
          {MODOS[mode]?.(revision) ?? <ExpertShell key={revision} />}
        </Suspense>
      )}
      <Suspense fallback={null}><SimulationDialog /></Suspense>
      <ConflictDialog />
      <Toasts />
    </div>
  );
}
