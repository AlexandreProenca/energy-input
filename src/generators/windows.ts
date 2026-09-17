import type { EpJsonFragment, EpObject } from '@/core/epjson/types';
import { byId, type TemplateLibrary } from '@/templates';
import type { GlazingTemplate } from '@/templates/glazing/types';
import { FACADE_LABEL, wallRect, type WallInfo, type ZoneInfo } from './geometry/boxGeometry';
import type { WizardAnswers } from './answers';

const SIDE_MARGIN = 0.1;
const TOP_MARGIN = 0.05;
const MIN_SILL = 0.05;
const PREFERRED_SILL = 0.9;

export interface WindowRect {
  x0: number;
  sill: number;
  width: number;
  height: number;
  /** Achieved window-to-wall ratio, 0–1 (may be below the request on small walls). */
  actualWwr: number;
}

/**
 * Sizes one centered horizontal window for a target WWR: keeps a preferred
 * 0,9 m sill and ~half the wall height, widening first and growing taller only
 * when the wall runs out of width.
 */
export function sizeWindow(wallLength: number, wallHeight: number, wwr: number): WindowRect | undefined {
  if (wwr <= 0) return undefined;
  const area = Math.min(wwr, 0.95) * wallLength * wallHeight;
  const maxWidth = wallLength - 2 * SIDE_MARGIN;
  const maxHeight = wallHeight - TOP_MARGIN - MIN_SILL;
  if (maxWidth <= 0.1 || maxHeight <= 0.1) return undefined;

  let height = Math.min(maxHeight, Math.max(0.6, wallHeight * 0.5));
  let width = area / height;
  if (width > maxWidth) {
    width = maxWidth;
    height = Math.min(maxHeight, area / width);
  }
  const sill = Math.max(MIN_SILL, Math.min(PREFERRED_SILL, wallHeight - TOP_MARGIN - height));
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return {
    x0: r((wallLength - width) / 2),
    sill: r(sill),
    width: r(width),
    height: r(height),
    actualWwr: (width * height) / (wallLength * wallHeight),
  };
}

export function glazingConstructionName(g: GlazingTemplate) {
  return `Janela - ${g.label}`;
}

function flatVertices(pts: [number, number, number][]): EpObject {
  const out: EpObject = {};
  pts.forEach(([x, y, z], i) => {
    const r = (n: number) => Math.round(n * 1e4) / 1e4;
    out[`vertex_${i + 1}_x_coordinate`] = r(x);
    out[`vertex_${i + 1}_y_coordinate`] = r(y);
    out[`vertex_${i + 1}_z_coordinate`] = r(z);
  });
  return out;
}

/** Step 6 — glazing material/construction and one window per exterior wall. */
export function generateWindows(
  zones: ZoneInfo[],
  w: WizardAnswers['windows'],
  lib: TemplateLibrary,
): { fragment: EpJsonFragment; totalWindowArea: number } {
  const glazing = byId(lib.glazing, w.glazingId);
  const constructionName = glazingConstructionName(glazing);
  const fenestration: Record<string, EpObject> = {};
  let totalWindowArea = 0;

  const ratio = (wall: WallInfo) => (w.mode === 'uniform' ? w.wwr : w.perFacade[wall.facade]) / 100;

  for (const zone of zones) {
    for (const wall of zone.walls) {
      const rect = sizeWindow(wall.length, wall.height, ratio(wall));
      if (!rect) continue;
      totalWindowArea += rect.width * rect.height;
      fenestration[`${zone.name} - Janela ${FACADE_LABEL[wall.facade]}`] = {
        surface_type: 'Window',
        construction_name: constructionName,
        building_surface_name: wall.name,
        view_factor_to_ground: 'Autocalculate',
        multiplier: 1,
        number_of_vertices: 4,
        ...flatVertices(wallRect(wall, rect.x0, rect.sill, rect.width, rect.height)),
      };
    }
  }

  const fragment: EpJsonFragment = {};
  if (Object.keys(fenestration).length > 0) {
    fragment['WindowMaterial:SimpleGlazingSystem'] = {
      [glazing.label]: { u_factor: glazing.uFactor, solar_heat_gain_coefficient: glazing.shgc, visible_transmittance: glazing.visibleTransmittance },
    };
    fragment.Construction = { [constructionName]: { outside_layer: glazing.label } };
    fragment['FenestrationSurface:Detailed'] = fenestration;
  }
  return { fragment, totalWindowArea: Math.round(totalWindowArea * 100) / 100 };
}
