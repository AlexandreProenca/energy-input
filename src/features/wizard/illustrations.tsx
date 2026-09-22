import { useRef } from 'react';
import type { LayerDef, MaterialDef } from '@/templates/constructions/types';
import type { Terrain } from '@/generators/answers';
import type { GlazingTemplate } from '@/templates/glazing/types';
import { fmt } from '@/ui/primitives';

/* Small inline SVG illustrations. Colors are fixed (they depict materials/sky). */

const SKY = '#e6f3fb';
const GROUND = '#cfe3c1';

export function TerrainIllustration({ terrain }: { terrain: Terrain }) {
  const house = (x: number, s = 1, fill = '#187352') => (
    <g transform={`translate(${x} ${52 - 16 * s}) scale(${s})`}>
      <path d="M0 16 V7 L8 0 L16 7 V16 Z" fill={fill} />
      <rect x="6" y="10" width="4" height="6" fill="#f6b73c" />
    </g>
  );
  const tower = (x: number, h: number, w = 10, fill = '#64748b') => <rect x={x} y={52 - h} width={w} height={h} rx="1" fill={fill} />;
  const tree = (x: number) => (
    <g>
      <rect x={x + 3} y="44" width="2" height="8" fill="#8b5e3c" />
      <circle cx={x + 4} cy="41" r="5" fill="#44ab80" />
    </g>
  );
  return (
    <svg viewBox="0 0 120 60" className="h-16 w-full" aria-hidden>
      <rect width="120" height="60" rx="8" fill={terrain === 'Ocean' ? '#dff1fb' : SKY} />
      {terrain === 'Ocean' ? (
        <>
          <rect y="50" width="120" height="10" fill="#7cc4e8" />
          <path d="M0 50 q10 -4 20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke="#fff" strokeWidth="1.5" />
          {house(80, 1.1)}
          <circle cx="24" cy="18" r="7" fill="#f6b73c" />
        </>
      ) : (
        <>
          <rect y="52" width="120" height="8" fill={GROUND} />
          {terrain === 'Country' && (
            <>
              {tree(10)}
              {house(50, 1.1)}
              {tree(95)}
              <circle cx="98" cy="16" r="7" fill="#f6b73c" />
            </>
          )}
          {terrain === 'Suburbs' && (
            <>
              {house(8, 0.9, '#44ab80')}
              {tree(30)}
              {house(44, 1.1)}
              {tree(68)}
              {house(82, 0.9, '#44ab80')}
              {tree(104)}
            </>
          )}
          {terrain === 'City' && (
            <>
              {tower(6, 26)}
              {tower(20, 36, 12, '#475569')}
              {house(38, 1.1)}
              {tower(60, 30)}
              {tower(74, 42, 12, '#475569')}
              {tower(90, 22)}
              {tower(104, 32, 10, '#475569')}
            </>
          )}
          {terrain === 'Urban' && (
            <>
              {tower(4, 44, 12, '#334155')}
              {tower(18, 50, 10)}
              {tower(30, 38, 12, '#334155')}
              {house(46, 1.1)}
              {tower(66, 48, 12, '#334155')}
              {tower(80, 40, 10)}
              {tower(92, 52, 12, '#334155')}
              {tower(106, 36, 10)}
            </>
          )}
        </>
      )}
    </svg>
  );
}

/** Draggable compass dial; `value` is the azimuth (0 = N, clockwise) the arrow points to. */
export function CompassDial({ value, onChange, size = 150 }: { value: number; onChange: (deg: number) => void; size?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const setFromPointer = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    let deg = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
    if (deg < 0) deg += 360;
    onChange(Math.round(deg / 5) * 5 % 360);
  };
  return (
    <svg
      ref={ref}
      viewBox="-60 -60 120 120"
      width={size}
      height={size}
      className="cursor-grab touch-none select-none active:cursor-grabbing"
      role="slider"
      aria-label="Direção da fachada principal"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={value}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange((value + 5) % 360);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange((value + 355) % 360);
      }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        setFromPointer(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && setFromPointer(e)}
    >
      <circle r="56" fill="#fff" stroke="#e2e8f0" strokeWidth="2" />
      {Array.from({ length: 36 }, (_, i) => (
        <line key={i} x1="0" y1={-56} x2="0" y2={i % 9 === 0 ? -48 : -52} stroke="#cbd5e1" strokeWidth={i % 9 === 0 ? 2 : 1} transform={`rotate(${i * 10})`} />
      ))}
      {(['N', 'L', 'S', 'O'] as const).map((l, i) => (
        <text key={l} x={Math.sin((i * Math.PI) / 2) * 40} y={-Math.cos((i * Math.PI) / 2) * 40 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={l === 'N' ? '#dc2626' : '#64748b'}>
          {l}
        </text>
      ))}
      <g transform={`rotate(${value})`}>
        <rect x="-14" y="-10" width="28" height="20" rx="2" fill="#187352" opacity="0.9" />
        <path d="M-8 -10 L0 -30 L8 -10 Z" fill="#f6b73c" />
        <text y="4" textAnchor="middle" fontSize="8" fill="#fff" fontWeight="600">
          frente
        </text>
      </g>
    </svg>
  );
}

