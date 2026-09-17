import { Compass, Mountain } from 'lucide-react';
import type { Terrain } from '@/generators/answers';
import { Field } from '@/ui/primitives';
import { NumberInput } from '@/ui/NumberInput';
import { CompassDial, TerrainIllustration } from '../illustrations';
import { ChoiceCard, SectionTitle, useStepAnswers } from './common';

const TERRAINS: { value: Terrain; label: string; description: string }[] = [
  { value: 'Country', label: 'Campo aberto', description: 'Área rural plana, sem obstáculos ao vento.' },
  { value: 'Suburbs', label: 'Bairro residencial', description: 'Casas baixas, árvores e ruas arborizadas.' },
  { value: 'City', label: 'Cidade', description: 'Periferia ou centro de cidade média.' },
  { value: 'Ocean', label: 'Litoral', description: 'À beira-mar ou de grandes lagos.' },
  { value: 'Urban', label: 'Centro urbano denso', description: 'Muitos prédios altos, zona industrial ou mata fechada.' },
];

const DIRECTIONS = ['Norte', 'Nordeste', 'Leste', 'Sudeste', 'Sul', 'Sudoeste', 'Oeste', 'Noroeste'];

export function ProjectStep() {
  const [p, update] = useStepAnswers('project');
  const facing = DIRECTIONS[Math.round((((p.northAxis + 180) % 360) / 45)) % 8];

  return (
    <div className="space-y-8">
      <Field label="Nome do edifício" htmlFor="building-name" hint="Aparece nos relatórios do EnergyPlus.">
        <input
          id="building-name"
          className="input max-w-md text-base"
          value={p.buildingName}
          maxLength={100}
          placeholder="Ex.: Casa da praia, Sede da empresa…"
          onChange={(e) => update({ buildingName: e.target.value })}
        />
      </Field>

      <div>
        <SectionTitle icon={<Mountain size={16} />} hint="O entorno muda a velocidade do vento que chega ao edifício.">
          Entorno do terreno
        </SectionTitle>
        <div role="radiogroup" aria-label="Entorno do terreno" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {TERRAINS.map((t) => (
            <ChoiceCard
              key={t.value}
              selected={p.terrain === t.value}
              onSelect={() => update({ terrain: t.value })}
              media={<TerrainIllustration terrain={t.value} />}
              title={t.label}
              description={t.description}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionTitle icon={<Compass size={16} />} hint="Gire o edifício em relação ao norte verdadeiro. A seta amarela indica a fachada principal (fachada “Sul” do modelo).">
          Orientação
        </SectionTitle>
        <div className="flex flex-col items-center gap-6 rounded-2xl bg-slate-50 p-5 sm:flex-row">
          {/* The dial shows where the main facade faces; north_axis = facade azimuth − 180°. */}
          <CompassDial value={(p.northAxis + 180) % 360} onChange={(az) => update({ northAxis: (az + 180) % 360 })} />
          <div className="w-full max-w-xs space-y-3">
            <Field label="Rotação em relação ao norte" hint="0° = fachada principal voltada para o Sul. Arraste a bússola ou digite.">
              <NumberInput
                value={p.northAxis}
                unit="graus"
                min={0}
                max={359.99}
                onValue={(v) => update({ northAxis: v ?? 0 })}
              />
            </Field>
            <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
              Fachada principal voltada para: <strong className="text-slate-900">{facing}</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
