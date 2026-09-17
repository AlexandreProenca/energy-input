import { useState } from 'react';
import { Briefcase, Home, Lightbulb, Monitor, Store, Users, Wind } from 'lucide-react';
import { byId, templates } from '@/templates';
import { weeklyProfile } from '@/generators/schedules';
import { useWizardStore } from '@/store/wizardStore';
import { Segmented, StatTile, fmt } from '@/ui/primitives';
import { WeeklyHeatmap } from '../illustrations';
import { ChoiceCard, SectionTitle, useStepAnswers } from './common';

const ICONS = { home: Home, briefcase: Briefcase, store: Store };

type ScheduleKey = 'occupancy' | 'lighting' | 'equipment';

export function LoadsStep() {
  const [loads, update] = useStepAnswers('loads');
  const geometry = useWizardStore((s) => s.answers.geometry);
  const [schedule, setSchedule] = useState<ScheduleKey>('occupancy');
  const use = byId(templates.buildingUses, loads.useId);
  const area = geometry.width * geometry.depth * geometry.floors;

  return (
    <div className="space-y-8">
      <div role="radiogroup" aria-label="Uso do edifício" className="grid gap-3 sm:grid-cols-3">
        {templates.buildingUses.map((u) => {
          const Icon = ICONS[u.icon];
          return (
            <ChoiceCard
              key={u.id}
              selected={loads.useId === u.id}
              onSelect={() => update({ useId: u.id })}
              media={
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
                  <Icon size={28} />
                </div>
              }
              title={u.label}
              description={u.description}
            />
          );
        })}
      </div>

      <div>
        <SectionTitle hint={`Valores típicos do template “${use.label}”, aplicados a todos os pavimentos (${fmt(area, 0)} m² no total).`}>O que está incluído</SectionTitle>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatTile icon={<Users size={13} />} label="Pessoas" value={fmt(use.peoplePerArea * area, 0)} unit={`(${fmt(1 / use.peoplePerArea, 0)} m²/pessoa)`} />
          <StatTile icon={<Lightbulb size={13} />} label="Iluminação" value={fmt(use.lightingPowerDensity)} unit="W/m²" />
          <StatTile icon={<Monitor size={13} />} label="Equipamentos" value={fmt(use.equipmentPowerDensity)} unit="W/m²" />
          <StatTile icon={<Wind size={13} />} label="Infiltração de ar" value={fmt(use.infiltrationAch)} unit="trocas/h" />
        </div>
      </div>

      <div className="rounded-2xl bg-slate-50 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>Rotina semanal</SectionTitle>
          <Segmented
            size="sm"
            ariaLabel="Agenda exibida"
            value={schedule}
            onChange={setSchedule}
            options={[
              { value: 'occupancy', label: 'Ocupação', icon: <Users size={13} /> },
              { value: 'lighting', label: 'Iluminação', icon: <Lightbulb size={13} /> },
              { value: 'equipment', label: 'Equipamentos', icon: <Monitor size={13} /> },
            ]}
          />
        </div>
        <div className="rounded-xl bg-white p-3">
          <WeeklyHeatmap profile={weeklyProfile(use.schedules[schedule])} color={schedule === 'occupancy' ? '#187352' : schedule === 'lighting' ? '#ee9b1a' : '#475569'} />
        </div>
        <p className="mt-2 text-xs text-slate-500">Cor mais forte = mais uso naquela hora. Feriados seguem a rotina de domingo.</p>
      </div>
    </div>
  );
}
