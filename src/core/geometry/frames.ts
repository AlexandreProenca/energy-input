import { add, cross, dot, newellNormal, normalize, r4, scale, sub, type Vec3 } from './vec';

/** Snaps tiny float noise (and -0) in unit vectors. */
const clean = (v: Vec3): Vec3 => v.map((c) => (Math.abs(c) < 1e-9 ? 0 : Math.abs(Math.abs(c) - 1) < 1e-9 ? Math.sign(c) : c)) as Vec3;

/**
 * A 2D coordinate frame on a planar surface, as seen from outside:
 * `u` points right, `v` points up, `n` is the outward normal.
 * For walls `v` is vertical; for roofs/floors `u` follows +X.
 */
export interface PlaneFrame {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  n: Vec3;
}

export interface Rect2 {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EPS = 1e-3;

/** Frame for a polygon; origin at the minimum (lower-left) local corner. */
export function planeFrame(points: Vec3[]): PlaneFrame | undefined {
  if (points.length < 3) return undefined;
  const n = clean(normalize(newellNormal(points)));
  if (n[0] === 0 && n[1] === 0 && n[2] === 0) return undefined;
  let u: Vec3;
  if (Math.abs(n[2]) > 1 - 1e-6) u = n[2] > 0 ? [1, 0, 0] : [-1, 0, 0];
  else u = clean(normalize(cross([0, 0, 1], n)));
  const v = clean(cross(n, u));
  const locals = points.map((p) => [dot(p, u), dot(p, v)]);
  const minX = Math.min(...locals.map((l) => l[0]));
  const minY = Math.min(...locals.map((l) => l[1]));
  const d = dot(points[0], n);
  const origin = add(add(scale(u, minX), scale(v, minY)), scale(n, d));
  return { origin, u, v, n };
}

export function toLocal(f: PlaneFrame, p: Vec3): [number, number] {
  const q = sub(p, f.origin);
  return [dot(q, f.u), dot(q, f.v)];
}

export function fromLocal(f: PlaneFrame, x: number, y: number): Vec3 {
  return add(add(f.origin, scale(f.u, x)), scale(f.v, y));
}

/** Axis-aligned bounding rectangle of points in the frame. */
export function localBounds(f: PlaneFrame, points: Vec3[]): Rect2 {
  const l = points.map((p) => toLocal(f, p));
  const xs = l.map((p) => p[0]);
  const ys = l.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x: r4(x) + 0, y: r4(y) + 0, width: r4(Math.max(...xs) - x), height: r4(Math.max(...ys) - y) };
}

/** True when the polygon is a 4-vertex rectangle aligned with its own frame. */
export function isFrameRectangle(f: PlaneFrame, points: Vec3[]): boolean {
  if (points.length !== 4) return false;
  const b = localBounds(f, points);
  return points.every((p) => {
    const [x, y] = toLocal(f, p);
    const onX = Math.abs(x - b.x) < EPS || Math.abs(x - b.x - b.width) < EPS;
    const onY = Math.abs(y - b.y) < EPS || Math.abs(y - b.y - b.height) < EPS;
    const planar = Math.abs(dot(sub(p, f.origin), f.n)) < EPS;
    return onX && onY && planar;
  });
}

export type StartCorner = 'UpperLeftCorner' | 'LowerLeftCorner' | 'LowerRightCorner' | 'UpperRightCorner';

export interface VertexRules {
  start: StartCorner;
  counterclockwise: boolean;
}

/**
 * Four corners of a rectangle in the order required by GlobalGeometryRules
 * (seen from outside). Counterclockwise from the upper-left is UL, LL, LR, UR.
 */
export function rectVertices(f: PlaneFrame, r: Rect2, rules: VertexRules): Vec3[] {
  const ul = fromLocal(f, r.x, r.y + r.height);
  const ll = fromLocal(f, r.x, r.y);
  const lr = fromLocal(f, r.x + r.width, r.y);
  const ur = fromLocal(f, r.x + r.width, r.y + r.height);
  const cycle = rules.counterclockwise ? [ul, ll, lr, ur] : [ul, ur, lr, ll];
  const names: StartCorner[] = rules.counterclockwise
    ? ['UpperLeftCorner', 'LowerLeftCorner', 'LowerRightCorner', 'UpperRightCorner']
    : ['UpperLeftCorner', 'UpperRightCorner', 'LowerRightCorner', 'LowerLeftCorner'];
  const i = Math.max(0, names.indexOf(rules.start));
  return [...cycle.slice(i), ...cycle.slice(0, i)];
}
