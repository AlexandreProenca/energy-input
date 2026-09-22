import { FloorPlanEditor } from './FloorPlanEditor';
import { roomArea, perimeter, validateRooms } from '@/generators/geometry/floorPlan';
import { useUiStore } from '@/store/uiStore';
import { Button, Segmented } from '@/ui/primitives';
import { Home, Ruler } from 'lucide-react';
import { validateBoxParams } from '@/generators/geometry/boxGeometry';
import { Callout, Field, StatTile, fmt } from '@/ui/primitives';
import { NumberInput, Stepper } from '@/ui/NumberInput';
import { GroundFloorIllustration } from '../illustrations';
import { ChoiceCard, SectionTitle, useStepAnswers } from './common';

function Footprint({ width, depth }: { width: number; depth: number }) {
  const max = Math.max(width, depth);
  const w = (width / max) * 150;
  const d = (depth / max) * 150;
  return (
    <svg viewBox="-40 -30 230 220" className="mx-auto w-full max-w-[260px]" role="img" aria-label={`Planta de ${width} por ${depth} metros`}>
      <rect x={(150 - w) / 2} y={(150 - d) / 2} width={w} height={d} fill="#d5efe2" stroke="#187352" strokeWidth="2" rx="2" />
      <text x="75" y={(150 - d) / 2 - 8} textAnchor="middle" fontSize="11" fill="#475569">
        Norte
      </text>
      <text x="75" y={(150 + d) / 2 + 18} textAnchor="middle" fontSize="12" fontWeight="600" fill="#0f3d2e">
        {fmt(width)} m (largura)
      </text>
      <text x="75" y={(150 + d) / 2 + 32} textAnchor="middle" fontSize="10" fill="#64748b">
        Sul · fachada principal
      </text>
      <text x={(150 + w) / 2 + 10} y="75" fontSize="12" fontWeight="600" fill="#0f3d2e" transform={`rotate(90 ${(150 + w) / 2 + 10} 75)`} textAnchor="middle">
        {fmt(depth)} m (profundidade)
      </text>
    </svg>
  );
}

export function GeometryStep() {
  const [g, update] = useStepAnswers('geometry');
  const plan = g.mode === 'plan';
  const rooms = g.rooms ?? [];
  const errors = plan ? validateRooms(rooms) : validateBoxParams(g);
  const floorArea = plan ? rooms.reduce((s, r) => s + roomArea(r.points), 0) : g.width * g.depth;
  const totalArea = floorArea * g.floors;
  const volume = totalArea * g.floorHeight;
  const facadeArea = (plan ? rooms.reduce((s, r) => s + perimeter(r.points), 0) : 2 * (g.width + g.depth)) * g.floorHeight * g.floors;

  return (
    <div className="space-y-8">
      <Segmented ariaLabel="Definição da geometria" value={plan ? 'plan' : 'box'} options={[{ value: 'plan', label: 'Planta 2D por ambientes' }, { value: 'box', label: 'Bloco retangular' }]} onChange={mode => update({ mode, ...(mode === 'plan' && !rooms.length ? { rooms: [{ id: 'initial-room', name: 'Ambiente 1', points: [[0, 0], [g.width, 0], [g.width, g.depth], [0, g.depth]] }] } : {}) })} />
      {plan && <FloorPlanEditor rooms={rooms} onChange={rooms => update({ rooms })} />}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="grid gap-4 sm:grid-cols-2">
          {!plan && <><Field label="Largura (leste–oeste)" hint="De 1 a 500 m">
            <NumberInput value={g.width} unit="m" min={1} max={500} onValue={(v) => v !== undefined && update({ width: v })} />
          </Field>
          <Field label="Profundidade (norte–sul)" hint="De 1 a 500 m">
            <NumberInput value={g.depth} unit="m" min={1} max={500} onValue={(v) => v !== undefined && update({ depth: v })} />
          </Field>
          </>}<Field label="Número de pavimentos" hint={plan ? "A mesma planta se repete em cada pavimento" : "Cada pavimento vira uma zona térmica"}>
            <Stepper ariaLabel="Número de pavimentos" value={g.floors} min={1} max={60} onValue={(floors) => update({ floors })} />
          </Field>
          <Field label="Altura de cada pavimento" hint="Piso a piso, de 2 a 10 m">
            <NumberInput value={g.floorHeight} unit="m" min={2} max={10} onValue={(v) => v !== undefined && update({ floorHeight: v })} />
          </Field>
        </div>
        {!plan && <div className="rounded-2xl bg-slate-50 p-3">
          <Footprint width={g.width} depth={g.depth} />
        </div>}
      </div>

      {plan && <Button variant="primary" onClick={() => useUiStore.getState().setMode('geometry')}>Abrir maquete 3D e editar materiais</Button>}
      {errors.length > 0 && <Callout tone="error">{errors.join(' ')}</Callout>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile icon={<Ruler size={13} />} label="Área por pavimento" value={fmt(floorArea)} unit="m²" />
        <StatTile icon={<Home size={13} />} label="Área total" value={fmt(totalArea)} unit="m²" />
        <StatTile label="Volume" value={fmt(volume, 0)} unit="m³" />
        <StatTile label={plan ? "Paredes dos ambientes (bruta)" : "Área de fachadas"} value={fmt(facadeArea, 0)} unit="m²" />
      </div>

      <div>
        <SectionTitle hint="Define o contato abaixo do primeiro pavimento modelado.">Contato do piso</SectionTitle>
        <div role="radiogroup" aria-label="Piso do térreo" className="grid gap-3 sm:grid-cols-3">
          <ChoiceCard
            selected={g.groundFloor === 'slab'}
            onSelect={() => update({ groundFloor: 'slab' })}
            media={<GroundFloorIllustration kind="slab" />}
            title="Apoiado no solo"
            description="Laje sobre o terreno (radier/contrapiso). O caso mais comum."
          />
          <ChoiceCard
            selected={g.groundFloor === 'raised'}
            onSelect={() => update({ groundFloor: 'raised' })}
            media={<GroundFloorIllustration kind="raised" />}
            title="Elevado (sobre pilotis)"
            description="Piso suspenso, com ar circulando por baixo."
          />
          <ChoiceCard selected={g.groundFloor === 'adjacent'} onSelect={() => update({ groundFloor: 'adjacent' })}
            media={<GroundFloorIllustration kind="adjacent" />} title="Sobre outro pavimento"
            description="Laje sobre outro apartamento. Vizinho não modelado: aproximação adiabática." />
        </div>
      </div>

      <div>
        <SectionTitle>Cobertura</SectionTitle>
        <div role="radiogroup" aria-label="Tipo de cobertura" className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard selected={g.topFloor !== 'adjacent'} onSelect={() => update({ topFloor: 'roof' })} media={<Home size={26} className="text-brand-600" />} title="Plana" description="Cobertura horizontal sobre o último pavimento." />
          <ChoiceCard selected={g.topFloor === 'adjacent'} onSelect={() => update({ topFloor: 'adjacent' })}
            media={<GroundFloorIllustration kind="adjacent" />} title="Outro pavimento acima" description="Teto sob outra unidade. Vizinho não modelado: aproximação adiabática." />
        </div>
      </div>
    </div>
  );
}
