import { cross, dot } from '@/core/geometry/vec';
import { useWizardStore } from '@/store/wizardStore';
import { useMemo, useState, type ReactNode } from 'react';
import { AlignHorizontalJustifyCenter, AppWindow, ArrowDownToLine, Box, DoorOpen, Layers2, MousePointerClick, Pencil, Plus, Square, Trash2, TriangleAlert } from 'lucide-react';
import type { EpJsonDocument } from '@/core/epjson/types';
import type { Rect2 } from '@/core/geometry/frames';
import {
  addOpening,
  deleteOpening,
  boxDims,
  checkOpening,
  clampRect,
  isGlazingConstruction,
  moveOpening,
  resizeZoneBox,
  sameFootprintZones,
  setOpeningCategory,
  SUBSURFACE_LABEL,
  surfaceArea,
  zoneBox,
  type BoxDims,
} from '@/core/geometry/edits';
import { readGeometryModel, SUBSURFACE_TYPE, type GeometryModel, type SubsurfaceCategory, type SurfaceGeom } from '@/core/geometry/model';
import { importLibraryConstruction } from '@/generators/library';
import { byId, templates } from '@/templates';
import { useDocumentStore } from '@/store/documentStore';
import { useUiStore } from '@/store/uiStore';
import { Badge, Button, Callout, Dialog, Field, Segmented, StatTile, fmt } from '@/ui/primitives';
import { NumberInput } from '@/ui/NumberInput';
import { RenameDialog } from '@/features/expert/ObjectDialogs';
import { ConstructionSection } from './ConstructionSection';
import { WallElevation } from './WallElevation';
import { useGeometryUi } from './geometryStore';

const CATEGORY_LABEL = { Wall: 'Parede', Floor: 'Piso', Roof: 'Cobertura', Ceiling: 'Forro / teto' } as const;

function boundaryLabel(s: SurfaceGeom) {
  const b = (s.boundary ?? '').toUpperCase();
  if (b === 'OUTDOORS') return 'Exterior';
  if (b === 'GROUND') return 'Solo';
  if (b === 'ADIABATIC') return 'Adiabática';
  if (b === 'SURFACE' || b === 'ZONE') return `Adjacente a ${s.boundaryObject ?? '—'}`;
  return s.boundary ?? '—';
}

const DIRECTIONS = ['Norte', 'Nordeste', 'Leste', 'Sudeste', 'Sul', 'Sudoeste', 'Oeste', 'Noroeste'];

/** True compass direction a wall faces, after zone and building rotations. */
function facing(model: GeometryModel, s: SurfaceGeom): string | undefined {
  if (s.category !== 'Wall' || !s.frame) return undefined;
  const o = model.toWorld([0, 0, 0], s.zone);
  const p = model.toWorld(s.frame.n, s.zone);
  const az = ((Math.atan2(p[0] - o[0], p[1] - o[1]) * 180) / Math.PI + 360) % 360;
  return `${DIRECTIONS[Math.round(az / 45) % 8]} (${Math.round(az)}°)`;
}

function PanelHeader({ icon, kicker, title, onRename, actions }: { icon: ReactNode; kicker: string; title: string; onRename?: () => void; actions?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{kicker}</p>
        <div className="flex items-center gap-1.5">
          <h2 className="truncate text-base font-semibold text-slate-900" title={title}>
            {title}
          </h2>
          {onRename && (
            <button type="button" aria-label="Renomear" onClick={onRename} className="text-slate-400 hover:text-brand-700">
              <Pencil size={14} />
            </button>
          )}
        </div>
      </div>
      {actions}
    </div>
  );
}

function useCommit() {
  const commit = useDocumentStore((s) => s.commit);
  const toast = useUiStore((s) => s.toast);
  return (fn: () => EpJsonDocument, label: string) => {
    try {
      commit(fn(), label);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      return false;
    }
  };
}

// ------------------------------------------------------------------ zone dims