const PATTERN_IDS = ['brick', 'concrete', 'insulation', 'tile', 'board', 'air'] as const;

function Patterns() {
  return (
    <defs>
      <pattern id="p-brick" width="10" height="8" patternUnits="userSpaceOnUse">
        <rect width="10" height="8" fill="transparent" />
        <circle cx="5" cy="4" r="1.8" fill="rgba(0,0,0,.18)" />
      </pattern>
      <pattern id="p-concrete" width="8" height="8" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.7" fill="rgba(0,0,0,.25)" />
        <circle cx="6" cy="5" r="0.5" fill="rgba(0,0,0,.2)" />
      </pattern>
      <pattern id="p-insulation" width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M0 4 q2 -4 4 0 t4 0" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="0.8" />
      </pattern>
      <pattern id="p-tile" width="6" height="6" patternUnits="userSpaceOnUse">
        <path d="M0 6 L6 0" stroke="rgba(0,0,0,.15)" strokeWidth="0.8" />
      </pattern>
      <pattern id="p-board" width="4" height="4" patternUnits="userSpaceOnUse">
        <path d="M0 0 L4 4" stroke="rgba(0,0,0,.12)" strokeWidth="0.6" />
      </pattern>
      <pattern id="p-air" width="10" height="10" patternUnits="userSpaceOnUse">
        <circle cx="5" cy="5" r="0.8" fill="rgba(56,130,180,.35)" />
      </pattern>
    </defs>
  );
}

/**
 * Cross-section drawn from the template's real layers (outside on the left).
 * Thin layers get a minimum width so every layer stays visible.
 */
export function AssemblySection({
  layers,
  materials,
  orientation = 'vertical',
  height = 120,
  showLabels = false,
}: {
  layers: LayerDef[];
  materials: Record<string, MaterialDef>;
  orientation?: 'vertical' | 'horizontal';
  height?: number;
  showLabels?: boolean;
}) {
  const thick = layers.map((l) => {
    const m = materials[l.material];
    if (!m) return 0.01;
    return m.kind === 'AirGap' ? 0.05 : l.thickness ?? m.thickness;
  });
  const total = thick.reduce((a, b) => a + b, 0);
  const span = 100;
  const widths = thick.map((t) => Math.max(5, (t / total) * span));
  const scaleW = span / widths.reduce((a, b) => a + b, 0);
  let pos = 0;
  const rects = layers.map((l, i) => {
    const m = materials[l.material];
    const w = widths[i] * scaleW;
    const r = { x: pos, w, m, key: `${l.material}-${i}` };
    pos += w;
    return r;
  });
  const vertical = orientation === 'vertical';
  return (
    <svg viewBox={vertical ? `-14 0 128 ${height}` : `0 -12 ${height} 124`} className="w-full" style={{ maxHeight: height }} aria-hidden>
      <Patterns />
      {rects.map(({ x, w, m, key }) => {
        const pattern = m && 'pattern' in m && m.pattern && PATTERN_IDS.includes(m.pattern) ? `url(#p-${m.pattern})` : undefined;
        const common = vertical ? { x, y: 0, width: w, height } : { x: 0, y: x, width: height, height: w };
        return (
          <g key={key}>
            <rect {...common} fill={m?.color ?? '#ddd'} stroke="#fff" strokeWidth="0.6" />
            {pattern && <rect {...common} fill={pattern} />}
          </g>
        );
      })}
      {vertical ? (
        <>
          <text x="-7" y={height / 2} fontSize="7" fill="#64748b" textAnchor="middle" transform={`rotate(-90 -7 ${height / 2})`}>
            exterior
          </text>
          <text x="107" y={height / 2} fontSize="7" fill="#64748b" textAnchor="middle" transform={`rotate(90 107 ${height / 2})`}>
            interior
          </text>
        </>
      ) : (
        <>
          <text x={height / 2} y="-4" fontSize="7" fill="#64748b" textAnchor="middle">
            {showLabels ? 'exterior (acima)' : 'exterior'}
          </text>
          <text x={height / 2} y="110" fontSize="7" fill="#64748b" textAnchor="middle">
            interior
          </text>
        </>
      )}
    </svg>
  );
}

