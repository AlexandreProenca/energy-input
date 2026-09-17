import { useRef, useState } from 'react';
import type { Rect2 } from '@/core/geometry/frames';
import { checkOpening, clampRect } from '@/core/geometry/edits';
import type { GeometryModel, SurfaceGeom } from '@/core/geometry/model';
import { fmt } from '@/ui/primitives';

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

const SNAP = 0.05;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

/**
 * Wall seen from outside with its windows/doors. Openings can be dragged and
 * resized by their corners (5 cm snap); the change is committed on release.
 */
export function WallElevation({
  model,
  wall,
  selected,
  onSelect,
  onCommit,
}: {
  model: GeometryModel;
  wall: SurfaceGeom;
  selected?: string;
  onSelect: (name: string) => void;
  onCommit: (name: string, rect: Rect2) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ name: string; mode: DragMode; start: [number, number]; rect: Rect2; current: Rect2 }>();
  const base = wall.rect!;
  const pad = Math.max(base.width, base.height) * 0.08 + 0.3;
  const vb = { x: base.x - pad, y: -(base.y + base.height) - pad, w: base.width + pad * 2, h: base.height + pad * 2 };
  const Y = (y: number) => -y; // SVG y grows downwards
  const font = Math.max(base.width, base.height) * 0.035;

  const toWall = (e: React.PointerEvent): [number, number] => {
    const pt = svg.current!.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return [p.x, -p.y];
  };

  const begin = (name: string, mode: DragMode, rect: Rect2) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    onSelect(name);
    setDrag({ name, mode, start: toWall(e), rect, current: rect });
  };

  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const [x, y] = toWall(e);
    const dx = snap(x - drag.start[0]);
    const dy = snap(y - drag.start[1]);
    const r = drag.rect;
    const round = (n: number) => Math.round(n * 1000) / 1000;
    let c: Rect2;
    if (drag.mode === 'move') {
      c = clampRect(base, { ...r, x: r.x + dx, y: r.y + dy });
    } else {
      // Resize by moving edges, clipped to the wall and to a 10 cm minimum.
      let left = r.x;
      let right = r.x + r.width;
      let bottom = r.y;
      let top = r.y + r.height;
      if (drag.mode.endsWith('w')) left = Math.min(Math.max(base.x, left + dx), right - 0.1);
      else right = Math.max(Math.min(base.x + base.width, right + dx), left + 0.1);
      if (drag.mode.startsWith('n')) top = Math.max(Math.min(base.y + base.height, top + dy), bottom + 0.1);
      else bottom = Math.min(Math.max(base.y, bottom + dy), top - 0.1);
      c = { x: left, y: bottom, width: right - left, height: top - bottom };
    }
    setDrag({ ...drag, current: { x: round(c.x), y: round(c.y), width: round(c.width), height: round(c.height) } });
  };

  const end = () => {
    if (!drag) return;
    const { name, rect, current } = drag;
    setDrag(undefined);
    if (current.x !== rect.x || current.y !== rect.y || current.width !== rect.width || current.height !== rect.height) onCommit(name, current);
  };

  const openings = wall.subsurfaces.map((n) => model.subsurfaces.get(n)!).filter((s) => s?.rect);
  const selRect = drag?.name === selected ? drag?.current : openings.find((o) => o.name === selected)?.rect;

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-sky-50 to-white">
      <svg
        ref={svg}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="w-full touch-none select-none"
        style={{ maxHeight: 280 }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        role="img"
        aria-label={`Elevação de ${wall.name}, vista de fora`}
      >
        <rect x={base.x - pad} y={Y(base.y) - 0.02} width={base.width + pad * 2} height={pad} fill="#dfeedd" />
        <rect x={base.x} y={Y(base.y + base.height)} width={base.width} height={base.height} fill="#efe6d8" stroke="#94a3b8" strokeWidth={font * 0.08} />
        {openings.map((o) => {
          const r = drag?.name === o.name ? drag.current : o.rect!;
          const isSel = o.name === selected;
          const problems = checkOpening(model, wall, r, o.name);
          const door = o.category === 'Door';
          const h = font * 0.35;
          return (
            <g key={o.name}>
              <rect
                x={r.x}
                y={Y(r.y + r.height)}
                width={r.width}
                height={r.height}
                fill={door ? '#a8743f' : '#bfe1f5'}
                fillOpacity={door ? 0.9 : 0.85}
                stroke={problems.length ? '#dc2626' : isSel ? '#d97706' : door ? '#6b4423' : '#3b82b6'}
                strokeWidth={font * (isSel ? 0.14 : 0.08)}
                className="cursor-move"
                onPointerDown={begin(o.name, 'move', o.rect!)}
              >
                <title>{`${o.name}${problems.length ? ` — ${problems.join(' ')}` : ''}`}</title>
              </rect>
              {!door && <line x1={r.x + r.width / 2} y1={Y(r.y)} x2={r.x + r.width / 2} y2={Y(r.y + r.height)} stroke="#3b82b6" strokeWidth={font * 0.04} pointerEvents="none" />}
              {isSel &&
                (['nw', 'ne', 'sw', 'se'] as DragMode[]).map((m) => {
                  const cx = m.endsWith('w') ? r.x : r.x + r.width;
                  const cy = m.startsWith('n') ? r.y + r.height : r.y;
                  return (
                    <rect
                      key={m}
                      x={cx - h / 2}
                      y={Y(cy) - h / 2}
                      width={h}
                      height={h}
                      fill="#fff"
                      stroke="#d97706"
                      strokeWidth={font * 0.08}
                      className={m === 'nw' || m === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}
                      onPointerDown={begin(o.name, m, o.rect!)}
                    />
                  );
                })}
            </g>
          );
        })}
        {selRect && (
          <g fontSize={font} fill="#92400e" pointerEvents="none">
            <line x1={base.x} y1={Y(base.y) + font * 0.9} x2={selRect.x} y2={Y(base.y) + font * 0.9} stroke="#d97706" strokeWidth={font * 0.05} strokeDasharray={`${font * 0.3} ${font * 0.2}`} />
            <text x={(base.x + selRect.x) / 2} y={Y(base.y) + font * 2} textAnchor="middle">
              {fmt(selRect.x - base.x, 2)} m
            </text>
            <text x={selRect.x + selRect.width / 2} y={Y(selRect.y + selRect.height) - font * 0.4} textAnchor="middle">
              {fmt(selRect.width, 2)} × {fmt(selRect.height, 2)} m
            </text>
            {selRect.y - base.y > 0.01 && (
              <>
                <line x1={selRect.x + selRect.width + font * 0.6} y1={Y(base.y)} x2={selRect.x + selRect.width + font * 0.6} y2={Y(selRect.y)} stroke="#d97706" strokeWidth={font * 0.05} />
                <text x={selRect.x + selRect.width + font * 0.9} y={Y((base.y + selRect.y) / 2) + font * 0.35}>
                  {fmt(selRect.y - base.y, 2)} m
                </text>
              </>
            )}
          </g>
        )}
        <text x={base.x} y={Y(base.y + base.height) - font * 0.5} fontSize={font} fill="#64748b">
          {fmt(base.width, 2)} × {fmt(base.height, 2)} m · vista de fora
        </text>
      </svg>
    </div>
  );
}
