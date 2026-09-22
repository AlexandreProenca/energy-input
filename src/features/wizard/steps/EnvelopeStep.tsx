import { useState } from 'react';
import { CheckCircle2, Info, Palette, TriangleAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { byId, templates } from '@/templates';
import type { AssemblyKind, MaterialDef } from '@/templates/constructions/types';
import { assemblyThermal, resolveAssemblies } from '@/generators/envelope';
import { checkRoof, checkWall } from '@/generators/nbr15575';
import { useWizardStore } from '@/store/wizardStore';
import { Badge, Field, HelpTip, Segmented, fmt } from '@/ui/primitives';
import { AssemblySection, GlazingIllustration } from '../illustrations';
import { ChoiceCard, SectionTitle, useStepAnswers } from './common';

const ASSEMBLY_LABEL: Record<AssemblyKind, string> = {
  wall: 'Parede externa',
  roof: 'Cobertura',
  groundFloor: 'Piso do térreo',
  interFloor: 'Laje entre pavimentos',
};

function LayerList({ kind, presetId }: { kind: AssemblyKind; presetId: string }) {
  const preset = byId(templates.constructionPresets, presetId);
  const env = useWizardStore((s) => s.answers.envelope);
  const geometry = useWizardStore((s) => s.answers.geometry);
  const assemblies = resolveAssemblies(preset, env.floorFinish);
  const a = kind === 'roof' && geometry.topFloor === 'adjacent'
    ? { label: 'Teto: laje do pavimento superior', layers: [...assemblies.interFloor.layers].reverse() }
    : kind === 'groundFloor' && geometry.groundFloor === 'adjacent' ? assemblies.interFloor : assemblies[kind];
  const adjacent = kind === 'groundFloor' && geometry.groundFloor === 'adjacent' || kind === 'roof' && geometry.topFloor === 'adjacent';
  const t = assemblyThermal(adjacent ? 'interFloor' : kind, a.layers, templates.materials);
  return (
    <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
      <div className="rounded-xl bg-white p-2 shadow-sm">
        <AssemblySection layers={a.layers} materials={templates.materials} orientation={kind === 'wall' ? 'vertical' : 'horizontal'} height={kind === 'wall' ? 130 : 100} />
      </div>
      <div>
        <p className="font-medium text-slate-800">{a.label}</p>
        <p className="mb-2 text-xs text-slate-500">{kind === 'wall' ? 'Camadas de fora para dentro' : kind === 'roof' ? 'Camadas de cima para baixo' : 'Camadas de baixo para cima'}</p>
        <ol className="space-y-1">
          {a.layers.map((l, i) => {
            const m: MaterialDef = templates.materials[l.material];
            return (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="h-3.5 w-3.5 shrink-0 rounded border border-slate-300" style={{ background: m.color }} />
                <span className="flex-1 text-slate-700">{m.label}</span>
                <span className="text-xs tabular-nums text-slate-500">
                  {m.kind === 'AirGap' ? `R ${fmt(m.thermalResistance, 2)}` : `${fmt((l.thickness ?? m.thickness) * 100, 1)} cm`}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="slate">U = {fmt(t.uValue, 2)} W/m²K</Badge>
          {t.thermalCapacity > 0 && <Badge tone="slate">CT = {t.thermalCapacity} kJ/m²K</Badge>}
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange, label }: { value: string; onChange: (id: string) => void; label: string }) {
  return (
    <Field label={label} help="A cor muda quanto do calor do sol a superfície absorve (absortância α). Cores claras esquentam menos.">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {templates.surfaceColors.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={value === c.id}
            onClick={() => onChange(c.id)}
            className={clsx('flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm transition', value === c.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300')}
          >
            <span className="h-6 w-6 rounded-full border border-slate-300 shadow-inner" style={{ background: c.swatch }} />
            <span className="text-left">
              <span className="block font-medium text-slate-800">{c.label}</span>
              <span className="block text-[11px] text-slate-500">α = {fmt(c.absorptance)}</span>
            </span>
          </button>
        ))}
      </div>
    </Field>
  );
}

export function EnvelopeStep() {
  const [env, update] = useStepAnswers('envelope');
  const zb = useWizardStore((s) => s.answers.location.zb);
  const floors = useWizardStore((s) => s.answers.geometry.floors);
  const geometry = useWizardStore((s) => s.answers.geometry);
  const glazingId = useWizardStore((s) => s.answers.windows.glazingId);
  const glazing = byId(templates.glazing, glazingId);
  const door = byId(templates.doors, 'semi_oca');
  const [detail, setDetail] = useState<AssemblyKind | 'window' | 'door'>('wall');
  const wallAlpha = byId(templates.surfaceColors, env.wallColorId).absorptance;
  const roofAlpha = byId(templates.surfaceColors, env.roofColorId).absorptance;

  return (
    <div className="space-y-8">
      <div role="radiogroup" aria-label="Tipo de construção" className="grid gap-3 md:grid-cols-2">
        {templates.constructionPresets.filter(p => ['padrao', 'apartamento'].includes(p.id)).map((p) => {
          const wall = assemblyThermal('wall', p.assemblies.wall.layers, templates.materials);
          const roof = assemblyThermal('roof', p.assemblies.roof.layers, templates.materials);
          const wallCheck = checkWall(zb, wall.uValue, wall.thermalCapacity, wallAlpha);
          const roofCheck = checkRoof(zb, roof.uValue, roofAlpha);
          return (
            <ChoiceCard
              key={p.id}
              selected={env.presetId === p.id}
              onSelect={() => update({ presetId: p.id })}
              media={
                <div className="h-24 overflow-hidden rounded-lg">
                  <AssemblySection layers={p.assemblies.wall.layers} materials={templates.materials} height={96} />
                </div>
              }
              title={p.id === 'padrao' ? 'Casa' : 'Apartamento'}
              description={p.id === 'padrao' ? 'Bloco cerâmico rebocado, telha cerâmica com laje, piso cerâmico, portas internas semi-ocas e vidro simples.' : p.description}
              footer={
                <div className="space-y-1.5 border-t border-slate-100 pt-2 text-xs">
                  {[
                    ['Parede', wall.uValue, wallCheck],
                    ['Cobertura', roof.uValue, roofCheck],
                  ].filter(([label]) => p.id !== 'apartamento' || label !== 'Cobertura').map(([label, u, check]) => {
                    const c = check as ReturnType<typeof checkWall>;
                    return (
                      <div key={label as string} className="flex items-center gap-1.5" title={`Referência NBR 15575 (ZB${zb}): ${c.limit}`}>
                        {c.ok ? <CheckCircle2 size={14} className="text-brand-600" /> : <TriangleAlert size={14} className="text-amber-500" />}
                        <span className="text-slate-600">{label as string}</span>
                        <span className="ml-auto font-medium tabular-nums text-slate-800">U {fmt(u as number, 2)}</span>
                      </div>
                    );
                  })}
                </div>
              }
            />
          );
        })}
      </div>

      <p className="-mt-4 flex items-center gap-1.5 text-xs text-slate-500">
        <Info size={13} /> ✓ = dentro da referência simplificada da NBR 15575 para a zona bioclimática {zb} (apenas indicativo).
        <HelpTip>
          Paredes: U ≤ 2,5 (ZB1–2) ou U ≤ 3,7 com α ≤ 0,6 (ZB3–8), e capacidade térmica ≥ 130 kJ/m²K (exceto ZB8). Coberturas: U ≤ 2,3, ou U ≤ 1,5 para cores escuras
          em ZB3–8. Não substitui a avaliação completa da norma.
        </HelpTip>
      </p>

      <div className="space-y-4">
        <Field label="Revestimento do piso">
          <Segmented ariaLabel="Revestimento do piso" value={env.floorFinish ?? 'ceramic'} onChange={(floorFinish: 'ceramic' | 'vinyl') => update({ floorFinish })}
            options={[{ value: 'ceramic', label: 'Cerâmico' }, { value: 'vinyl', label: 'Vinílico' }]} />
        </Field>
        <Field label="Abaixo do primeiro pavimento modelado">
          <Segmented ariaLabel="Contato do piso" value={geometry.groundFloor} onChange={(groundFloor) => useWizardStore.getState().update('geometry', { groundFloor })}
            options={[{ value: 'slab', label: 'Solo' }, { value: 'raised', label: 'Ar / pilotis' }, { value: 'adjacent', label: 'Outro pavimento' }]} />
        </Field>
        <Field label="Acima do último pavimento modelado">
          <Segmented ariaLabel="Contato do teto" value={geometry.topFloor ?? 'roof'} onChange={(topFloor) => useWizardStore.getState().update('geometry', { topFloor })}
            options={[{ value: 'roof', label: 'Cobertura externa' }, { value: 'adjacent', label: 'Outro pavimento' }]} />
        </Field>
        {(geometry.groundFloor === 'adjacent' || geometry.topFloor === 'adjacent') && <p className="rounded-xl bg-blue-50 p-3 text-sm text-slate-700">A laje separa o apartamento de outro pavimento. Se o vizinho não está no modelo, usamos uma aproximação sem troca de calor pela laje (adiabática). Entre pavimentos modelados, a troca térmica é calculada pelas faces compartilhadas.</p>}
        <p className="text-xs text-slate-500">Os presets são pontos de partida com propriedades indicativas. Confira os materiais do imóvel. Portas e janelas continuam sendo inseridas por você no Editor 3D.</p>
      </div>
      <div className="grid gap-4 2xl:grid-cols-2">
        <ColorPicker label="Cor das fachadas" value={env.wallColorId} onChange={(wallColorId) => update({ wallColorId })} />
        <ColorPicker label="Cor da cobertura" value={env.roofColorId} onChange={(roofColorId) => update({ roofColorId })} />
      </div>

      <div className="rounded-2xl bg-slate-50 p-4 sm:p-5">
        <SectionTitle icon={<Palette size={16} />}>Detalhes das camadas</SectionTitle>
        <div className="mb-4 overflow-x-auto">
          <Segmented
            size="sm"
            ariaLabel="Elemento construtivo"
            value={detail}
            onChange={setDetail}
            options={(Object.keys(ASSEMBLY_LABEL) as AssemblyKind[])
              .filter((k) => k !== 'interFloor' || floors > 1)
              .map((k) => ({ value: k as AssemblyKind | 'window' | 'door', label: k === 'groundFloor' ? 'Piso' : k === 'roof' ? 'Teto / cobertura' : ASSEMBLY_LABEL[k] })).concat([{ value: 'window', label: 'Janelas' }, { value: 'door', label: 'Portas internas' }])}
          />
        </div>
        {detail === 'window' ? <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <GlazingIllustration g={glazing} /><div><p className="font-medium">{glazing.label}</p><p className="text-sm text-slate-600">{glazing.description}</p><p className="mt-2 text-xs text-slate-500">Você pode ajustar o vidro na etapa 6 ou editar cada abertura no Editor 3D.</p></div>
        </div> : detail === 'door' ? <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <AssemblySection layers={door.layers} materials={templates.materials} height={130} /><div><p className="font-medium">{door.label}</p><p className="text-sm text-slate-600">{door.description}</p><p className="mt-2 text-xs text-slate-500">Duas faces de compensado de 4 mm e miolo oco. Portas externas podem ser personalizadas no Editor 3D.</p></div>
        </div> : <LayerList kind={detail} presetId={env.presetId} /> }
      </div>
    </div>
  );
}