export function GlazingIllustration({ g }: { g: GlazingTemplate }) {
  const glass = g.tint === 'reflective' ? '#8fb3c9' : g.tint === 'lowe' ? '#b9e0d2' : '#d6ecf8';
  return (
    <svg viewBox="0 0 80 60" className="h-14 w-full" aria-hidden>
      <rect x="18" y="4" width="44" height="52" rx="2" fill={g.frame === 'PVC' ? '#f1f5f9' : '#94a3b8'} stroke="#94a3b8" />
      {g.panes === 1 ? (
        <rect x="36" y="8" width="8" height="44" fill={glass} stroke="#64748b" strokeWidth="0.8" />
      ) : (
        <>
          <rect x="30" y="8" width="6" height="44" fill={glass} stroke="#64748b" strokeWidth="0.8" />
          <rect x="36" y="8" width="8" height="44" fill="#f8fafc" />
          <rect x="44" y="8" width="6" height="44" fill={glass} stroke="#64748b" strokeWidth="0.8" />
          {g.tint === 'lowe' && <line x1="44.5" y1="8" x2="44.5" y2="52" stroke="#187352" strokeWidth="1.2" strokeDasharray="2 2" />}
        </>
      )}
      <path d="M4 16 L16 26" stroke="#f6b73c" strokeWidth="2" strokeLinecap="round" />
      <path d="M62 36 L76 46" stroke="#f6b73c" strokeWidth={Math.max(0.5, g.shgc * 3)} strokeLinecap="round" opacity={0.3 + g.shgc * 0.7} />
    </svg>
  );
}

/** Facade elevation with a centered window sized for the WWR. */
export function FacadeWwr({ wwr, label, width = 10, height = 3 }: { wwr: number; label?: string; width?: number; height?: number }) {
  const W = 100;
  const H = Math.max(20, Math.min(60, (W * height) / width));
  const area = Math.min(wwr, 95) / 100 * W * H;
  let wh = H * 0.5;
  let ww = area / wh;
  if (ww > W - 6) {
    ww = W - 6;
    wh = Math.min(H - 4, area / ww);
  }
  return (
    <svg viewBox={`0 0 ${W} ${H + (label ? 12 : 0)}`} className="w-full" aria-hidden>
      <rect width={W} height={H} rx="2" fill="#f1e9dc" stroke="#d6c8b3" />
      {wwr > 0 && <rect x={(W - ww) / 2} y={Math.max(2, H - wh - H * 0.3)} width={ww} height={wh} fill="#bfe1f5" stroke="#5b9bc0" strokeWidth="1" />}
      {label && (
        <text x={W / 2} y={H + 10} textAnchor="middle" fontSize="8" fill="#475569" fontWeight="600">
          {label}
        </text>
      )}
    </svg>
  );
}

