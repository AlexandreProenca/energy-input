import type { EpJsonFragment } from '@/core/epjson/types';

export interface OutputPreset {
  id: string;
  label: string;
  description: string;
  icon: 'gauge' | 'thermometer' | 'flame' | 'receipt' | 'box';
  defaultOn: boolean;
  /** Objects added when the option is checked. */
  objects: EpJsonFragment;
}
