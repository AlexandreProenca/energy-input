import { Flame, Info, Snowflake, Thermometer } from 'lucide-react';
import { byId, templates } from '@/templates';
import { useWizardStore } from '@/store/wizardStore';
import { Callout, Field, Toggle, fmt } from '@/ui/primitives';
import { NumberInput } from '@/ui/NumberInput';
import { ChoiceCard, SectionTitle, useStepAnswers } from './common';
import { alternarClimatizacao, ambientesClimatizaveis, climatizado } from '@/generators/conditioning';

function ComfortBar({ heating, cooling }: { heating: number; cooling: number }) {
  const min = 10;
  const max = 35;
  const x = (t: number) => ((Math.min(max, Math.max(min, t)) - min) / (max - min)) * 100;
  return (
    <div className="pt-6">
      <div className="relative h-4 rounded-full" style={{ background: 'linear-gradient(90deg,#3b82f6,#60a5fa 25%,#34d399 45%,#34d399 60%,#fb923c 80%,#ef4444)' }}>
        <div className="absolute inset-y-0 rounded-full border-2 border-white bg-white/35" style={{ left: `${x(heating)}%`, width: `${Math.max(0, x(cooling) - x(heating))}%` }} />
        {[
          [heating, 'Aquece abaixo de', '#dc2626'],
          [cooling, 'Resfria acima de', '#2563eb'],
        ].map(([t, label, color]) => (
          <div key={label as string} className="absolute -top-6 -translate-x-1/2 text-center" style={{ left: `${x(t as number)}%` }}>
            <span className="whitespace-nowrap rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold shadow-sm" style={{ color: color as string }}>
              {fmt(t as number)} °C
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{min} °C</span>
        <span>faixa sem aquecer nem resfriar</span>
        <span>{max} °C</span>
      </div>
    </div>
  );
}

export function HvacStep() {
  const [hvac, update] = useStepAnswers('hvac');
  const useId = useWizardStore((s) => s.answers.loads.useId);
  const use = byId(templates.buildingUses, useId);
  const invalid = hvac.coolingSetpoint <= hvac.heatingSetpoint;
  const geometry = useWizardStore((s) => s.answers.geometry);
  const ambientes = ambientesClimatizaveis(geometry);
  const climatizados = ambientes.filter((a) => climatizado(a.chave, hvac));
  const alternar = (chave: string, ligado: boolean) => update({ unconditioned: alternarClimatizacao(geometry, hvac.unconditioned, chave, ligado) });

  return (
    <div className="space-y-8">
      <div role="radiogroup" aria-label="Sistema de climatização" className="grid gap-3 sm:grid-cols-2">
        <ChoiceCard
          selected
          onSelect={() => {}}
          media={
            <div className="flex gap-2">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-500">
                <Flame size={22} />
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-500">
                <Snowflake size={22} />
              </span>
            </div>
          }
          title="Sistema ideal (cargas térmicas)"
          description="Aquece e resfria cada ambiente climatizado exatamente o necessário para manter a temperatura."
        />
      </div>

      <div>
        <SectionTitle hint={geometry.mode === 'plan' ? 'A escolha vale para o ambiente em todos os pavimentos.' : 'No modo caixa, cada pavimento é um ambiente. Para escolher cômodo por cômodo, desenhe a planta na etapa de geometria.'}>
          Ambientes climatizados
        </SectionTitle>
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {ambientes.map((a) => {
            const ligado = climatizado(a.chave, hvac);
            return (
              <li key={a.chave} className="flex items-center gap-3 px-4 py-3">
                <span className={ligado ? 'text-brand-600' : 'text-slate-400'}>{ligado ? <Snowflake size={18} /> : <Thermometer size={18} />}</span>
                <label htmlFor={`clima-${a.chave}`} className="mr-auto cursor-pointer">
                  <span className="font-medium text-slate-800">{a.nome}</span>
                  <span className="block text-xs text-slate-500">
                    {fmt(a.area, 1)} m²{a.pavimentos > 1 ? ` por pavimento · ${a.pavimentos} pavimentos` : ''} · {ligado ? 'climatizado' : 'sem climatização — temperatura livre'}
                  </span>
                </label>
                 <input id={`clima-${a.chave}`} type="checkbox" aria-label={`Climatizar ${a.nome}`} className="h-5 w-5 accent-brand-600" checked={ligado} onChange={(e) => alternar(a.chave, e.target.checked)} />
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Ambiente sem climatização não tem sistema nem termostato: a temperatura dele acompanha o clima externo, as trocas com os ambientes vizinhos e as cargas internas.
          No modo Resultados, a temperatura operativa mostra essa evolução livre.
        </p>
        {ambientes.length > 0 && climatizados.length === 0 && (
          <div className="mt-3">
            <Callout tone="warning">Nenhum ambiente climatizado: a simulação mostra o edifício em evolução livre, sem consumo de aquecimento nem de resfriamento. As temperaturas abaixo continuam sendo a faixa de conforto usada para contar horas de desconforto.</Callout>
          </div>
        )}
      </div>

      <Callout tone="info" icon={<Info size={18} />} title="O que isso significa?">
        O sistema ideal calcula quanta energia térmica o edifício <strong>precisa</strong>, mas não simula um equipamento real (split, VRF, chiller…). Equipamentos reais poderão ser
        configurados no modo especialista.
      </Callout>

      <div>
        <SectionTitle hint={`Valores sugeridos para uso ${use.label.toLowerCase()}: ${use.heatingSetpoint} °C e ${use.coolingSetpoint} °C.`}>Temperaturas de controle</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Aquecer quando ficar abaixo de" error={invalid ? 'Deve ser menor que a temperatura de resfriamento.' : undefined}>
            <NumberInput value={hvac.heatingSetpoint} unit="°C" min={5} max={30} invalid={invalid} onValue={(v) => v !== undefined && update({ heatingSetpoint: v })} />
          </Field>
          <Field label="Resfriar quando ficar acima de">
            <NumberInput value={hvac.coolingSetpoint} unit="°C" min={15} max={40} invalid={invalid} onValue={(v) => v !== undefined && update({ coolingSetpoint: v })} />
          </Field>
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
          <ComfortBar heating={hvac.heatingSetpoint} cooling={hvac.coolingSetpoint} />
        </div>
      </div>

      <Toggle
        checked={hvac.setbackEnabled}
        onChange={(setbackEnabled) => update({ setbackEnabled })}
        label="Afrouxar o controle quando o edifício estiver vazio"
        description={`Fora do horário de ocupação, só aquece abaixo de ${use.setback.heating} °C e só resfria acima de ${use.setback.cooling} °C. Economiza energia em escritórios e lojas.`}
      />
    </div>
  );
}
