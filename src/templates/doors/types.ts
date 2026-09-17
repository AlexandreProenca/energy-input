import type { LayerDef } from '../constructions/types';

export interface DoorTemplate {
  id: string;
  label: string;
  description: string;
  /** Layers from outside to inside. */
  layers: LayerDef[];
}
