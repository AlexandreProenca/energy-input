import type { EpJsonDocument } from '@/core/epjson/types';
import type { WizardAnswers, WizardStepId } from '@/generators/answers';
import type { OwnershipMap } from '@/core/sync/wizardSync';
import { useDocumentStore, type ProjectOrigin } from './documentStore';
import { useUiStore, type AppMode } from './uiStore';
import { useWizardStore } from './wizardStore';

const KEY = 'energy-input:autosave:v1';

interface Snapshot {
  savedAt: string;
  origin?: ProjectOrigin;
  doc: EpJsonDocument;
  fileName: string;
  answers: WizardAnswers;
  owned: OwnershipMap;
  linked: boolean;
  mode: AppMode;
  wizardStep: WizardStepId;
  visitedSteps: WizardStepId[];
}

function readSnapshot(): Snapshot | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const s = JSON.parse(raw) as Snapshot;
    return s && s.doc && typeof s.doc === 'object' ? s : undefined;
  } catch {
    return undefined;
  }
}

export function clearSnapshot() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Restores the last session. Returns the save date when something was restored. */
export function restoreSnapshot(): string | undefined {
  const s = readSnapshot();
  if (!s) return undefined;
  useDocumentStore.getState().reset(s.doc, s.fileName);
  useDocumentStore.setState({ origin: s.origin ?? (s.linked === false
    ? { kind: 'upload', doc: structuredClone(s.doc), fileName: s.fileName, recovered: true }
    : { kind: 'generated' }) });
  useWizardStore.getState().hydrate({ answers: s.answers, owned: s.owned ?? {}, linked: s.linked ?? true });
  useUiStore.setState({ mode: s.mode ?? 'basic', wizardStep: s.wizardStep ?? 'project', visitedSteps: s.visitedSteps ?? ['project'] });
  return s.savedAt;
}

/** Debounced autosave of document, wizard answers and UI position. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const d = useDocumentStore.getState();
      const w = useWizardStore.getState();
      const u = useUiStore.getState();
      const snap: Snapshot = {
        savedAt: new Date().toISOString(),
        doc: d.doc,
        origin: d.origin,
        fileName: d.fileName,
        answers: w.answers,
        owned: w.owned,
        linked: w.linked,
        mode: u.mode,
        wizardStep: u.wizardStep,
        visitedSteps: u.visitedSteps,
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(snap));
      } catch {
        /* quota exceeded or storage blocked: autosave is best-effort */
      }
    }, 800);
  };
  const unsubs = [useDocumentStore.subscribe(save), useWizardStore.subscribe(save), useUiStore.subscribe(save)];
  return () => {
    clearTimeout(timer);
    unsubs.forEach((u) => u());
  };
}
