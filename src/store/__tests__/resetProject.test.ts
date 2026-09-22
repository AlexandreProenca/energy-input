import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentStore as document } from '../documentStore';
import { useWizardStore as wizard } from '../wizardStore';
import { useUiStore as ui } from '../uiStore';
import { useExpertStore as expert } from '@/features/expert/expertStore';
import { useGeometryUi as geometry } from '@/features/geometry/geometryStore';
import { defaultAnswers } from '@/generators/answers';
import { resetProject } from '../resetProject';
import { restoreSnapshot, startAutosave } from '../persistence';

const uploaded = { Building: { Original: { north_axis: 23 } } };
const key = 'energy-input:autosave:v1';
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => entries.set(k, v),
    removeItem: (k: string) => entries.delete(k),
  });
  wizard.getState().startFresh(defaultAnswers());
});
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

function openUpload() {
  document.getState().openUpload(uploaded, 'original.epJSON');
  wizard.getState().unlink();
}

describe('reset de edição', () => {
  it('restaura upload e nome, descarta histórico, seleções e conflitos, e permite resets repetidos', () => {
    openUpload();
    // Mutating the active document cannot mutate the original baseline.
    document.getState().doc.Building.Original.north_axis = 90;
    document.getState().commit({ Building: { Alterado: {} } }, 'Editar');
    document.getState().setFileName('alterado.epJSON');
    expert.setState({ dirty: true, pendingNav: { type: 'Building' } });
    geometry.setState({ selection: { kind: 'zone', name: 'antiga' }, levelZone: 'antiga' });
    wizard.setState({ policy: 'keep', pending: { answers: defaultAnswers(), previous: defaultAnswers(), conflicts: [] } });
    const revision = document.getState().revision;
    resetProject();
    expect(document.getState().doc).toEqual(uploaded);
    expect(document.getState().fileName).toBe('original.epJSON');
    expect(document.getState().past).toEqual([]);
    expect(document.getState().future).toEqual([]);
    expect(document.getState().revision).toBeGreaterThan(revision);
    expect(expert.getState().dirty).toBe(false);
    expect(expert.getState().pendingNav).toBeUndefined();
    expect(geometry.getState().selection).toBeUndefined();
    expect(geometry.getState().levelZone).toBeUndefined();
    expect(wizard.getState().pending).toBeUndefined();
    expect(wizard.getState().policy).toBeUndefined();
    expect(wizard.getState().linked).toBe(false);
    document.getState().doc.Building.Original.north_axis = 180;
    resetProject();
    expect(document.getState().doc).toEqual(uploaded);
  });

  it('persiste o upload original independentemente do documento editado', () => {
    stop = startAutosave();
    openUpload();
    document.getState().commit({ Building: { Editado: {} } }, 'Editar');
    vi.advanceTimersByTime(800);
    wizard.getState().startFresh(defaultAnswers());
    expect(restoreSnapshot()).toBeTruthy();
    expect(document.getState().doc.Building.Editado).toEqual({});
    resetProject();
    expect(document.getState().doc).toEqual(uploaded);
  });

  it('substitui a referência ao abrir outro upload e aceita upload vazio', () => {
    openUpload();
    document.getState().openUpload({}, 'vazio.epJSON');
    stop = startAutosave();
    document.getState().setFileName('temporario.epJSON');
    vi.advanceTimersByTime(800);
    expect(restoreSnapshot()).toBeTruthy();
    resetProject();
    expect(document.getState().doc).toEqual({});
    expect(document.getState().fileName).toBe('vazio.epJSON');
  });

  it('novo projeto abandona a referência do upload e retorna às respostas iniciais', () => {
    openUpload();
    wizard.getState().startFresh(defaultAnswers());
    wizard.getState().update('geometry', { floors: 3 });
    ui.setState({ mode: 'geometry', wizardStep: 'geometry', visitedSteps: ['project', 'geometry'] });
    resetProject();
    expect(document.getState().origin.kind).toBe('generated');
    expect(wizard.getState().answers).toEqual(defaultAnswers());
    expect(wizard.getState().linked).toBe(true);
    expect(ui.getState().mode).toBe('basic');
    expect(ui.getState().wizardStep).toBe('project');
    expect(ui.getState().visitedSteps).toEqual(['project']);
    expect(document.getState().past).toEqual([]);
    expect(document.getState().doc.Building.Original).toBeUndefined();
  });

  it('identifica explicitamente a referência recuperada de uma sessão antiga', () => {
    localStorage.setItem(key, JSON.stringify({ savedAt: '2026-09-21', doc: uploaded,
      fileName: 'antigo.epJSON', answers: defaultAnswers(), linked: false }));
    restoreSnapshot();
    expect(document.getState().origin).toMatchObject({ kind: 'upload', recovered: true });
    document.getState().commit({}, 'Apagar');
    resetProject();
    expect(document.getState().doc).toEqual(uploaded);
  });
});
