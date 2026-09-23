import { create } from 'zustand';
import { pageOf, type WizardPageId, type WizardStepId } from '@/generators/answers';

export type AppMode = 'basic' | 'geometry' | 'expert' | 'results';

export interface Toast {
  id: number;
  kind: 'success' | 'info' | 'error';
  message: string;
}

interface UiState {
  mode: AppMode;
  /** A página atual do assistente. */
  wizardStep: WizardPageId;
  visitedSteps: WizardPageId[];
  expertType?: string;
  expertName?: string;
  toasts: Toast[];
  setMode: (m: AppMode) => void;
  /** Vai para a página que mostra a etapa — `goToStep('windows')` abre "Materiais e janelas". */
  goToStep: (s: WizardStepId) => void;
  selectObject: (type?: string, name?: string) => void;
  toast: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useUiStore = create<UiState>((set) => ({
  mode: 'basic',
  wizardStep: 'project',
  visitedSteps: ['project'],
  toasts: [],
  setMode: (mode) => set({ mode }),
  goToStep: (step) => {
    const wizardStep = pageOf(step);
    set((s) => ({ wizardStep, visitedSteps: s.visitedSteps.includes(wizardStep) ? s.visitedSteps : [...s.visitedSteps, wizardStep] }));
  },
  selectObject: (expertType, expertName) => set({ expertType, expertName }),
  toast: (message, kind = 'success') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
