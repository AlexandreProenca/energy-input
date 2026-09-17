import { create } from 'zustand';
import type { EpJsonDocument } from '@/core/epjson/types';

const HISTORY_LIMIT = 100;
const COALESCE_MS = 800;

interface HistoryEntry {
  doc: EpJsonDocument;
  label: string;
}

interface DocumentState {
  doc: EpJsonDocument;
  fileName: string;
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastLabel?: string;
  lastChangeAt: number;
  /** Replaces the document, recording an undo step. Same-label changes within 800 ms are merged. */
  commit: (next: EpJsonDocument, label: string) => void;
  /** Replaces the document and clears history (new/open file). */
  reset: (doc: EpJsonDocument, fileName?: string) => void;
  setFileName: (name: string) => void;
  undo: () => void;
  redo: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  doc: {},
  fileName: 'modelo.epJSON',
  past: [],
  future: [],
  lastChangeAt: 0,
  commit(next, label) {
    const { doc, past, lastLabel, lastChangeAt } = get();
    if (next === doc) return;
    const now = Date.now();
    const coalesce = label === lastLabel && now - lastChangeAt < COALESCE_MS && past.length > 0;
    set({
      doc: next,
      past: coalesce ? past : [...past, { doc, label }].slice(-HISTORY_LIMIT),
      future: [],
      lastLabel: label,
      lastChangeAt: now,
    });
  },
  reset(doc, fileName) {
    set({ doc, past: [], future: [], lastLabel: undefined, lastChangeAt: 0, ...(fileName ? { fileName } : {}) });
  },
  setFileName(fileName) {
    set({ fileName });
  },
  undo() {
    const { past, future, doc } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    set({ doc: prev.doc, past: past.slice(0, -1), future: [{ doc, label: prev.label }, ...future], lastLabel: undefined });
  },
  redo() {
    const { past, future, doc } = get();
    const next = future[0];
    if (!next) return;
    set({ doc: next.doc, past: [...past, { doc, label: next.label }], future: future.slice(1), lastLabel: undefined });
  },
}));
