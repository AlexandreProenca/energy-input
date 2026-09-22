import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { polygonGeometry } from '@/features/preview/polygonGeometry';
import { defaultAnswers } from '../answers';
import { generateDocument } from '../compose';
import { templates } from '@/templates';

describe('geometria visual e aberturas', () => {
  it('triangula cobertura côncava sem preencher o recorte ou desenhar diagonais', () => {
    // L whose missing quadrant is at the origin: a vertex fan would cross it.
    const points: [number, number, number][] = [[0, 2, 3], [2, 2, 3], [2, 0, 3], [4, 0, 3], [4, 4, 3], [0, 4, 3]];
    const { g, outline } = polygonGeometry({ name: 'Cobertura', kind: 'Roof', points });
    const vertices = g.getAttribute('position');
    let area = 0;
    for (let i = 0; i < vertices.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(vertices, i);
      const b = new Vector3().fromBufferAttribute(vertices, i + 1);
      const c = new Vector3().fromBufferAttribute(vertices, i + 2);
      const center = a.clone().add(b).add(c).divideScalar(3);
      expect(center.x < 2 && -center.z < 2).toBe(false);
      area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    }
    expect(area).toBeCloseTo(12);
    expect(outline.getAttribute('position').count).toBe(points.length + 1);
    g.dispose(); outline.dispose();
  });
  it('gera planta sem nenhuma abertura, inclusive para respostas antigas sem opt-in', () => {
    const a = defaultAnswers();
    a.geometry = { ...a.geometry, mode: 'plan', rooms: [{ id: 'sala', name: 'Sala', points: [[0, 0], [4, 0], [4, 3], [0, 3]] }] };
    for (const automatic of [undefined, false]) {
      a.windows.automatic = automatic;
      const { document, info } = generateDocument(a, templates);
      expect(document['FenestrationSurface:Detailed']).toBeUndefined();
      expect(info.totalWindowArea).toBe(0);
      expect(Object.values(document['BuildingSurface:Detailed']).filter(s => s.surface_type === 'Roof')).toHaveLength(1);
    }
    a.windows.automatic = true;
    expect(Object.keys(generateDocument(a, templates).document['FenestrationSurface:Detailed'])).toHaveLength(4);
  });
});
