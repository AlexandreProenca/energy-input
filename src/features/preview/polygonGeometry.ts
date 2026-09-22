import * as THREE from 'three';
import { planeFrame, toLocal } from '@/core/geometry/frames';
import type { PreviewPolygon } from './buildingMesh';

const toThree = ([x, y, z]: [number, number, number]) => new THREE.Vector3(x, z, -y);

export function polygonGeometry(p: PreviewPolygon, offset = 0) {
  const pts = p.points.map(toThree);
  const normal = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    normal.x += (a.y - b.y) * (a.z + b.z);
    normal.y += (a.z - b.z) * (a.x + b.x);
    normal.z += (a.x - b.x) * (a.y + b.y);
  }
  normal.normalize();
  // (x, y, z) → (x, z, -y) is a rotation and preserves handedness.
  const shifted = pts.map((v) => v.clone().addScaledVector(normal, offset));
  const positions: number[] = [];
  const basis = planeFrame(p.points);
  const contour = basis ? p.points.map(v => new THREE.Vector2(...toLocal(basis, v))) : [];
  for (const triangle of THREE.ShapeUtils.triangulateShape(contour, [])) {
    for (const i of triangle) { const v = shifted[i]; positions.push(v.x, v.y, v.z); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  const outline = new THREE.BufferGeometry().setFromPoints([...shifted, shifted[0]]);
  return { g, outline };
}