function BoxDimsEditor({ model, zone, fields }: { model: GeometryModel; zone: string; fields: { key: keyof BoxDims; label: string }[] }) {
  const doc = useDocumentStore((s) => s.doc);
  const run = useCommit();
  const fromPlan = useWizardStore(s => s.linked && s.answers.geometry.mode === 'plan');
  const [allFloors, setAllFloors] = useState(true);
  const box = zoneBox(model, zone);
  const siblings = useMemo(() => sameFootprintZones(model, zone), [model, zone]);
  if (fromPlan) return <Callout>Edite o contorno e a altura na planta 2D do assistente para manter os ambientes alinhados.<Button className="mt-2" onClick={() => { useUiStore.getState().goToStep('geometry'); useUiStore.getState().setMode('basic'); }}>Editar planta 2D</Button></Callout>;
  if (!box) {
    return <Callout tone="info">Este pavimento não é uma caixa retangular, então as dimensões só podem ser editadas pelos vértices no modo especialista.</Callout>;
  }
  const dims = boxDims(box);
  const change = (key: keyof BoxDims, v: number | undefined) => {
    if (v === undefined || Math.abs(v - dims[key]) < 1e-4) return;
    run(() => resizeZoneBox(doc, zone, { ...dims, [key]: v }, allFloors), 'Redimensionar pavimento');
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {fields.map((f) => (
          <Field key={f.key} label={f.label}>
            <NumberInput value={dims[f.key]} unit="m" min={f.key === 'height' ? 1 : 0.5} max={500} commitOnBlur onValue={(v) => change(f.key, v)} />
          </Field>
        ))}
      </div>
      {siblings.length > 1 && fields.some((f) => f.key !== 'height') && (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" className="accent-brand-600" checked={allFloors} onChange={(e) => setAllFloors(e.target.checked)} />
          Aplicar largura/profundidade aos {siblings.length} pavimentos com a mesma planta
        </label>
      )}
      <p className="text-[11px] text-slate-500">Paredes, piso, cobertura e aberturas se ajustam. Mudar a altura sobe os pavimentos de cima. Confirme com Enter ou saindo do campo.</p>
    </div>
  );
}

export function ZonePanel({ model, zone }: { model: GeometryModel; zone: string }) {
  const select = useGeometryUi((s) => s.select);
  const [renaming, setRenaming] = useState(false);
  const z = model.zones.get(zone);
  if (!z) return null;
  const surfaces = z.surfaces.map(name => model.surfaces.get(name)!);
  const area = surfaces.filter(s => s.category === 'Floor').reduce((sum, s) => sum + surfaceArea(s), 0);
  const volume = Math.abs(surfaces.reduce((sum, s) => {
    for (let i = 1; i < s.points.length - 1; i++) sum += dot(s.points[0], cross(s.points[i], s.points[i + 1])) / 6;
    return sum;
  }, 0));
  const counts = { Wall: 0, Floor: 0, Roof: 0, Ceiling: 0, openings: 0 };
  for (const s of z.surfaces) {
    const sg = model.surfaces.get(s)!;
    counts[sg.category]++;
    counts.openings += sg.subsurfaces.length;
  }
  return (
    <div className="space-y-4">
      <PanelHeader icon={<Box size={20} />} kicker="Zona térmica" title={zone} onRename={() => setRenaming(true)} />
      {surfaces.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Área de piso" value={fmt(area)} unit="m²" />
          <StatTile label="Volume" value={fmt(volume)} unit="m³" />
        </div>
      )}
      <BoxDimsEditor
        model={model}
        zone={zone}
        fields={[
          { key: 'width', label: 'Largura (X)' },
          { key: 'depth', label: 'Profundidade (Y)' },
          { key: 'height', label: 'Altura' },
        ]}
      />
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Elementos</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge>{counts.Wall} paredes</Badge>
          <Badge>{counts.Floor} piso(s)</Badge>
          <Badge>{counts.Roof + counts.Ceiling} cobertura/forro</Badge>
          <Badge tone="blue">{counts.openings} aberturas</Badge>
        </div>
        <ul className="mt-2 space-y-1">
          {z.surfaces.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => select({ kind: 'surface', name: s })} className="w-full truncate rounded-md px-2 py-1 text-left text-sm text-slate-700 hover:bg-slate-100">
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {renaming && <RenameDialog type="Zone" name={zone} onClose={() => setRenaming(false)} onRenamed={(n) => select({ kind: 'zone', name: n })} />}
    </div>
  );
}

// ------------------------------------------------------------------ openings helpers

