import { findSharedSurfaces } from '@/core/geometry/sharedSurfaces';
import { polygonGeometry } from './polygonGeometry';
import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Box } from 'lucide-react';
import type { EpJsonDocument } from '@/core/epjson/types';
import { extractPolygons, type PreviewPolygon, type SurfaceKind } from './buildingMesh';

const COLORS: Record<SurfaceKind, string> = {
  Wall: '#efe6d8',
  Roof: '#c0704c',
  Floor: '#94a3b8',
  Ceiling: '#e2e8f0',
  Window: '#6fb6de',
  Door: '#8b5e3c',
  Other: '#cbd5e1',
};

/** EnergyPlus (X east, Y north, Z up) → three.js (x, y up, -z north). */
const toThree = ([x, y, z]: [number, number, number]) => new THREE.Vector3(x, z, -y);


interface Framing {
  center: THREE.Vector3;
  radius: number;
}

function frame(polygons: PreviewPolygon[]): Framing {
  const box = new THREE.Box3();
  for (const p of polygons) for (const q of p.points) box.expandByPoint(toThree(q));
  if (box.isEmpty()) return { center: new THREE.Vector3(), radius: 10 };
  return { center: box.getCenter(new THREE.Vector3()), radius: Math.max(box.getSize(new THREE.Vector3()).length(), 6) };
}

function Scene({ polygons, cutaway, framing }: { polygons: PreviewPolygon[]; cutaway: boolean; framing: Framing }) {
  const { center, radius } = framing;
  const meshes = useMemo(
    () =>
      polygons
        .filter((p) => p.kind !== 'Ceiling')
        .map((p) => ({ p, ...polygonGeometry(p, p.kind === 'Window' || p.kind === 'Door' ? 0.03 : 0) })),
    [polygons],
  );

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[radius, radius * 1.5, radius * 0.6]} intensity={1.1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, -0.02, center.z]}>
        <circleGeometry args={[radius * 1.1, 64]} />
        <meshStandardMaterial color="#dfeedd" />
      </mesh>
      {/* True north arrow on the ground */}
      <group position={[center.x, 0.01, center.z]}>
        <mesh position={[0, 0, -radius * 0.95]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[radius * 0.06, 3]} />
          <meshBasicMaterial color="#dc2626" />
        </mesh>
      </group>
      {meshes.map(({ p, g, outline }) => {
        const faded = cutaway && (p.kind === 'Roof' || (p.kind === 'Wall' && isFrontFacing(p)));
        return (
          <group key={p.name}>
            <mesh geometry={g}>
              <meshStandardMaterial
                color={COLORS[p.kind]}
                side={THREE.DoubleSide}
                transparent={p.kind === 'Window' || faded}
                opacity={p.kind === 'Window' ? 0.75 : faded ? 0.25 : 1}
                polygonOffset
                polygonOffsetFactor={p.kind === 'Window' ? -2 : 1}
              />
            </mesh>
            <lineLoop geometry={outline}>
              <lineBasicMaterial color={p.kind === 'Window' ? '#2f6f96' : '#64748b'} transparent opacity={faded ? 0.3 : 0.9} />
            </lineLoop>
          </group>
        );
      })}
      <OrbitControls makeDefault target={center} enablePan={false} minDistance={radius * 0.3} maxDistance={radius * 4} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}

function isFrontFacing(p: PreviewPolygon) {
  // South/east walls face the default camera; fade them in cut-away mode.
  const [a, b] = p.points;
  if (!a || !b) return false;
  return Math.abs(a[1] - b[1]) < 1e-6 ? a[1] <= Math.min(...p.points.map((q) => q[1])) + 1e-6 : a[0] >= Math.max(...p.points.map((q) => q[0])) - 1e-6;
}

export default function Building3D({ doc, height = 280, cutaway = false }: { doc: EpJsonDocument; height?: number; cutaway?: boolean }) {
  const { polygons } = useMemo(() => {
    const extracted = extractPolygons(doc);
    const pairs = findSharedSurfaces(extracted.polygons.filter(p => ['Wall', 'Floor', 'Roof', 'Ceiling'].includes(p.kind)).map(p => ({ ...p, category: p.kind })));
    const seen = new Set<string>();
    // Prefer floor over ceiling so a shared slab remains visible in the preview.
    const polygons = [...extracted.polygons].sort((a, b) => Number(a.kind === 'Ceiling') - Number(b.kind === 'Ceiling')).filter(p => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      const other = pairs.get(p.name); if (other) seen.add(other);
      return true;
    });
    return { ...extracted, polygons };
  }, [doc]);
  const framing = useMemo(() => frame(polygons), [polygons]);
  // Remount (and re-frame the camera) only when the building's overall size changes.
  const key = [framing.center.x, framing.center.y, framing.center.z, framing.radius].map((n) => Math.round(n)).join(',');
  const { center, radius } = framing;

  if (polygons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm text-slate-500" style={{ height }}>
        <Box size={28} />
        Sem superfícies para desenhar
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-sky-100 to-sky-50" style={{ height }}>
      <Canvas key={key} camera={{ fov: 40, position: [center.x + radius * 0.85, center.y + radius * 0.65, center.z + radius * 0.95] }} dpr={[1, 2]}>
        <Scene polygons={polygons} cutaway={cutaway} framing={framing} />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-slate-600">
        <span className="inline-block h-0 w-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-red-600" /> Norte verdadeiro · arraste para girar
      </div>
    </div>
  );
}