export function MonthlyTempChart({ values }: { values: number[] }) {
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const min = Math.min(10, ...values);
  const max = Math.max(30, ...values);
  const color = (t: number) => (t >= 26 ? '#ef6c35' : t >= 22 ? '#f6b73c' : t >= 18 ? '#77c8a4' : '#5b9bc0');
  return (
    <svg viewBox="0 0 240 90" className="w-full" role="img" aria-label="Temperatura média mensal">
      {values.map((v, i) => {
        const h = ((v - min) / (max - min)) * 60 + 4;
        const x = 6 + i * 19.5;
        return (
          <g key={i}>
            <rect x={x} y={70 - h} width="14" height={h} rx="3" fill={color(v)}>
              <title>{`${fmt(v)} °C`}</title>
            </rect>
            <text x={x + 7} y={67 - h} fontSize="7" textAnchor="middle" fill="#475569">
              {Math.round(v)}°
            </text>
            <text x={x + 7} y="84" fontSize="8" textAnchor="middle" fill="#94a3b8">
              {months[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 7×24 heatmap for a schedule. */
export function WeeklyHeatmap({ profile, color = '#187352' }: { profile: number[][]; color?: string }) {
  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  return (
    <svg viewBox="0 0 270 96" className="w-full" role="img" aria-label="Perfil semanal por hora">
      {profile.map((hours, d) => (
        <g key={d}>
          <text x="0" y={d * 12 + 9} fontSize="7" fill="#64748b">
            {days[d]}
          </text>
          {hours.map((v, h) => (
            <rect key={h} x={22 + h * 10.3} y={d * 12} width="9.5" height="10.5" rx="1.5" fill={color} opacity={0.08 + v * 0.92}>
              <title>{`${days[d]} ${h}h–${h + 1}h: ${Math.round(v * 100)}%`}</title>
            </rect>
          ))}
        </g>
      ))}
      {[0, 6, 12, 18, 24].map((h) => (
        <text key={h} x={22 + h * 10.3} y="94" fontSize="7" fill="#94a3b8" textAnchor="middle">
          {h}h
        </text>
      ))}
    </svg>
  );
}

export function YearBar({ begin, end, mode }: { begin: [number, number]; end: [number, number]; mode: 'year' | 'range' | 'designDays' }) {
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const doy = ([m, d]: [number, number]) => DAYS.slice(0, m - 1).reduce((a, b) => a + b, 0) + d;
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const x = (day: number) => (day / 365) * 300;
  const b = mode === 'year' ? 1 : doy(begin);
  const e = mode === 'year' ? 365 : doy(end);
  return (
    <svg viewBox="0 0 300 34" className="w-full" aria-hidden>
      <rect y="4" width="300" height="14" rx="7" fill="#e2e8f0" />
      {mode !== 'designDays' &&
        (b <= e ? (
          <rect x={x(b - 1)} y="4" width={Math.max(3, x(e) - x(b - 1))} height="14" rx="7" fill="#248f66" />
        ) : (
          <>
            <rect x="0" y="4" width={x(e)} height="14" rx="7" fill="#248f66" />
            <rect x={x(b - 1)} y="4" width={300 - x(b - 1)} height="14" rx="7" fill="#248f66" />
          </>
        ))}
      {months.map((m, i) => (
        <text key={m} x={x(DAYS.slice(0, i).reduce((a, c) => a + c, 0) + 15)} y="30" fontSize="7" textAnchor="middle" fill="#94a3b8">
          {m}
        </text>
      ))}
    </svg>
  );
}

export function GroundFloorIllustration({ kind }: { kind: 'slab' | 'raised' | 'adjacent' }) {
  if (kind === 'adjacent') return <svg viewBox="0 0 120 64" className="h-16 w-full" aria-hidden>
    <rect width="120" height="64" rx="8" fill={SKY} />
    <rect x="25" y="6" width="70" height="52" fill="#f1e9dc" stroke="#94a3b8" />
    <rect x="23" y="29" width="74" height="6" fill="#64748b" />
    <rect x="35" y="12" width="16" height="12" fill="#b9ddec" /><rect x="69" y="40" width="16" height="12" fill="#b9ddec" />
  </svg>;
  return (
    <svg viewBox="0 0 120 64" className="h-16 w-full" aria-hidden>
      <rect width="120" height="64" rx="8" fill={SKY} />
      <rect y={kind === 'slab' ? 44 : 52} width="120" height="20" fill="#b99a72" />
      <path d="M0 52 H120" stroke="#8b6f4e" />
      {kind === 'slab' ? (
        <>
          <rect x="30" y="18" width="60" height="26" fill="#f1e9dc" stroke="#94a3b8" />
          <rect x="28" y="42" width="64" height="4" fill="#64748b" />
          <path d="M34 50 h52" stroke="#187352" strokeWidth="2" strokeDasharray="3 2" />
        </>
      ) : (
        <>
          <rect x="30" y="12" width="60" height="26" fill="#f1e9dc" stroke="#94a3b8" />
          <rect x="28" y="36" width="64" height="4" fill="#64748b" />
          <rect x="32" y="40" width="4" height="12" fill="#64748b" />
          <rect x="84" y="40" width="4" height="12" fill="#64748b" />
          <path d="M40 46 q6 -3 12 0 t12 0 t12 0" stroke="#5b9bc0" fill="none" />
        </>
      )}
    </svg>
  );
}