function defaultConstruction(doc: EpJsonDocument, category: Exclude<SubsurfaceCategory, 'Other'>): { doc: EpJsonDocument; name: string } {
  const glazing = category !== 'Door';
  const model = readGeometryModel(doc);
  // Prefer what similar openings already use.
  for (const sub of model.subsurfaces.values()) {
    if ((sub.category === 'Door') === !glazing && sub.construction && doc.Construction?.[sub.construction]) return { doc, name: sub.construction };
  }
  if (glazing) {
    const existing = Object.keys(doc.Construction ?? {}).find((c) => isGlazingConstruction(doc, c));
    if (existing) return { doc, name: existing };
    return importLibraryConstruction(doc, templates, 'glazing:simples');
  }
  const hollow = `Porta - ${byId(templates.doors, 'semi_oca').label}`;
  if (doc.Construction?.[hollow]) return { doc, name: hollow };
  return importLibraryConstruction(doc, templates, 'door:madeira');
}

/** First free spot on the wall for a new opening of the given size. */
function findSpot(model: GeometryModel, wall: SurfaceGeom, width: number, height: number, sill: number): Rect2 {
  const base = wall.rect!;
  const w = Math.min(width, base.width - 0.2);
  const h = Math.min(height, base.height - sill - 0.05);
  const y = base.y + Math.max(0, Math.min(sill, base.height - h));
  const center = base.x + (base.width - w) / 2;
  const candidates = [center, ...Array.from({ length: Math.floor((base.width - w) / 0.1) + 1 }, (_, i) => base.x + 0.1 + i * 0.1)];
  for (const x of candidates) {
    const r = { x, y, width: w, height: h };
    if (checkOpening(model, wall, r).length === 0) return r;
  }
  return clampRect(base, { x: center, y, width: w, height: h });
}

