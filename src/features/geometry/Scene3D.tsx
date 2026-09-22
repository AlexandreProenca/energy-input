import { useEffect, useMemo } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { EpJsonDocument } from '@/core/epjson/types';
import type { GeometryModel, SurfaceGeom } from '@/core/geometry/model';
import { toLocal } from '@/core/geometry/frames';
import { constructionLayers } from '@/core/geometry/edits';
import { summarizeConstruction } from '@/core/geometry/thermal';
import type { Vec3 } from '@/core/geometry/vec';
import { fmt } from '@/ui/primitives';
import { useGeometryUi } from './geometryStore';
import { zoneLevels } from './useGeometry';

const COLORS = {
  Wall: '#efe6d8',
  Roof: '#c0704c',
  Floor: '#9aa5b1',
  Ceiling: '#d9dee4',
  Window: '#6fb6de',
  GlassDoor: '#8cc9e8',
  Door: '#8b5e3c',
  Other: '#cbd5e1',
  selected: '#f59e0b',
  hovered: '#fcd34d',
};

/** EnergyPlus (X east, Y north, Z up) → three.js (x, y up, -z north). */
const T = ([x, y, z]: Vec3) => new THREE.Vector3(x, z, -y);

interface Built {
  key: string;
  label: string;
  kind: 'surface' | 'opening';
  category: keyof typeof COLORS;
  zone?: string;
  /** Both thermal faces belonging to this single physical mesh. */
  faces?: SurfaceGeom[];
  aliases?: string[];
  geometry: THREE.BufferGeometry;
  edges: THREE.BufferGeometry;
  center: THREE.Vector3;
  dims?: string;
}

function worldBasis(model: GeometryModel, s: SurfaceGeom) {
  const f = s.frame!;
  const o = model.toWorld(f.origin, s.zone);
  const dir = (d: Vec3) => {
    const p = model.toWorld([f.origin[0] + d[0], f.origin[1] + d[1], f.origin[2] + d[2]], s.zone);
    return T([p[0] - o[0], p[1] - o[1], p[2] - o[2]]);
  };
  const m = new THREE.Matrix4().makeBasis(dir(f.u), dir(f.v), dir([-f.n[0], -f.n[1], -f.n[2]]));
  m.setPosition(T(o));
  return m;
}

export function buildMeshes(doc: EpJsonDocument, model: GeometryModel, showThickness: boolean): Built[] {
  const thicknessCache = new Map<string, number>();
  const thicknessOf = (construction: string | undefined, category: SurfaceGeom['category']) => {
    if (!showThickness || !construction) return 0.02;
    if (!thicknessCache.has(construction)) {
      const t = summarizeConstruction(doc, constructionLayers(doc, construction), category).thickness;
      thicknessCache.set(construction, Math.max(0.02, t));
    }
    return thicknessCache.get(construction)!;
  };

  const out: Built[] = [];
  const rendered = new Set<string>();
  for (const s of model.surfaces.values()) {
    if (!s.frame || s.points.length < 3 || rendered.has(s.name)) continue;
    const opposite = s.sharedWith ? model.surfaces.get(s.sharedWith) : undefined;
    if (opposite && s.subsurfaces.length < opposite.subsurfaces.length) continue;
    const faces = opposite ? [s, opposite] : [s];
    faces.forEach(face => rendered.add(face.name));
    const local = s.points.map((p) => toLocal(s.frame!, p));
    const shape = new THREE.Shape(local.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const subName of s.subsurfaces) {
      const sub = model.subsurfaces.get(subName);
      if (!sub || sub.points.length < 3) continue;
      shape.holes.push(new THREE.Path(sub.points.map((p) => toLocal(s.frame!, p)).map(([x, y]) => new THREE.Vector2(x, y))));
    }
    const depth = thicknessOf(s.construction, s.category);
    const basis = worldBasis(model, s);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    // One total thickness centered on a shared interface, not two inward extrusions.
    if (opposite) geometry.translate(0, 0, -depth / 2);
    geometry.applyMatrix4(basis);
    geometry.computeBoundingBox();
    out.push({
      key: s.name,
      label: s.name,
      kind: 'surface',
      category: s.category,
      zone: s.zone,
      faces,
      geometry,
      edges: new THREE.EdgesGeometry(geometry, 25),
      center: geometry.boundingBox!.getCenter(new THREE.Vector3()),
      dims: s.rect ? `${fmt(s.rect.width, 2)} × ${fmt(s.rect.height, 2)} m` : undefined,
    });

    for (const subName of s.subsurfaces) {
      const sub = model.subsurfaces.get(subName);
      if (!sub || sub.points.length < 3) continue;
      const subShape = new THREE.Shape(sub.points.map((p) => toLocal(s.frame!, p)).map(([x, y]) => new THREE.Vector2(x, y)));
      const opaque = sub.category === 'Door';
      const subDepth = opaque ? Math.min(depth, 0.05) : 0.01;
      const g = new THREE.ExtrudeGeometry(subShape, { depth: subDepth, bevelEnabled: false });
      g.translate(0, 0, opposite ? -subDepth / 2 : (depth - subDepth) / 2);
      g.applyMatrix4(basis);
      g.computeBoundingBox();
      out.push({
        key: sub.name,
        aliases: sub.sharedWith ? [sub.sharedWith] : [],
        label: sub.name,
        kind: 'opening',
        category: sub.category,
        zone: s.zone,
        geometry: g,
        edges: new THREE.EdgesGeometry(g, 25),
        center: g.boundingBox!.getCenter(new THREE.Vector3()),
        dims: sub.rect ? `${fmt(sub.rect.width, 2)} × ${fmt(sub.rect.height, 2)} m` : undefined,
      });
    }
  }
  return out;
}

