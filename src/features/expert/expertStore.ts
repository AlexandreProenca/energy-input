import { create } from 'zustand';
import { useUiStore } from '@/store/uiStore';

export type ExpertView = 'form' | 'objectJson' | 'fileJson';

interface ExpertState {
  view: ExpertView;
  /** The open form has unsaved changes. */
  dirty: boolean;
  /** Navigation waiting for the user to save/discard. */
  pendingNav?: { type?: string; name?: string };
  /** Field to scroll to after navigation (from the validation panel). */
  focusField?: string;
  issuesOpen: boolean;
  setView: (v: ExpertView) => void;
  setDirty: (d: boolean) => void;
  /** Selects an object, asking first when the current form is dirty. */
  navigate: (type?: string, name?: string, focusField?: string) => void;
  confirmNav: () => void;
  cancelNav: () => void;
  setIssuesOpen: (open: boolean) => void;
  clearFocus: () => void;
}

export const useExpertStore = create<ExpertState>((set, get) => ({
  view: 'form',
  dirty: false,
  issuesOpen: false,
  setView: (view) => set({ view }),
  setDirty: (dirty) => set({ dirty }),
  navigate(type, name, focusField) {
    const ui = useUiStore.getState();
    if (type === ui.expertType && name === ui.expertName) {
      set({ focusField });
      return;
    }
    if (get().dirty) {
      set({ pendingNav: { type, name }, focusField });
      return;
    }
    ui.selectObject(type, name);
    set({ focusField, view: get().view === 'fileJson' ? 'form' : get().view });
  },
  confirmNav() {
    const nav = get().pendingNav;
    if (!nav) return;
    useUiStore.getState().selectObject(nav.type, nav.name);
    set({ pendingNav: undefined, dirty: false });
  },
  cancelNav: () => set({ pendingNav: undefined }),
  setIssuesOpen: (issuesOpen) => set({ issuesOpen }),
  clearFocus: () => set({ focusField: undefined }),
}));