function AddOpeningButtons({ wall }: { wall: SurfaceGeom }) {
  const doc = useDocumentStore((s) => s.doc);
  const run = useCommit();
  const select = useGeometryUi((s) => s.select);
  const add = (category: 'Window' | 'Door' | 'GlassDoor') => {
    let created = '';
    const ok = run(() => {
      const c = defaultConstruction(doc, category);
      const m = readGeometryModel(c.doc);
      const w = m.surfaces.get(wall.name)!;
      const rect = category === 'Window' ? findSpot(m, w, 1.2, 1.2, 1) : findSpot(m, w, category === 'Door' ? 0.9 : 1.6, 2.1, 0);
      const r = addOpening(c.doc, m, wall.name, { category, rect, construction: c.name });
      created = r.name;
      return r.doc;
    }, `Adicionar ${SUBSURFACE_LABEL[category].toLowerCase()}`);
    if (ok) select({ kind: 'opening', name: created });
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="subtle" icon={<AppWindow size={14} />} onClick={() => add('Window')}>
        Janela
      </Button>
      <Button size="sm" variant="subtle" icon={<DoorOpen size={14} />} onClick={() => add('Door')}>
        Porta
      </Button>
      <Button size="sm" variant="subtle" icon={<Plus size={14} />} onClick={() => add('GlassDoor')}>
        Porta de vidro
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ surface

export function SurfacePanel({ model, name }: { model: GeometryModel; name: string }) {
  const doc = useDocumentStore((s) => s.doc);
  const run = useCommit();
  const select = useGeometryUi((s) => s.select);
  const [renaming, setRenaming] = useState(false);
  const s = model.surfaces.get(name);
  if (!s) return null;
  const interzone = !!s.sharedWith || ['SURFACE', 'ZONE'].includes((s.boundary ?? '').toUpperCase());
  const n = s.frame?.n;
  const alongX = n ? Math.abs(n[1]) > 0.99 : false;
  const alongY = n ? Math.abs(n[0]) > 0.99 : false;

  const dimFields: { key: keyof BoxDims; label: string }[] =
    s.category === 'Wall'
      ? [...(alongX ? [{ key: 'width' as const, label: 'Comprimento' }] : alongY ? [{ key: 'depth' as const, label: 'Comprimento' }] : []), { key: 'height', label: 'Altura' }]
      : [
          { key: 'width', label: 'Largura (X)' },
          { key: 'depth', label: 'Profundidade (Y)' },
        ];

  return (
    <div className="space-y-5">
      <PanelHeader
        icon={s.category === 'Wall' ? <Square size={20} /> : <Layers2 size={20} />}
        kicker={`${CATEGORY_LABEL[s.category]}${s.zone ? ` · ${s.zone}` : ''}`}
        title={name}
        onRename={() => setRenaming(true)}
      />
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="slate">{boundaryLabel(s)}</Badge>
        {facing(model, s) && <Badge tone="amber">Voltada para {facing(model, s)}</Badge>}
        {s.rect && <Badge tone="slate">{fmt(s.rect.width, 2)} × {fmt(s.rect.height, 2)} m</Badge>}
        {s.rect && <Badge tone="slate">{fmt(surfaceArea(s), 2)} m²</Badge>}
        {s.zone && (
          <button type="button" onClick={() => select({ kind: 'zone', name: s.zone! })} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100">
            ver zona
          </button>
        )}
      </div>

      {s.sharedWith && <Callout title={s.category === 'Wall' ? 'Parede compartilhada' : 'Laje compartilhada'}>
        Um único elemento físico entre {s.zone} e {model.surfaces.get(s.sharedWith)?.zone}. As duas faces térmicas têm os mesmos vértices em coordenadas globais.
        <Button className="mt-2" size="sm" onClick={() => select({ kind: 'surface', name: s.sharedWith! })}>Ver lado da outra zona</Button>
      </Callout>}
      {s.zone && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Dimensões</h3>
          <BoxDimsEditor model={model} zone={s.zone} fields={dimFields} />
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Material e espessura</h3>
        <ConstructionSection element={name} construction={s.construction} use={s.category === 'Wall' ? 'wall' : s.category === 'Floor' ? 'floor' : 'roof'} category={s.category} interzone={interzone} />
      </section>

      {s.category === 'Wall' && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Janelas e portas ({s.subsurfaces.length})</h3>
          </div>
          {s.rect ? (
            <>
              <WallElevation
                model={model}
                wall={s}
                onSelect={(sub) => select({ kind: 'opening', name: sub })}
                onCommit={(sub, rect) => run(() => moveOpening(doc, model, sub, rect), 'Mover abertura')}
              />
              {interzone && !s.sharedWith ? (
                <p className="text-xs text-slate-500">A face correspondente na zona vizinha não foi identificada. Confira os pontos das duas zonas.</p>
              ) : (
                <AddOpeningButtons wall={s} />
              )}
              {s.sharedWith && <p className="text-xs text-slate-500">A abertura será criada nos dois lados e suas edições serão sincronizadas.</p>}
              <p className="text-[11px] text-slate-500">Clique numa abertura para editar; arraste para mover ou pelos cantos para redimensionar.</p>
            </>
          ) : (
            <Callout tone="info">Parede não retangular: aberturas só pelo modo especialista.</Callout>
          )}
        </section>
      )}
      {renaming && <RenameDialog type={s.type} name={name} onClose={() => setRenaming(false)} onRenamed={(nn) => select({ kind: 'surface', name: nn })} />}
    </div>
  );
}

// ------------------------------------------------------------------ opening

export function OpeningPanel({ model, name }: { model: GeometryModel; name: string }) {
  const doc = useDocumentStore((s) => s.doc);
  const run = useCommit();
  const select = useGeometryUi((s) => s.select);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sub = model.subsurfaces.get(name);
  const wall = sub && model.surfaces.get(sub.base);
  if (!sub) return null;
  const rect = sub.rect;
  const problems = wall && rect ? checkOpening(model, wall, rect, name) : [];

  const setRect = (patch: Partial<Rect2>) => {
    if (!rect || !wall?.rect) return;
    const next = { ...rect, ...patch };
    // Absolute positions in the UI are measured from the wall's lower-left corner.
    run(() => moveOpening(doc, model, name, clampRect(wall.rect!, next)), 'Editar abertura');
  };

  const changeCategory = (category: 'Window' | 'Door' | 'GlassDoor') => {
    if (category === sub.category) return;
    run(() => {
      const needsGlazing = category !== 'Door';
      const currentOk = sub.construction && isGlazingConstruction(doc, sub.construction) === needsGlazing;
      const c = currentOk ? { doc, name: sub.construction! } : defaultConstruction(doc, category);
      return setOpeningCategory(c.doc, name, category, c.name);
    }, 'Tipo de abertura');
  };

  return (
    <div className="space-y-5">
      <PanelHeader
        icon={sub.category === 'Door' ? <DoorOpen size={20} /> : <AppWindow size={20} />}
        kicker={`${SUBSURFACE_LABEL[sub.category]} · em ${sub.base}`}
        title={name}
        onRename={() => setRenaming(true)}
        actions={
          <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setDeleting(true)} aria-label="Excluir abertura">
            <span className="sr-only sm:not-sr-only">Excluir</span>
          </Button>
        }
      />

      {sub.sharedWith && <Callout title="Abertura compartilhada">
        Posição, tamanho, tipo e materiais são sincronizados com a zona vizinha.
        <Button className="mt-2" size="sm" onClick={() => select({ kind: 'opening', name: sub.sharedWith! })}>Ver lado da outra zona</Button>
      </Callout>}
      <Segmented
        ariaLabel="Tipo de abertura"
        value={sub.category === 'Other' ? 'Window' : sub.category}
        onChange={changeCategory}
        options={[
          { value: 'Window', label: 'Janela', icon: <AppWindow size={14} /> },
          { value: 'Door', label: 'Porta', icon: <DoorOpen size={14} /> },
          { value: 'GlassDoor', label: 'Porta de vidro', icon: <Square size={14} /> },
        ]}
      />

      {rect && wall?.rect ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Tamanho e posição</h3>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Largura">
              <NumberInput value={rect.width} unit="m" min={0.1} max={wall.rect.width} commitOnBlur onValue={(v) => v !== undefined && setRect({ width: v })} />
            </Field>
            <Field label="Altura">
              <NumberInput value={rect.height} unit="m" min={0.1} max={wall.rect.height} commitOnBlur onValue={(v) => v !== undefined && setRect({ height: v })} />
            </Field>
            <Field label="Distância da esquerda" hint="Vista de fora">
              <NumberInput value={Math.round((rect.x - wall.rect.x) * 1000) / 1000} unit="m" min={0} max={wall.rect.width} commitOnBlur onValue={(v) => v !== undefined && setRect({ x: wall.rect!.x + v })} />
            </Field>
            <Field label={sub.category === 'Window' ? 'Altura do peitoril' : 'Altura da base'}>
              <NumberInput value={Math.round((rect.y - wall.rect.y) * 1000) / 1000} unit="m" min={0} max={wall.rect.height} commitOnBlur onValue={(v) => v !== undefined && setRect({ y: wall.rect!.y + v })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={<AlignHorizontalJustifyCenter size={14} />} onClick={() => setRect({ x: wall.rect!.x + (wall.rect!.width - rect.width) / 2 })}>
              Centralizar
            </Button>
            <Button size="sm" variant="ghost" icon={<ArrowDownToLine size={14} />} onClick={() => setRect({ y: wall.rect!.y })}>
              Encostar no piso
            </Button>
          </div>
          {problems.length > 0 && (
            <Callout tone="error" icon={<TriangleAlert size={16} />}>
              {problems.join(' ')}
            </Callout>
          )}
          <WallElevation
            model={model}
            wall={wall}
            selected={name}
            onSelect={(n) => select({ kind: 'opening', name: n })}
            onCommit={(n, r) => run(() => moveOpening(doc, model, n, r), 'Mover abertura')}
          />
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <MousePointerClick size={13} /> Área: {fmt(rect.width * rect.height, 2)} m² · {fmt(((rect.width * rect.height) / (wall.rect.width * wall.rect.height)) * 100)}% da parede
          </div>
        </section>
      ) : (
        <Callout tone="info">Abertura não retangular: edite os vértices no modo especialista.</Callout>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">{sub.category === 'Door' ? 'Material da porta' : 'Vidro'}</h3>
        <ConstructionSection element={name} construction={sub.construction} use={sub.category === 'Door' ? 'door' : 'window'} category="Opening" interzone={!!sub.sharedWith} />
      </section>

      {renaming && <RenameDialog type={SUBSURFACE_TYPE} name={name} onClose={() => setRenaming(false)} onRenamed={(nn) => select({ kind: 'opening', name: nn })} />}
      {deleting && <Dialog open title={`Excluir “${name}”?`} onClose={() => setDeleting(false)} footer={<>
        <Button onClick={() => setDeleting(false)}>Cancelar</Button>
        <Button variant="danger" onClick={() => {
          if (run(() => deleteOpening(doc, name), 'Excluir abertura')) {
            setDeleting(false); select(wall ? { kind: 'surface', name: wall.name } : undefined);
          }
        }}>Excluir</Button>
      </>}><p className="text-sm text-slate-600">{sub.sharedWith ? 'A abertura será excluída dos dois lados da parede.' : 'A abertura será excluída.'} Você pode desfazer esta ação.</p></Dialog>}
    </div>
  );
}
