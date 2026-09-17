import { useMemo, useState } from 'react';
import { AppWindow, Box, ChevronRight, DoorOpen, Layers2, Search, Square } from 'lucide-react';
import { clsx } from 'clsx';
import type { GeometryModel, SurfaceGeom } from '@/core/geometry/model';
import { useGeometryUi } from './geometryStore';
import { zoneLevels } from './useGeometry';

const ORDER = { Wall: 0, Floor: 1, Ceiling: 2, Roof: 3 };

function Row({ name, kind, icon, depth, label }: { name: string; kind: 'zone' | 'surface' | 'opening'; icon: React.ReactNode; depth: number; label?: string }) {
  const selection = useGeometryUi((s) => s.selection);
  const hovered = useGeometryUi((s) => s.hovered);
  const select = useGeometryUi((s) => s.select);
  const hover = useGeometryUi((s) => s.hover);
  const active = selection?.kind === kind && selection.name === name;
  return (
    <button
      type="button"
      onClick={() => select({ kind, name })}
      onMouseEnter={() => hover(name)}
      onMouseLeave={() => hover(undefined)}
      aria-current={active ? 'true' : undefined}
      title={name}
      className={clsx(
        'flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[13px]',
        active ? 'bg-amber-100 font-medium text-amber-900' : hovered === name ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-100',
      )}
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span className="truncate">{label ?? name}</span>
    </button>
  );
}

export function ElementTree({ model }: { model: GeometryModel }) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const levels = useMemo(() => zoneLevels(model), [model]);
  const q = query.trim().toUpperCase();

  const surfacesOf = (zone?: string) =>
    [...model.surfaces.values()].filter((s) => s.zone === zone).sort((a, b) => ORDER[a.category] - ORDER[b.category] || a.name.localeCompare(b.name, 'pt-BR'));
  const matches = (s: SurfaceGeom) => !q || s.name.toUpperCase().includes(q) || s.subsurfaces.some((n) => n.toUpperCase().includes(q));
  const short = (name: string, zone?: string) => (zone && name.startsWith(`${zone} - `) ? name.slice(zone.length + 3) : name);

  const renderSurfaces = (list: SurfaceGeom[], depth: number) =>
    list.filter(matches).map((s) => (
      <li key={s.name}>
        <Row name={s.name} kind="surface" depth={depth} label={short(s.name, s.zone)} icon={s.category === 'Wall' ? <Square size={13} /> : <Layers2 size={13} />} />
        {s.subsurfaces.length > 0 && (
          <ul>
            {s.subsurfaces.map((n) => {
              const sub = model.subsurfaces.get(n)!;
              return (
                <li key={n}>
                  <Row name={n} kind="opening" depth={depth + 1} label={short(n, s.name)} icon={sub.category === 'Door' ? <DoorOpen size={13} /> : <AppWindow size={13} />} />
                </li>
              );
            })}
          </ul>
        )}
      </li>
    ));

  const orphans = surfacesOf(undefined);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 p-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input h-9 pl-8 text-sm" placeholder="Buscar elemento…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar elemento" />
        </div>
      </div>
      <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2" aria-label="Elementos do modelo">
        {levels.map((l) => {
          const list = surfacesOf(l.name);
          if (q && !list.some(matches) && !l.name.toUpperCase().includes(q)) return null;
          const open = !collapsed[l.name] || !!q;
          return (
            <li key={l.name} className="mb-1">
              <div className="flex items-center">
                <button type="button" aria-label={open ? 'Recolher' : 'Expandir'} aria-expanded={open} onClick={() => setCollapsed((c) => ({ ...c, [l.name]: open }))} className="p-1 text-slate-400 hover:text-slate-700">
                  <ChevronRight size={14} className={clsx('transition', open && 'rotate-90')} />
                </button>
                <div className="min-w-0 flex-1">
                  <Row name={l.name} kind="zone" depth={0} icon={<Box size={13} />} />
                </div>
              </div>
              {open && <ul>{renderSurfaces(list, 1)}</ul>}
            </li>
          );
        })}
        {orphans.length > 0 && (
          <li>
            <p className="px-2 pt-2 text-[11px] font-semibold uppercase text-slate-400">Sem zona</p>
            <ul>{renderSurfaces(orphans, 0)}</ul>
          </li>
        )}
      </ul>
    </div>
  );
}