function CameraRig({ bounds }: { bounds: THREE.Box3 }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const view = useGeometryUi((s) => s.view);
  const frameRequest = useGeometryUi((s) => s.frameRequest);

  useEffect(() => {
    if (!controls || bounds.isEmpty()) return;
    const c = bounds.getCenter(new THREE.Vector3());
    const r = Math.max(6, bounds.getSize(new THREE.Vector3()).length());
    const pos =
      view === 'top' ? new THREE.Vector3(c.x, c.y + r * 1.4, c.z + 0.001) : view === 'south' ? new THREE.Vector3(c.x, c.y, c.z + r * 1.5) : view === 'east' ? new THREE.Vector3(c.x + r * 1.5, c.y, c.z) : new THREE.Vector3(c.x + r * 0.9, c.y + r * 0.75, c.z + r * 1.05);
    camera.position.copy(pos);
    controls.target.copy(c);
    controls.update();
    // Re-frame only on explicit requests or view changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, view, frameRequest]);
  return null;
}

function Scene({ doc, model }: { doc: EpJsonDocument; model: GeometryModel }) {
  const { selection, hovered, showThickness, xray, levelZone, select, hover } = useGeometryUi();
  const built = useMemo(() => buildMeshes(doc, model, showThickness), [doc, model, showThickness]);

  const levels = useMemo(() => zoneLevels(model), [model]);
  const levelIndex = levelZone ? levels.findIndex((l) => l.name === levelZone) : -1;
  const cutoff = levelIndex >= 0 ? levels[levelIndex].baseZ : undefined;
  const visibleZones = cutoff !== undefined ? new Set(levels.filter(l => l.baseZ <= cutoff + 1e-4).map(l => l.name)) : undefined;
  const topZones = cutoff !== undefined ? new Set(levels.filter(l => Math.abs(l.baseZ - cutoff) < 1e-4).map(l => l.name)) : undefined;

  const bounds = useMemo(() => {
    const b = new THREE.Box3();
    for (const m of built) b.union(m.geometry.boundingBox!);
    return b;
  }, [built]);

  const selectedZone = selection?.kind === 'zone' ? selection.name : undefined;
  const selectedOpeningBase = selection?.kind === 'opening' ? model.subsurfaces.get(selection.name)?.base : undefined;

  const onClick = (b: Built) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return; // it was an orbit drag
    e.stopPropagation();
    const face = b.faces?.find(f => f.zone === selectedZone) ?? b.faces?.[0];
    select({ kind: b.kind, name: face?.name ?? b.key });
  };

  const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
  const radius = bounds.isEmpty() ? 10 : Math.max(6, bounds.getSize(new THREE.Vector3()).length());

  return (
    <>
      <ambientLight intensity={0.95} />
      <directionalLight position={[radius, radius * 1.6, radius * 0.7]} intensity={1.15} />
      <directionalLight position={[-radius, radius * 0.5, -radius]} intensity={0.3} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, bounds.min.y - 0.03, center.z]} onClick={(e) => e.delta <= 5 && select(undefined)}>
        <circleGeometry args={[radius * 1.2, 64]} />
        <meshStandardMaterial color="#dfeedd" />
      </mesh>
      <mesh position={[center.x, bounds.min.y - 0.02, center.z - radius * 1.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.05, 3]} />
        <meshBasicMaterial color="#dc2626" />
      </mesh>

      {built.map((b) => {
        const faceVisible = (f: { zone?: string; category: string }) => (!visibleZones || !f.zone || visibleZones.has(f.zone)) && !(topZones && f.zone && topZones.has(f.zone) && (f.category === 'Roof' || f.category === 'Ceiling'));
        if (!(b.faces ?? [b]).some(faceVisible)) return null;
        const isSelected = (selection?.kind === b.kind && (selection.name === b.key || b.aliases?.includes(selection.name) || b.faces?.some(f => f.name === selection.name))) || (selectedZone && b.kind === 'surface' && (b.faces ?? [b]).some(f => f.zone === selectedZone));
        const isHovered = hovered === b.key || (!!hovered && b.aliases?.includes(hovered)) || b.faces?.some(f => f.name === hovered || f.zone === hovered);
        const glass = b.category === 'Window' || b.category === 'GlassDoor';
        const faded = xray && b.kind === 'surface';
        const context = selectedOpeningBase === b.key || b.faces?.some(f => f.name === selectedOpeningBase);
        const color = isSelected ? COLORS.selected : isHovered ? COLORS.hovered : COLORS[b.category];
        return (
          <group key={`${b.kind}:${b.key}`}>
            <mesh
              geometry={b.geometry}
              onClick={onClick(b)}
              onPointerOver={(e) => {
                e.stopPropagation();
                hover(b.key);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                hover(undefined);
                document.body.style.cursor = '';
              }}
            >
              <meshStandardMaterial
                color={color}
                polygonOffset
                polygonOffsetFactor={b.category === 'Roof' || b.category === 'Ceiling' ? 1 : 2}
                polygonOffsetUnits={b.category === 'Roof' || b.category === 'Ceiling' ? 1 : 2}
                side={THREE.DoubleSide}
                transparent={glass || faded}
                opacity={glass ? 0.7 : faded ? 0.28 : 1}
                depthWrite={!faded && !glass}
                emissive={isSelected ? '#b45309' : '#000000'}
                emissiveIntensity={isSelected ? 0.25 : 0}
              />
            </mesh>
            <lineSegments geometry={b.edges}>
              <lineBasicMaterial color={isSelected || context ? '#b45309' : glass ? '#2f6f96' : '#64748b'} transparent opacity={faded ? 0.35 : 0.9} />
            </lineSegments>
            {isSelected && selection?.kind !== 'zone' && b.dims && (
              <Html position={b.center} center zIndexRange={[10, 0]}>
                <div className="pointer-events-none whitespace-nowrap rounded-md bg-slate-900/85 px-2 py-0.5 text-[11px] font-medium text-white shadow">{b.dims}</div>
              </Html>
            )}
          </group>
        );
      })}
      <OrbitControls makeDefault enableDamping={false} maxPolarAngle={Math.PI / 2.02} minDistance={1} maxDistance={radius * 6} />
      <CameraRig bounds={bounds} />
    </>
  );
}

export default function Scene3D({ doc, model }: { doc: EpJsonDocument; model: GeometryModel }) {
  // Deselection happens by clicking the ground (drag-aware); onPointerMissed would also fire after orbit drags.
  return (
    <Canvas camera={{ fov: 40, position: [20, 15, 20] }} dpr={[1, 2]}>
      <Scene doc={doc} model={model} />
    </Canvas>
  );
}
