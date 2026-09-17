import { CalendarDays, CalendarRange, Zap } from 'lucide-react';
import { clampDay } from '@/generators/runPeriod';
import { Callout, Field } from '@/ui/primitives';
import { NumberInput } from '@/ui/NumberInput';
import { YearBar } from '../illustrations';
import { ChoiceCard, useStepAnswers } from './common';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function DateInput({ label, month, day, onChange }: { label: string; month: number; day: number; onChange: (m: number, d: number) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <div className="w-20">
          <NumberInput aria-label={`${label}: dia`} value={day} integer min={1} max={31} onValue={(d) => d !== undefined && onChange(month, clampDay(month, d))} />
        </div>
        <select className="input" aria-label={`${label}: mês`} value={month} onChange={(e) => onChange(Number(e.target.value), clampDay(Number(e.target.value), day))}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </Field>
  );
}

export function RunPeriodStep() {
  const [rp, update] = useStepAnswers('runPeriod');
  return (
    <div className="space-y-6">
      <div role="radiogroup" aria-label="Período da simulação" className="grid gap-3 md:grid-cols-3">
        <ChoiceCard
          selected={rp.mode === 'year'}
          onSelect={() => update({ mode: 'year' })}
          media={<CalendarDays size={28} className="text-brand-600" />}
          title="Ano completo"
          description="Recomendado. Simula as 8.760 horas do ano com o arquivo climático — ideal para consumo anual e conforto."
        />
        <ChoiceCard
          selected={rp.mode === 'range'}
          onSelect={() => update({ mode: 'range' })}
          media={<CalendarRange size={28} className="text-brand-600" />}
          title="Período específico"
          description="Só alguns dias ou meses — por exemplo, o verão. Mais rápido de simular."
        />
        <ChoiceCard
          selected={rp.mode === 'designDays'}
          onSelect={() => update({ mode: 'designDays' })}
          media={<Zap size={28} className="text-sun-500" />}
          title="Só dias de projeto"
          description="Teste rápido com um dia muito frio e um muito quente. Não precisa de arquivo climático."
        />
      </div>

      {rp.mode === 'range' && (
        <div className="grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2">
          <DateInput label="Início" month={rp.beginMonth} day={rp.beginDay} onChange={(beginMonth, beginDay) => update({ beginMonth, beginDay })} />
          <DateInput label="Fim" month={rp.endMonth} day={rp.endDay} onChange={(endMonth, endDay) => update({ endMonth, endDay })} />
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 p-4">
        <YearBar mode={rp.mode} begin={[rp.beginMonth, rp.beginDay]} end={[rp.endMonth, rp.endDay]} />
      </div>

      {rp.mode === 'designDays' && (
        <Callout tone="info" title="Dias de projeto">
          O resultado mostra as cargas máximas de aquecimento e resfriamento, mas não o consumo anual de energia.
        </Callout>
      )}
      {rp.mode === 'range' && (rp.endMonth * 100 + rp.endDay < rp.beginMonth * 100 + rp.beginDay) && (
        <Callout tone="info">O período termina antes de começar, então a simulação atravessa a virada do ano.</Callout>
      )}
    </div>
  );
}
