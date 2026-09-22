import type { Point2 } from '@/generators/geometry/floorPlan';

export const PLAN_SHAPES = [
  { id: 'rectangle', label: 'Retângulo', icon: '▭' },
  { id: 'square', label: 'Quadrado', icon: '□' },
  { id: 'triangle', label: 'Triângulo', icon: '△' },
  { id: 'l', label: 'Formato L', icon: '⌞' },
  { id: 'hexagon', label: 'Hexágono', icon: '⬡' },
] as const;
export type PlanShape = typeof PLAN_SHAPES[number]['id'];
export const snapCoordinate = (value: number, step: number) => Number((Math.round(value / step) * step).toFixed(4));

/** Dimensions describe the bounding rectangle; insertion anchor is its lower-left corner. */
export function shapePoints(shape: PlanShape, anchor: Point2, width: number, height: number): Point2[] {
  const h = shape === 'square' ? width : height;
  const normalized: Point2[] = shape === 'triangle' ? [[0, 0], [1, 0], [0.5, 1]]
    : shape === 'l' ? [[0, 0], [1, 0], [1, 0.5], [0.5, 0.5], [0.5, 1], [0, 1]]
    : shape === 'hexagon' ? [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]
    : [[0, 0], [1, 0], [1, 1], [0, 1]];
  return normalized.map(([x, y]) => [Number((anchor[0] + x * width).toFixed(4)), Number((anchor[1] + y * h).toFixed(4))]);
}
