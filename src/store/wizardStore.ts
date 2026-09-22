import { create } from 'zustand';
import { defaultAnswers, type WizardAnswers } from '@/generators/answers';
import { generateDocument } from '@/generators/compose';
import { templates, byId } from '@/templates';
import { planWizardSync, type ConflictResolution, type OwnershipMap } from '@/core/sync/wizardSync';
import type { ObjectRef } from '@/core/epjson/types';
import { useDocumentStore } from './documentStore';
import { useSchemaStore } from './schemaStore';
import { useUiStore } from './uiStore';

interface WizardState {
  answers: WizardAnswers;
  owned: OwnershipMap;
  /** False when the current document did not come from the wizard (opened/new file). */
  linked: boolean;
  /** Remembered choice for edit conflicts in this session. */
  policy?: ConflictResolution;
  /** A change waiting for the user's conflict decision; `previous` is restored on cancel. */
  pending?: { answers: WizardAnswers; previous: WizardAnswers; conflicts: ObjectRef[] };
  update: <K extends keyof WizardAnswers>(step: K, patch: Partial<WizardAnswers[K]>) => void;
  resolve: (choice: ConflictResolution, remember: boolean) => void;
  cancelPending: () => void;
  /** Starts a wizard project from the current answers, replacing the document. */
  startFresh: (answers?: WizardAnswers) => void;
  unlink: () => void;
  hydrate: (s: Pick<WizardState, 'answers' | 'owned' | 'linked'>) => void;
}

function generate(answers: WizardAnswers) {
  const version = useSchemaStore.getState().version ?? '26.1';
  return generateDocument(answers, templates, version).document;
}

export const useWizardStore = create<WizardState>((set, get) => ({
  answers: defaultAnswers(),
  owned: {},
  linked: true,

  update(step, patch) {
    const prev = get().answers;
    const answers: WizardAnswers = { ...prev, [step]: { ...prev[step], ...patch } };
    if (step === 'envelope' && 'presetId' in patch && patch.presetId !== prev.envelope.presetId) {
      const apartment = patch.presetId === 'apartamento';
      answers.geometry = { ...answers.geometry, groundFloor: apartment ? 'adjacent' : 'slab', topFloor: apartment ? 'adjacent' : 'roof' };
      answers.windows = { ...answers.windows, glazingId: apartment ? 'pvc_4mm' : 'simples' };
    }
    // Choosing a building use resets the thermostat to that use's defaults.
    if (step === 'loads' && 'useId' in patch && patch.useId !== prev.loads.useId) {
      const use = byId(templates.buildingUses, answers.loads.useId);
      answers.hvac = { ...answers.hvac, heatingSetpoint: use.heatingSetpoint, coolingSetpoint: use.coolingSetpoint };
    }
    // A picked city carries its bioclimatic zone.
    if (step === 'location' && 'cityId' in patch && answers.location.source === 'city') {
      answers.location = { ...answers.location, zb: byId(templates.cities, answers.location.cityId).zb };
    }
    if (!get().linked) {
      set({ answers });
      return;
    }
    const { owned, policy } = get();
    let generated;
    try {
      generated = generate(answers);
    } catch (e) {
      // Inputs are range-checked in the UI; this only guards against bad restored/imported state.
      useUiStore.getState().toast(e instanceof Error ? e.message : String(e), 'error');
      set({ answers });
      return;
    }
    const plan = planWizardSync(useDocumentStore.getState().doc, generated, owned, policy ?? 'keep');
    if (plan.conflicts.length > 0 && !policy) {
      set({ answers, pending: { answers, previous: get().pending?.previous ?? prev, conflicts: plan.conflicts } });
      return;
    }
    set({ answers, owned: plan.owned, pending: undefined });
    useDocumentStore.getState().commit(plan.next, 'Assistente');
  },

  resolve(choice, remember) {
    const pending = get().pending;
    if (!pending) return;
    const plan = planWizardSync(useDocumentStore.getState().doc, generate(pending.answers), get().owned, choice);
    set({ owned: plan.owned, pending: undefined, policy: remember ? choice : get().policy });
    useDocumentStore.getState().commit(plan.next, 'Assistente');
  },

  cancelPending() {
    const pending = get().pending;
    set({ pending: undefined, ...(pending ? { answers: pending.previous } : {}) });
  },

  startFresh(answers) {
    const a = answers ?? get().answers;
    const plan = planWizardSync({}, generate(a), {}, 'overwrite');
    set({ answers: a, owned: plan.owned, linked: true, pending: undefined, policy: undefined });
    useDocumentStore.getState().reset(plan.next, 'modelo.epJSON');
    useDocumentStore.setState((s) => ({ origin: { kind: 'generated' }, revision: s.revision + 1 }));
  },

  unlink() {
    set({ linked: false, owned: {}, pending: undefined, policy: undefined });
  },

  hydrate(s) {
    set({ answers: { ...defaultAnswers(), ...s.answers }, owned: s.owned, linked: s.linked, pending: undefined, policy: undefined });
  },
}));
