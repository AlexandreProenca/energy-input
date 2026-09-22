export interface GlazingTemplate {
  id: string;
  thickness?: number;
  frame?: 'PVC';
  label: string;
  description: string;
  panes: 1 | 2;
  tint: 'clear' | 'reflective' | 'lowe';
  uFactor: number;
  shgc: number;
  visibleTransmittance: number;
}
