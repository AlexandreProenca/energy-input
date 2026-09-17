import { Flame, Info, Snowflake } from 'lucide-react';
import { byId, templates } from '@/templates';
import { useWizardStore } from '@/store/wizardStore';
import { Callout, Field, Toggle, fmt } from '@/ui/primitives';
import { NumberInput } from '@/ui/NumberInput';
import { ChoiceCard, SectionTitle, useStepAnswers } from './common';

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
        <span>faixa sem climatização</span>
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
          description="Aquece e resfria cada pavimento exatamente o necessário para manter a temperatura."
        />
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
