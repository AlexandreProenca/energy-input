import { cross, dot, length, newellNormal, normalize, sub, type Vec3 } from './vec';

export interface SharedCandidate {
  name: string;
  zone?: string;
  category: string;
  /** Coordinates in the common world frame, including zone elevation/rotation. */
  points: Vec3[];
}
const TOL = 1e-4; // 0.1 mm; do not merge nearby but distinct parallel partitions.

function contour(points: Vec3[]): Vec3[] {
  let p = points.filter((v, i) => !i || length(sub(v, points[i - 1])) > TOL);
  if (p.length > 1 && length(sub(p[0], p[p.length - 1])) <= TOL) p = p.slice(0, -1);
  let removed = true;
  while (removed && p.length > 3) {
    removed = false;
    for (let i = 0; i < p.length; i++) {
      const a = sub(p[i], p[(i + p.length - 1) % p.length]);
      const b = sub(p[(i + 1) % p.length], p[i]);
      if (dot(a, b) >= 0 && length(cross(a, b)) <= TOL * (length(a) + length(b))) {
        p.splice(i, 1); removed = true; break;
      }
    }
  }
  return p;
}

function sameBoundary(a: Vec3[], b: Vec3[]): boolean {
  if (a.length !== b.length || a.length < 3) return false;
  const na = normalize(newellNormal(a)), nb = normalize(newellNormal(b));
  if (dot(na, nb) > -0.99999) return false;
  // Opposite traversal, any starting vertex. Extra collinear vertices were removed.
  return b.some((_, start) => a.every((v, i) => length(sub(v, b[(start - i + b.length) % b.length])) <= TOL));
}

/** Reciprocal matches only; ambiguous matches (three coincident faces) stay separate. */
export function findSharedSurfaces(surfaces: SharedCandidate[]): Map<string, string> {
  const data = surfaces.map(s => {
    const points = contour(s.points);
    const center = [0, 1, 2].map(axis => points.length ? (Math.min(...points.map(p => p[axis])) + Math.max(...points.map(p => p[axis]))) / 2 : 0);
    return { ...s, points, cell: center.map(v => Math.floor(v / TOL)) };
  });
  const buckets = new Map<string, number[]>(), matches = data.map(() => [] as number[]);
  data.forEach((s, i) => {
    if (!s.zone || s.points.length < 3) return;
    const [x, y, z] = s.cell;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of buckets.get(`${x + dx},${y + dy},${z + dz}`) ?? []) {
        const t = data[j];
        if (t.zone === s.zone || (s.category === 'Wall') !== (t.category === 'Wall')) continue;
        if (sameBoundary(s.points, t.points)) { matches[i].push(j); matches[j].push(i); }
      }
    }
    const key = s.cell.join(',');
    buckets.set(key, [...(buckets.get(key) ?? []), i]);
  });
  const paired = new Map<string, string>();
  matches.forEach((list, i) => {
    if (list.length === 1 && matches[list[0]].length === 1) paired.set(data[i].name, data[list[0]].name);
  });
  return paired;
}
