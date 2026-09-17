import { lazy, Suspense, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Code2, Eye, Info, Loader2, TriangleAlert, Wrench } from 'lucide-react';
import { clsx } from 'clsx';
import { WIZARD_STEPS } from '@/generators/answers';
import { useUiStore } from '@/store/uiStore';
import { useWizardStore } from '@/store/wizardStore';
import { useDocumentStore } from '@/store/documentStore';
import { countObjects } from '@/core/epjson/document';
import { useValidation } from '@/hooks/useValidation';
import { Button, Callout } from '@/ui/primitives';
import { STEP_META } from './steps';
import { ProjectStep } from './steps/ProjectStep';
import { LocationStep } from './steps/LocationStep';
import { RunPeriodStep } from './steps/RunPeriodStep';
import { GeometryStep } from './steps/GeometryStep';
import { EnvelopeStep } from './steps/EnvelopeStep';
import { WindowsStep } from './steps/WindowsStep';
import { LoadsStep } from './steps/LoadsStep';
import { HvacStep } from './steps/HvacStep';
import { OutputsStep } from './steps/OutputsStep';
import { ReviewStep } from './steps/ReviewStep';
import { JsonPreviewDialog } from './JsonPreviewDialog';

const Building3D = lazy(() => import('@/features/preview/Building3D'));

const STEP_COMPONENTS = {
  project: ProjectStep,
  location: LocationStep,
  runPeriod: RunPeriodStep,
  geometry: GeometryStep,
  envelope: EnvelopeStep,
  windows: WindowsStep,
  loads: LoadsStep,
  hvac: HvacStep,
  outputs: OutputsStep,
  review: ReviewStep,
};

export function WizardShell() {
  const step = useUiStore((s) => s.wizardStep);
  const visited = useUiStore((s) => s.visitedSteps);
  const goTo = useUiStore((s) => s.goToStep);
  const linked = useWizardStore((s) => s.linked);
  const startFresh = useWizardStore((s) => s.startFresh);
  const doc = useDocumentStore((s) => s.doc);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [cutaway, setCutaway] = useState(false);
  const validation = useValidation();

  const idx = WIZARD_STEPS.indexOf(step);
  const meta = STEP_META[idx];
  const StepComponent = STEP_COMPONENTS[step];
  const Icon = meta.icon;

  const go = (i: number) => {
    goTo(WIZARD_STEPS[i]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-4 xl:flex-row xl:gap-6 xl:py-6">
      {/* Step list */}
      <nav aria-label="Etapas do assistente" className="xl:w-56 xl:shrink-0">
        <ol className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 xl:sticky xl:top-20 xl:mx-0 xl:flex-col xl:overflow-visible xl:px-0">
          {STEP_META.map((s, i) => {
            const StepIcon = s.icon;
            const active = s.id === step;
            const done = visited.includes(s.id) && !active;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={active ? 'step' : undefined}
                  className={clsx(
                    'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition',
                    active ? 'bg-brand-600 text-white shadow-md' : 'text-slate-600 hover:bg-white hover:shadow-sm',
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      active ? 'bg-white/20' : done ? 'bg-brand-100 text-brand-700' : 'bg-slate-200/70 text-slate-500',
                    )}
                  >
                    {done ? <Check size={15} strokeWidth={3} /> : <StepIcon size={15} />}
                  </span>
                  <span className="whitespace-nowrap font-medium">
                    <span className={clsx('mr-1 text-xs', active ? 'text-white/70' : 'text-slate-400')}>{i + 1}.</span>
                    <span className="xl:hidden">{s.short}</span>
                    <span className="hidden xl:inline">{s.title}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
      {/* Question */}
      <main className="min-w-0 flex-1">
        {!linked && (
          <div className="mb-4">
            <Callout tone="warning" icon={<TriangleAlert size={18} />} title="O arquivo aberto não foi criado pelo assistente">
              <p>As respostas abaixo não estão ligadas ao documento atual. Para usar o assistente, comece um novo projeto — o documento atual será substituído (você pode desfazer).</p>
              <Button className="mt-2" variant="primary" size="sm" onClick={() => startFresh()}>
                Começar novo projeto com o assistente
              </Button>
            </Callout>
          </div>
        )}
        <section className="card overflow-hidden">
          <header className="flex items-start gap-4 border-b border-slate-100 bg-gradient-to-r from-brand-50 to-white px-5 py-5 sm:px-7">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md">
              <Icon size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                Etapa {idx + 1} de {STEP_META.length} · {meta.title}
              </p>
              <h1 className="mt-0.5 text-xl font-semibold text-slate-900 sm:text-2xl">{meta.question}</h1>
            </div>
          </header>
          <div className="px-5 py-6 sm:px-7">
            <StepComponent />
          </div>
          <footer className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-7">
            <Button variant="ghost" icon={<ArrowLeft size={16} />} disabled={idx === 0} onClick={() => go(idx - 1)}>
              Voltar
            </Button>
            <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 sm:mx-6 sm:block">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${((idx + 1) / STEP_META.length) * 100}%` }} />
            </div>
            {idx < STEP_META.length - 1 ? (
              <Button variant="primary" onClick={() => go(idx + 1)}>
                Próximo <ArrowRight size={16} />
              </Button>
            ) : (
              <span className="text-sm text-slate-500">Última etapa</span>
            )}
          </footer>
        </section>
      </main>

      {/* Live preview */}
      <aside className="lg:w-[320px] lg:shrink-0 2xl:w-[360px]">
        <div className="card space-y-4 p-4 lg:sticky lg:top-20">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Eye size={16} className="text-brand-600" /> Pré-visualização
            </h2>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" className="accent-brand-600" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} />
              Transparente
            </label>
          </div>
          <Suspense fallback={<div className="flex h-[260px] items-center justify-center rounded-xl bg-slate-100 text-slate-400"><Loader2 className="animate-spin" /></div>}>
            <Building3D doc={doc} height={260} cutaway={cutaway} />
          </Suspense>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              {validation.pending ? (
                <Loader2 size={18} className="animate-spin text-slate-400" />
              ) : validation.errors === 0 ? (
                <CheckCircle2 size={18} className="text-brand-600" />
              ) : (
                <TriangleAlert size={18} className="text-red-500" />
              )}
              <div className="text-sm">
                <p className="font-medium text-slate-800">
                  {validation.errors === 0 ? 'Arquivo válido e pronto para simular' : `${validation.errors} erro(s) de validação`}
                </p>
                <p className="text-xs text-slate-500">
                  {countObjects(doc)} objetos EnergyPlus{validation.warnings > 0 && ` · ${validation.warnings} aviso(s)`}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" icon={<Code2 size={14} />} onClick={() => setJsonOpen(true)}>
                Ver epJSON
              </Button>
              <Button size="sm" variant="ghost" icon={<Wrench size={14} />} onClick={() => useUiStore.getState().setMode('expert')}>
                Modo especialista
              </Button>
            </div>
          </div>
          <p className="flex gap-2 text-xs leading-relaxed text-slate-500">
            <Info size={14} className="mt-0.5 shrink-0 text-brand-600" />
            Todas as respostas já começam com um valor padrão: o arquivo é válido desde a primeira etapa.
          </p>
        </div>
      </aside>
      </div>
      <JsonPreviewDialog open={jsonOpen} onClose={() => setJsonOpen(false)} />
    </div>
  );
}
