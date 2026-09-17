import { create } from 'zustand';

export type Selection = { kind: 'zone' | 'surface' | 'opening'; name: string } | undefined;

interface GeometryUiState {
  selection: Selection;
  hovered?: string;
  showThickness: boolean;
  xray: boolean;
  /** Show zones up to this one (sorted bottom-up); undefined = all. */
  levelZone?: string;
  /** Bumped to ask the scene to re-frame the camera. */
  frameRequest: number;
  view: 'perspective' | 'top' | 'south' | 'east';
  select: (s: Selection) => void;
  hover: (name?: string) => void;
  set: (patch: Partial<Pick<GeometryUiState, 'showThickness' | 'xray' | 'levelZone' | 'view'>>) => void;
  reframe: () => void;
}

export const useGeometryUi = create<GeometryUiState>((set) => ({
  selection: undefined,
  showThickness: true,
  xray: false,
  frameRequest: 0,
  view: 'perspective',
  select: (selection) => set({ selection }),
  hover: (hovered) => set({ hovered }),
  set: (patch) => set(patch),
  reframe: () => set((s) => ({ frameRequest: s.frameRequest + 1 })),
}));
