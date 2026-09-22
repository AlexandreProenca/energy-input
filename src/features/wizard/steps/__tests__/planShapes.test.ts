import { describe, expect, it } from 'vitest';
import { PLAN_SHAPES, shapePoints, snapCoordinate } from '../planShapes';
import { roomArea, validateRooms } from '@/generators/geometry/floorPlan';

describe('figuras da paleta 2D', () => {
  it('gera contornos válidos com áreas e dimensões conhecidas', () => {
    const expected = { rectangle: 24, square: 36, triangle: 12, l: 18, hexagon: 18 };
    for (const { id } of PLAN_SHAPES) {
      const points = shapePoints(id, [-10, 8], 6, 4);
      expect(validateRooms([{ id, name: id, points }])).toEqual([]);
      expect(roomArea(points)).toBeCloseTo(expected[id]);
      expect(Math.min(...points.map(p => p[0]))).toBe(-10);
      expect(Math.max(...points.map(p => p[0]))).toBe(-4);
      expect(Math.min(...points.map(p => p[1]))).toBe(8);
      expect(Math.max(...points.map(p => p[1]))).toBe(id === 'square' ? 14 : 12);
    }
  });
  it('ajusta coordenadas positivas e negativas sem resíduos de ponto flutuante', () => {
    expect(snapCoordinate(2.34, 0.1)).toBe(2.3);
    expect(snapCoordinate(-2.36, 0.1)).toBe(-2.4);
    expect(snapCoordinate(0.30000000000004, 0.1)).toBe(0.3);
  });
});
