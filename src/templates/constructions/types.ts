export type Roughness = 'VeryRough' | 'Rough' | 'MediumRough' | 'MediumSmooth' | 'Smooth' | 'VerySmooth';

export type MaterialDef =
  | {
      kind: 'Material';
      label: string;
      roughness: Roughness;
      /** Default thickness, m (can be overridden per layer). */
      thickness: number;
      conductivity: number;
      density: number;
      specificHeat: number;
      /** Color used in the wall-section illustration. */
      color: string;
      /** Illustration hatch. */
      pattern?: 'brick' | 'concrete' | 'insulation' | 'tile' | 'board';
    }
  | { kind: 'AirGap'; label: string; thermalResistance: number; color: string; pattern?: 'air' };

export interface LayerDef {
  material: string;
  thickness?: number;
}

export type AssemblyKind = 'wall' | 'roof' | 'groundFloor' | 'interFloor';

export interface ConstructionPreset {
  id: string;
  label: string;
  description: string;
  /** Layers from OUTSIDE to INSIDE. For interFloor: from below (ceiling side) to above (floor finish). */
  assemblies: Record<AssemblyKind, { label: string; layers: LayerDef[] }>;
}

export interface SurfaceColor {
  id: string;
  label: string;
  /** Solar absorptance applied to the outermost layer. */
  absorptance: number;
  swatch: string;
}
