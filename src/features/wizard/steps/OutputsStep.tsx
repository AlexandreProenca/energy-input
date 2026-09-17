import { Box, CheckSquare, Flame, Gauge, Receipt, Square, Thermometer, FileText } from 'lucide-react';
import { clsx } from 'clsx';
import { templates } from '@/templates';
import { Callout } from '@/ui/primitives';
import { useStepAnswers } from './common';

const ICONS = { gauge: Gauge, thermometer: Thermometer, flame: Flame, receipt: Receipt, box: Box };

export function OutputsStep() {
  const [o, update] = useStepAnswers('outputs');
  const toggle = (id: string) => update({ selected: o.selected.includes(id) ? o.selected.filter((s) => s !== id) : [...o.selected, id] });

  return (
    <div className="space-y-6">
      <Callout tone="success" icon={<FileText size={18} />} title="Sempre incluído">
        Relatório resumido em HTML (tabelas “AllSummary”) com áreas, cargas de pico e consumo anual por uso final, mesmo que nada abaixo seja marcado.
      </Callout>
      <div className="grid gap-3 md:grid-cols-2">
        {templates.outputs.map((preset) => {
          const Icon = ICONS[preset.icon];
          const on = o.selected.includes(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(preset.id)}
              className={clsx('choice flex-row items-start gap-3', on && 'choice-active')}
            >
              <span className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}>
                <Icon size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">{preset.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{preset.description}</span>
                <span className="mt-2 block text-[11px] text-slate-400">
                  {Object.entries(preset.objects)
                    .map(([type, inst]) => `${Object.keys(inst).length}× ${type}`)
                    .join(' · ')}
                </span>
              </span>
              {on ? <CheckSquare size={20} className="shrink-0 text-brand-600" /> : <Square size={20} className="shrink-0 text-slate-300" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
