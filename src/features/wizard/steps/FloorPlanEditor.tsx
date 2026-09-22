import { useRef, useState } from 'react';
import { PLAN_SHAPES, shapePoints, snapCoordinate, type PlanShape } from './planShapes';
import { Button, Callout, Field, fmt } from '@/ui/primitives';
import { NumberInput } from '@/ui/NumberInput';
import { distance, perimeter, roomArea, validateRooms, type PlanRoom, type Point2 } from '@/generators/geometry/floorPlan';

interface PlanSnapshot { rooms: PlanRoom[]; activeId?: string }

export function FloorPlanEditor({ rooms, onChange }: { rooms: PlanRoom[]; onChange: (rooms: PlanRoom[]) => void }) {
  const [working, setWorking] = useState<PlanRoom[]>();
  const [activeId, setActiveId] = useState<string>();
  const plan = working ?? rooms;
  const draft = plan.find(r => r.id === activeId);
  const snapshot = (): PlanSnapshot => structuredClone({ rooms: plan, activeId });
  const setDraft = (room: PlanRoom) => {
    setWorking(prev => {
      const list = prev ?? rooms;
      return list.some(r => r.id === room.id) ? list.map(r => r.id === room.id ? room : r) : [...list, room];
    });
    setActiveId(room.id);
  };
  const [point, setPoint] = useState<Point2>([0, 0]);
  const [snap, setSnap] = useState(0.1);
  const [span, setSpan] = useState(20);
  const [origin, setOrigin] = useState<Point2>([-2, -2]);
  const [error, setError] = useState('');
  const [tool, setTool] = useState<'select' | 'draw' | 'pan'>('select');
  const [selected, setSelected] = useState<number>();
  const [selectedEdge, setSelectedEdge] = useState<number>();
  const [shapeWidth, setShapeWidth] = useState(4);
  const [shapeHeight, setShapeHeight] = useState(3);
  const [dropPreview, setDropPreview] = useState<Point2[]>();
  const [past, setPast] = useState<PlanSnapshot[]>([]);
  const [future, setFuture] = useState<PlanSnapshot[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const paletteShape = useRef<PlanShape>();
  const gesture = useRef<{ start: Point2; before?: PlanRoom; snapshot?: PlanSnapshot; vertex?: number; edge?: number; pan?: Point2; pointerId: number }>();
  const suppressClick = useRef(false);
  const clearSelection = () => { setSelected(undefined); setSelectedEdge(undefined); };
  const reset = () => { setWorking(undefined); setActiveId(undefined); clearSelection(); setPast([]); setFuture([]); setError(''); setTool('select'); };
  const begin = (room: PlanRoom, mode: 'select' | 'draw' = 'select') => {
    if (!plan.some(r => r.id === room.id)) { setPast(p => [...p, snapshot()]); setFuture([]); }
    setDraft(structuredClone(room)); setTool(mode); clearSelection(); setError('');
  };
  const change = (room: PlanRoom) => {
    setPast(p => [...p, snapshot()]); setFuture([]); setDraft(room); setError('');
  };
  const restore = (state: PlanSnapshot) => {
    setWorking(state.rooms); setActiveId(state.activeId); clearSelection(); setError('');
  };
  const undo = () => {
    if (!past.length) return;
    setFuture(f => [...f, snapshot()]); restore(past[past.length - 1]); setPast(p => p.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setPast(p => [...p, snapshot()]); restore(future[future.length - 1]); setFuture(f => f.slice(0, -1));
  };
  const removeRoom = (id: string) => {
    if (plan.length <= 1) return;
    setPast(p => [...p, snapshot()]); setFuture([]); setWorking(plan.filter(r => r.id !== id));
    if (activeId === id) { setActiveId(undefined); clearSelection(); }
    setError('');
  };
  const cursorPoint = (clientX: number, clientY: number, bounded = false): Point2 | undefined => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    if (bounded && (p.x < 40 || p.x > 640 || p.y < 40 || p.y > 640)) return;
    return [origin[0] + (p.x - 40) / 600 * span, origin[1] + (640 - p.y) / 600 * span];
  };
  const snapped = (p: Point2): Point2 => p.map(v => Math.max(-500, Math.min(500, snapCoordinate(v, snap)))) as Point2;
  const newRoomName = () => {
    let n = plan.length + 1;
    while (plan.some(r => r.name === `Ambiente ${n}`)) n++;
    return `Ambiente ${n}`;
  };
  const insertShape = (shape: PlanShape, anchor: Point2) => {
    begin({ id: crypto.randomUUID(), name: newRoomName(), points: shapePoints(shape, snapped(anchor), shapeWidth, shapeHeight) });
    setDropPreview(undefined);
  };
  const startDrag = (e: React.PointerEvent, room: PlanRoom, vertex?: number, edge?: number) => {
    if (tool === 'pan') return;
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const start = cursorPoint(e.clientX, e.clientY);
    if (!start) return;
    if (draft?.id !== room.id) begin(room);
    setSelectedEdge(edge); setSelected(vertex); setTool('select');
    gesture.current = { start, before: structuredClone(room), snapshot: snapshot(), vertex, edge, pointerId: e.pointerId };
    suppressClick.current = true;
    svgRef.current?.setPointerCapture(e.pointerId); svgRef.current?.focus({ preventScroll: true });
  };
  const endDrag = (cancel = false) => {
    const g = gesture.current;
    if (!g) return;
    if (cancel && g.pan) setOrigin(g.pan);
    if (g.before) {
      if (cancel) setDraft(g.before);
      else if (draft && JSON.stringify(draft.points) !== JSON.stringify(g.before.points)) {
        setPast(p => [...p, g.snapshot!]); setFuture([]);
      }
    }
    gesture.current = undefined;
    if (svgRef.current?.hasPointerCapture(g.pointerId)) svgRef.current.releasePointerCapture(g.pointerId);
  };
  const x = (v: number) => 40 + (v - origin[0]) / span * 600;
  const y = (v: number) => 640 - (v - origin[1]) / span * 600;
  const current = draft?.points ?? [];
  const visible = plan.filter(r => r.id !== draft?.id);
  const add = (p: Point2) => { if (draft) { change({ ...draft, points: [...current, p] }); setSelectedEdge(undefined); setSelected(current.length); } };
  const save = () => {
    const next = plan;
    const errors = validateRooms(next);
    if (errors.length) { setError(errors.join(' ')); return; }
    onChange(next); reset();
  };
  const frame = () => {
    const pts = plan.flatMap(r => r.points);
    if (!pts.length) return;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const size = Math.max(5, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 4;
    setOrigin([Math.min(...xs) - 2, Math.min(...ys) - 2]); setSpan(size);
  };
  return <div className="space-y-4" onKeyDown={e => {
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endDrag(true); clearSelection(); return; }
    if (working && (e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) {
      e.preventDefault(); e.stopPropagation();
      if (e.shiftKey || e.key.toLowerCase() === 'y') redo(); else undo();
    }
    if (!draft) return;
    if (selected !== undefined && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault(); e.stopPropagation(); change({ ...draft, points: current.filter((_, i) => i !== selected) }); clearSelection();
    }
    const delta: Record<string, Point2> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (delta[e.key] && (selected !== undefined || selectedEdge !== undefined)) {
      e.preventDefault(); e.stopPropagation();
      const [dx, dy] = delta[e.key], step = snap * (e.shiftKey ? 10 : 1);
      change({ ...draft, points: current.map((p, i) => (selectedEdge !== undefined ? i === selectedEdge || i === (selectedEdge + 1) % current.length : i === selected) ? [Number((p[0] + dx * step).toFixed(4)), Number((p[1] + dy * step).toFixed(4))] : p) });
    }
  }}>
    <Callout>Arraste uma figura para a planta ou desenhe um contorno por pontos. Selecione qualquer ambiente, ponto ou linha, mesmo durante outra edição. Arrastar uma linha move seus dois extremos para redimensionar o ambiente. X cresce para leste e Y para norte, antes da rotação do edifício. O contorno define a área geométrica de piso; a espessura dos materiais não altera essa área.</Callout>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => { begin({ id: crypto.randomUUID(), name: newRoomName(), points: [] }, 'draw'); }}>Desenhar ambiente</Button>
      {(['select', 'draw', 'pan'] as const).map(mode => <Button key={mode} aria-pressed={tool === mode} disabled={mode === 'draw' && !draft} variant={tool === mode ? 'primary' : 'secondary'} onClick={() => setTool(mode)}>{mode === 'select' ? 'Selecionar / mover' : mode === 'draw' ? 'Adicionar pontos' : 'Mover vista'}</Button>)}
      <Button onClick={frame}>Enquadrar planta</Button>
      <Button aria-label="Aproximar planta" onClick={() => { setOrigin([origin[0] + span / 8, origin[1] + span / 8]); setSpan(Math.max(1, span * 0.75)); }}>Zoom +</Button>
      <Button aria-label="Afastar planta" onClick={() => { setOrigin([origin[0] - span / 6, origin[1] - span / 6]); setSpan(Math.min(1100, span * 4 / 3)); }}>Zoom −</Button>
      <Button disabled={!past.length} onClick={undo}>Desfazer edição</Button>
      <Button disabled={!future.length} onClick={redo}>Refazer edição</Button>
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-sm font-medium">Figuras geométricas · arraste para a planta ou clique para inserir no centro da vista</p>
      <div className="flex flex-wrap items-end gap-2">
        {PLAN_SHAPES.map(shape => <button key={shape.id} type="button" draggable aria-label={`Inserir ${shape.label}`} className="flex min-w-24 cursor-grab flex-col items-center rounded-lg border px-3 py-2 text-sm hover:border-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40" onDragStart={e => { paletteShape.current = shape.id; e.dataTransfer.setData('application/x-energy-plan-shape', shape.id); e.dataTransfer.effectAllowed = 'copy'; }} onDragEnd={() => { paletteShape.current = undefined; setDropPreview(undefined); }} onClick={() => insertShape(shape.id, [origin[0] + (span - shapeWidth) / 2, origin[1] + (span - (shape.id === 'square' ? shapeWidth : shapeHeight)) / 2])}>
          <span aria-hidden="true" className="text-2xl text-brand-700">{shape.icon}</span>{shape.label}
        </button>)}
        <div className="w-28"><Field label="Largura (m)"><NumberInput aria-label="Largura da figura" value={shapeWidth} min={0.1} max={500} onValue={v => v !== undefined && setShapeWidth(v)} /></Field></div>
        <div className="w-28"><Field label="Altura (m)"><NumberInput aria-label="Altura da figura" value={shapeHeight} min={0.1} max={500} onValue={v => v !== undefined && setShapeHeight(v)} /></Field></div>
      </div>
      <p className="mt-2 text-xs text-slate-500">O quadrado usa a largura como lado. Você pode inserir várias figuras e alternar entre elas antes de salvar a planta.</p>
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Grade (m)"><NumberInput aria-label="Passo da grade" value={snap} min={0.01} max={10} onValue={v => v !== undefined && setSnap(v)} /></Field>
          <Field label="Vista (m)"><NumberInput aria-label="Largura da vista" value={span} min={1} max={1100} onValue={v => v !== undefined && setSpan(v)} /></Field>
          <Field label="Origem X"><NumberInput aria-label="Origem X da vista" value={origin[0]} onValue={v => v !== undefined && setOrigin([v, origin[1]])} /></Field>
          <Field label="Origem Y"><NumberInput aria-label="Origem Y da vista" value={origin[1]} onValue={v => v !== undefined && setOrigin([origin[0], v])} /></Field>
        </div>
        <svg ref={svgRef} tabIndex={0} viewBox="0 0 680 680" className={`w-full touch-none rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-brand-500 ${tool === 'pan' ? 'cursor-grab' : tool === 'draw' ? 'cursor-crosshair' : ''}`} role="group" aria-label="Planta baixa dos ambientes em coordenadas X e Y"
          onDragOver={e => {
            if (!paletteShape.current) return;
            e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
            const p = cursorPoint(e.clientX, e.clientY, true);
            setDropPreview(p ? shapePoints(paletteShape.current, snapped(p), shapeWidth, shapeHeight) : undefined);
          }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropPreview(undefined); }}
          onDrop={e => {
            e.preventDefault(); setDropPreview(undefined);
            const shape = e.dataTransfer.getData('application/x-energy-plan-shape');
            const p = cursorPoint(e.clientX, e.clientY, true);
            if (p && PLAN_SHAPES.some(s => s.id === shape)) insertShape(shape as PlanShape, p);
          }}
          onPointerDown={e => {
            suppressClick.current = false;
            if (e.button !== 0 || tool !== 'pan') return;
            const start = cursorPoint(e.clientX, e.clientY);
            if (!start) return;
            gesture.current = { start, pan: [...origin], pointerId: e.pointerId };
            e.currentTarget.setPointerCapture(e.pointerId); suppressClick.current = true;
          }}
          onPointerMove={e => {
            const g = gesture.current;
            if (!g) return;
            const p = cursorPoint(e.clientX, e.clientY);
            if (!p) return;
            if (g.pan) { setOrigin([origin[0] + g.start[0] - p[0], origin[1] + g.start[1] - p[1]]); return; }
            if (!g.before) return;
            const dx = snapCoordinate(p[0] - g.start[0], snap), dy = snapCoordinate(p[1] - g.start[1], snap);
            setDraft({ ...g.before, points: g.before.points.map((v, i) => (g.edge !== undefined ? i === g.edge || i === (g.edge + 1) % g.before!.points.length : g.vertex === undefined) ? [Number((v[0] + dx).toFixed(4)), Number((v[1] + dy).toFixed(4))] : i === g.vertex ? snapped(p) : v) }); setError('');
          }}
          onPointerUp={() => endDrag()}
          onPointerCancel={() => endDrag(true)}
          onClick={e => {
            if (suppressClick.current) { suppressClick.current = false; return; }
            if (!draft || tool !== 'draw') { clearSelection(); return; }
            const p = cursorPoint(e.clientX, e.clientY, true);
            if (p) add(snapped(p));
          }}>
          <defs><clipPath id="plan-clip"><rect x="40" y="40" width="600" height="600" /></clipPath></defs>
          {Array.from({ length: 11 }, (_, i) => <g key={i}>
            <path d={`M ${40 + i * 60} 40 V 640 M 40 ${40 + i * 60} H 640`} stroke="#e2e8f0" />
            <text x={40 + i * 60} y="660" fontSize="10" textAnchor="middle" fill="#64748b">{fmt(origin[0] + i * span / 10, 1)}</text>
            <text x="34" y={644 - i * 60} fontSize="10" textAnchor="end" fill="#64748b">{fmt(origin[1] + i * span / 10, 1)}</text>
          </g>)}
          <text x="610" y="678" fontSize="12">X (m) →</text><text x="40" y="22" fontSize="12">Y (m) ↑ Norte</text>
          <g clipPath="url(#plan-clip)">
            <path d={`M ${x(0)} 40 V 640 M 40 ${y(0)} H 640`} stroke="#94a3b8" strokeWidth="2" />
            {dropPreview && <polygon pointerEvents="none" points={dropPreview.map(p => `${x(p[0])},${y(p[1])}`).join(' ')} fill="#bbf7d0" fillOpacity="0.6" stroke="#187352" strokeWidth="2" strokeDasharray="6 4" />}
            {[...visible, ...(draft ? [draft] : [])].map(r => <g key={r.id}>
              {r.points.length >= 3 && <polygon points={r.points.map(p => `${x(p[0])},${y(p[1])}`).join(' ')} fill={r.id === draft?.id ? '#fef3c7' : '#d5efe2'} fillOpacity="0.75" stroke={r.id === draft?.id ? '#b45309' : '#187352'} strokeWidth="2" strokeDasharray={r.id === draft?.id && tool === 'draw' ? '6 4' : undefined} className={tool === 'select' ? 'cursor-move' : ''} onPointerDown={e => { if (tool === 'select') startDrag(e, r); }} />}
              {r.points.length < 3 && <polyline points={r.points.map(p => `${x(p[0])},${y(p[1])}`).join(' ')} fill="none" stroke="#b45309" strokeWidth="2" />}
            </g>)}
            {[...visible, ...(draft ? [draft] : [])].map(r => <g key={`edges-${r.id}`}>
              {r.points.map((p, i) => {
                if (r.points.length < 2 || (r.points.length === 2 && i === 1)) return null;
                const next = r.points[(i + 1) % r.points.length];
                const active = r.id === activeId && selectedEdge === i;
                return <g key={i}>
                  <line x1={x(p[0])} y1={y(p[1])} x2={x(next[0])} y2={y(next[1])} stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke" pointerEvents="stroke" className="cursor-move" role="button" tabIndex={0} aria-label={`${r.name}, linha ${i + 1}`} aria-pressed={active}
                    onPointerDown={e => { if (tool === 'select') startDrag(e, r, undefined, i); }}
                    onClick={e => { if (tool === 'select') { e.stopPropagation(); suppressClick.current = false; } }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (draft?.id !== r.id) begin(r); setSelected(undefined); setSelectedEdge(i); setTool('select'); } }} />
                  {active && <line pointerEvents="none" x1={x(p[0])} y1={y(p[1])} x2={x(next[0])} y2={y(next[1])} stroke="#2563eb" strokeWidth="4" vectorEffect="non-scaling-stroke" />}
                  {active && <rect pointerEvents="none" x={(x(p[0]) + x(next[0])) / 2 - 5} y={(y(p[1]) + y(next[1])) / 2 - 5} width="10" height="10" fill="white" stroke="#2563eb" strokeWidth="2" />}
                </g>;
              })}
            </g>)}
            {[...visible, ...(draft ? [draft] : [])].map(r => <g key={`vertices-${r.id}`}>
              {r.points.map((p, i) => { const next = r.points[(i + 1) % r.points.length]; return <g key={i}>
                <circle cx={x(p[0])} cy={y(p[1])} r={r.id === draft?.id && selected === i ? 8 : 6} fill={r.id === draft?.id && selected === i ? '#2563eb' : 'white'} stroke={r.id === draft?.id ? '#b45309' : '#187352'} strokeWidth="2" className="cursor-move" role="button" tabIndex={0} aria-label={`${r.name}, ponto ${i + 1}`} aria-pressed={r.id === draft?.id && selected === i} onPointerDown={e => startDrag(e, r, i)} onClick={e => { e.stopPropagation(); suppressClick.current = false; }} onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (draft?.id !== r.id) begin(r); setSelectedEdge(undefined); setSelected(i); setTool('select'); }
                }} />
                {r.id === draft?.id && <text pointerEvents="none" x={x(p[0]) + 9} y={y(p[1]) - 7} fontSize="12">P{i + 1}</text>}
                {r.points.length > 1 && <text pointerEvents="none" x={(x(p[0]) + x(next[0])) / 2} y={(y(p[1]) + y(next[1])) / 2 - 7} textAnchor="middle" fontSize="11" fill="#334155" stroke="#f8fafc" strokeWidth="3" paintOrder="stroke">{fmt(distance(p, next), 2)} m</text>}
              </g>; })}
              {r.id !== draft?.id && r.points.length > 0 && <text pointerEvents="none" x={x(r.points[0][0]) + 8} y={y(r.points[0][1]) - 18} fontSize="12" fill="#0f3d2e">{r.name} · {fmt(roomArea(r.points), 2)} m²</text>}
            </g>)}
          </g>
        </svg>
        <p className="text-xs text-slate-500">Arraste pontos, linhas ou o interior de qualquer ambiente. As linhas movem os dois extremos; o interior move o ambiente inteiro. Ajuste à grade: {fmt(snap, 2)} m. Setas movem o ponto ou a linha selecionada; Shift multiplica o passo por 10; Delete remove o ponto; Esc cancela o arraste. A malha visual tem divisões de {fmt(span / 10, 2)} m. Use coordenadas para informar medidas exatas.</p>
      </div>
      <div className="space-y-3">
        {draft ? <>
          <Field label="Nome do ambiente"><input className="input" aria-label="Nome do ambiente" value={draft.name} onChange={e => change({ ...draft, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="X (m)"><NumberInput aria-label="X do novo ponto" value={point[0]} min={-500} max={500} onValue={v => v !== undefined && setPoint([v, point[1]])} /></Field><Field label="Y (m)"><NumberInput aria-label="Y do novo ponto" value={point[1]} min={-500} max={500} onValue={v => v !== undefined && setPoint([point[0], v])} /></Field></div>
          <Button onClick={() => add(point)}>Adicionar ponto</Button>
          <ol className="max-h-72 space-y-2 overflow-y-auto">{current.map((p, i) => <li key={i} className="grid grid-cols-[24px_1fr_1fr_24px] items-center gap-1 text-xs"><button aria-label={`Selecionar P${i + 1}`} aria-pressed={selected === i} className={selected === i ? "rounded bg-blue-100 font-bold text-blue-700" : "rounded hover:bg-slate-100"} onClick={() => { setSelectedEdge(undefined); setSelected(i); setTool('select'); svgRef.current?.focus({ preventScroll: true }); }}>P{i + 1}</button>{([0, 1] as const).map(axis => <NumberInput key={axis} aria-label={`P${i + 1} ${axis === 0 ? 'X' : 'Y'}`} value={p[axis]} min={-500} max={500} onValue={v => { if (v !== undefined) change({ ...draft, points: current.map((q, j) => j === i ? (axis === 0 ? [v, q[1]] : [q[0], v]) : q) }); }} />)}<button aria-label={`Remover P${i + 1}`} onClick={() => { change({ ...draft, points: current.filter((_, j) => j !== i) }); clearSelection(); }}>×</button></li>)}</ol>
          {current.length >= 3 && <details className="rounded-lg border p-2 text-xs">
            <summary className="cursor-pointer font-medium">Selecionar linhas do ambiente</summary>
            <div className="mt-2 flex flex-wrap gap-1">{current.map((p, i) => <button key={i} aria-label={`Selecionar linha ${i + 1}`} aria-pressed={selectedEdge === i} className={`rounded border px-2 py-1 ${selectedEdge === i ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100'}`} onClick={() => { setSelected(undefined); setSelectedEdge(i); setTool('select'); svgRef.current?.focus({ preventScroll: true }); }}>L{i + 1} · {fmt(distance(p, current[(i + 1) % current.length]), 2)} m</button>)}</div>
          </details>}
          {selectedEdge !== undefined && <p className="text-xs text-blue-700">Linha {selectedEdge + 1} selecionada: arraste ou use as setas para mover seus dois extremos.</p>}
          <p className="text-sm">Área ao fechar: <strong>{fmt(roomArea(current), 2)} m²</strong><br />Perímetro: {fmt(perimeter(current), 2)} m</p>

        </> : <p className="text-sm text-slate-500">Crie um ambiente ou edite um contorno salvo.</p>}
        {working && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs">As edições de todos os ambientes ficam preservadas ao trocar a seleção. Salve a planta para atualizar o 3D.</p>
          <Button variant="primary" onClick={save}>Salvar planta</Button>
          <Button onClick={reset}>Cancelar alterações</Button>
        </div>}
        {error && <div role="alert"><Callout tone="error">{error}</Callout></div>}
        <ul className="space-y-2">{plan.map(r => <li key={r.id} className="rounded-lg border p-3 text-sm"><strong>{r.name}</strong><p>{fmt(roomArea(r.points), 2)} m² · {fmt(perimeter(r.points), 2)} m de perímetro</p><div className="mt-2 flex gap-2"><Button size="sm" aria-pressed={activeId === r.id} onClick={() => { begin(r); }}>Editar</Button><Button size="sm" disabled={plan.length === 1} onClick={() => removeRoom(r.id)}>Excluir</Button></div></li>)}</ul>
      </div>
    </div>
  </div>;
}
