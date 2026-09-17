import { lazy, Suspense, useEffect, useMemo } from 'react';
import { Box, Eye, Layers, Loader2, Maximize, MousePointerClick, Sparkles } from 'lucide-react';
import { useDocumentStore } from '@/store/documentStore';
import { useUiStore } from '@/store/uiStore';
import { Button, Segmented } from '@/ui/primitives';
import { ElementTree } from './ElementTree';
import { OpeningPanel, SurfacePanel, ZonePanel } from './PropertiesPanel';
import { useGeometryUi } from './geometryStore';
import { useGeometryModel, zoneLevels } from './useGeometry';

const Scene3D = lazy(() => import('./Scene3D'));

export default function GeometryEditor() {
  const doc = useDocumentStore((s) => s.doc);
  const model = useGeometryModel();
  const { selection, select, showThickness, xray, levelZone, view, set, reframe } = useGeometryUi();
  const levels = useMemo(() => zoneLevels(model), [model]);

  // Drop selections that no longer exist (undo, rename, delete elsewhere).
  useEffect(() => {
    if (!selection) return;
    const exists = selection.kind === 'zone' ? model.zones.has(selection.name) : selection.kind === 'surface' ? model.surfaces.has(selection.name) : model.subsurfaces.has(selection.name);
    if (!exists) select(undefined);
  }, [model, selection, select]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest('input, select, textarea, [role="dialog"]')) select(undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select]);

  if (model.surfaces.size === 0) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Box size={28} />
        </div>
        <p className="max-w-sm text-sm text-slate-600">Este arquivo ainda não tem superfícies (BuildingSurface:Detailed). Crie a geometria pelo assistente e volte aqui para refiná-la.</p>
        <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => useUiStore.getState().setMode('basic')}>
          Ir para o assistente
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:h-[calc(100vh-4rem)] lg:flex-row">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block xl:w-72">
        <ElementTree model={model} />
      </aside>

      <div className="relative flex h-[55vh] min-w-0 shrink-0 flex-col bg-gradient-to-b from-sky-100 to-sky-50 lg:h-auto lg:flex-1 lg:shrink">
        <div className="absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center gap-2">
          <div className="rounded-lg bg-white/90 shadow-sm backdrop-blur">
            <Segmented
              size="sm"
              ariaLabel="Vista da câmera"
              value={view}
              onChange={(v) => {
                set({ view: v });
                reframe();
              }}
              options={[
                { value: 'perspective', label: '3D' },
                { value: 'top', label: 'Topo' },
                { value: 'south', label: 'Sul' },
                { value: 'east', label: 'Leste' },
              ]}
            />
          </div>
          <button type="button" onClick={reframe} title="Enquadrar tudo" className="flex h-8 items-center gap-1 rounded-lg bg-white/90 px-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-white">
            <Maximize size={14} /> Enquadrar
          </button>
          <label className="flex h-8 items-center gap-1.5 rounded-lg bg-white/90 px-2 text-xs text-slate-700 shadow-sm">
            <Layers size={14} />
            <select className="bg-transparent text-xs outline-none" value={levelZone ?? ''} onChange={(e) => set({ levelZone: e.target.value || undefined })} aria-label="Pavimentos visíveis">
              <option value="">Todos os pavimentos</option>
              {levels.map((l) => (
                <option key={l.name} value={l.name}>
                  Até {l.name} (sem cobertura)
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-8 items-center gap-1.5 rounded-lg bg-white/90 px-2 text-xs text-slate-700 shadow-sm">
            <input type="checkbox" className="accent-brand-600" checked={xray} onChange={(e) => set({ xray: e.target.checked })} />
            <Eye size={14} /> Transparente
          </label>
          <label className="flex h-8 items-center gap-1.5 rounded-lg bg-white/90 px-2 text-xs text-slate-700 shadow-sm">
            <input type="checkbox" className="accent-brand-600" checked={showThickness} onChange={(e) => set({ showThickness: e.target.checked })} />
            Espessuras
          </label>
        </div>
        <div className="min-h-0 flex-1">
          <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-brand-600" /></div>}>
            <Scene3D doc={doc} model={model} />
          </Suspense>
        </div>
        <p className="pointer-events-none absolute bottom-2 left-3 rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-slate-600">
          Clique para selecionar · arraste para girar · roda do mouse para zoom · Esc limpa a seleção
        </p>
      </div>

      <aside className="scrollbar-thin w-full shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4 lg:w-[380px] 2xl:w-[440px]">
        {selection?.kind === 'zone' && <ZonePanel model={model} zone={selection.name} />}
        {selection?.kind === 'surface' && <SurfacePanel key={selection.name} model={model} name={selection.name} />}
        {selection?.kind === 'opening' && <OpeningPanel key={selection.name} model={model} name={selection.name} />}
        {!selection && (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
            <MousePointerClick size={30} className="text-slate-300" />
            <p className="max-w-[260px] text-sm text-slate-600">Clique numa parede, piso, cobertura, janela ou porta no modelo 3D — ou escolha na lista — para editar suas propriedades.</p>
            <div className="w-full lg:hidden">
              <div className="h-72 rounded-xl border border-slate-200">
                <ElementTree model={model} />
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
