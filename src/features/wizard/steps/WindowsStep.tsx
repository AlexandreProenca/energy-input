import { useUiStore } from '@/store/uiStore';
import { SunMedium } from 'lucide-react';
import { templates } from '@/templates';
import type { Facade } from '@/generators/answers';
import { useWizardStore } from '@/store/wizardStore';
import { useGeneration } from '@/hooks/useGeneration';
import { Button, Callout, Field, Segmented, StatTile, fmt } from '@/ui/primitives';
import { SliderNumber } from '@/ui/NumberInput';
import { FacadeWwr, GlazingIllustration } from '../illustrations';
import { ChoiceCard, PropertyBar, SectionTitle, useStepAnswers } from './common';

const FACADES: { id: Facade; label: string }[] = [
  { id: 'north', label: 'Norte' },
  { id: 'east', label: 'Leste' },
  { id: 'south', label: 'Sul' },
  { id: 'west', label: 'Oeste' },
];

export function WindowsStep() {
  const [w, update] = useStepAnswers('windows');
  const geometry = useWizardStore((s) => s.answers.geometry);
  const northAxis = useWizardStore((s) => s.answers.project.northAxis);
  const { info } = useGeneration();
  const facadeArea = 2 * (geometry.width + geometry.depth) * geometry.floorHeight * geometry.floors;

  const wallSize = (f: Facade) => (f === 'north' || f === 'south' ? geometry.width : geometry.depth);

  return (
    <div className="space-y-8">
      <Callout>O modelo começa sem portas e janelas. No editor 3D, selecione uma parede para adicionar e dimensionar cada abertura.
        <Button className="mt-2" onClick={() => useUiStore.getState().setMode('geometry')}>Adicionar aberturas no editor 3D</Button>
      </Callout>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={w.automatic ?? false} onChange={e => update({ automatic: e.target.checked })} />Gerar janelas automaticamente por percentual (opcional)</label>
      {w.automatic && <>
      <div>
        <SectionTitle hint="Percentual da área de cada fachada ocupado por vidro (PAF, ou WWR em inglês).">Área de janelas</SectionTitle>
        <Segmented
          ariaLabel="Modo de definição das janelas"
          value={w.mode}
          onChange={(mode) => update(mode === 'perFacade' && w.mode === 'uniform' ? { mode, perFacade: { north: w.wwr, east: w.wwr, south: w.wwr, west: w.wwr } } : { mode })}
          options={[
            { value: 'uniform', label: 'Igual em todas as fachadas' },
            { value: 'perFacade', label: 'Diferente por fachada' },
          ]}
        />

        {w.mode === 'uniform' ? (
          <div className="mt-5 grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_220px]">
            <Field label="Percentual de janelas em cada fachada">
              <SliderNumber ariaLabel="Percentual de janelas" value={w.wwr} min={0} max={90} unit="%" onValue={(wwr) => update({ wwr })} />
            </Field>
            <div className="rounded-xl bg-slate-50 p-3">
              <FacadeWwr wwr={w.wwr} width={geometry.width} height={geometry.floorHeight} label={`${w.wwr}% de vidro`} />
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {FACADES.map((f) => (
              <div key={f.id} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 rounded-xl bg-slate-50 p-3">
                <FacadeWwr wwr={w.perFacade[f.id]} width={wallSize(f.id)} height={geometry.floorHeight} label={f.label} />
                <SliderNumber
                  ariaLabel={`Janelas na fachada ${f.label}`}
                  value={w.perFacade[f.id]}
                  min={0}
                  max={90}
                  unit="%"
                  onValue={(v) => update({ perFacade: { ...w.perFacade, [f.id]: v } })}
                />
              </div>
            ))}
            {northAxis !== 0 && (
              <p className="text-xs text-slate-500 sm:col-span-2">
                Os nomes das fachadas seguem os eixos do modelo. Com a rotação de {fmt(northAxis)}° definida na etapa 1, a fachada “Sul” fica voltada para outra direção.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile label="Área de vidro" value={fmt(info.totalWindowArea)} unit="m²" />
        <StatTile label="Área de fachadas" value={fmt(facadeArea, 0)} unit="m²" />
        <StatTile label="PAF efetivo" value={fmt(facadeArea ? (info.totalWindowArea / facadeArea) * 100 : 0)} unit="%" />
      </div>

      <div>
        <SectionTitle icon={<SunMedium size={16} />} hint="U: perda de calor pelo vidro (menor = isola mais). FS: calor do sol que entra (menor = esquenta menos). TV: luz que entra.">
          Tipo de vidro
        </SectionTitle>
        <div role="radiogroup" aria-label="Tipo de vidro" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {templates.glazing.map((g) => (
            <ChoiceCard
              key={g.id}
              selected={w.glazingId === g.id}
              onSelect={() => update({ glazingId: g.id })}
              media={<GlazingIllustration g={g} />}
              title={g.label}
              description={g.description}
              footer={
                <div className="space-y-1 border-t border-slate-100 pt-2">
                  <PropertyBar label="U" value={g.uFactor} max={6} display={`${fmt(g.uFactor)} W/m²K`} color="bg-sky-500" />
                  <PropertyBar label="Fator solar" value={g.shgc} max={1} display={fmt(g.shgc, 2)} color="bg-orange-400" />
                  <PropertyBar label="Luz (TV)" value={g.visibleTransmittance} max={1} display={fmt(g.visibleTransmittance, 2)} color="bg-yellow-400" />
                </div>
              }
            />
          ))}
        </div>
      </div>
      </>}
    </div>
  );
}
