import { beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreSnapshot } from '../persistence';
import { useUiStore } from '../uiStore';
import { defaultAnswers } from '@/generators/answers';

const KEY = 'energy-input:autosave:v1';

/** Snapshot mínimo que `restoreSnapshot` aceita, com o `mode` sob teste. */
const snapshot = (mode?: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({
  savedAt: '2026-09-22T12:00:00.000Z',
  doc: { Building: { Teste: {} } },
  fileName: 'teste.epJSON',
  answers: defaultAnswers(),
  owned: {},
  linked: true,
  wizardStep: 'project',
  visitedSteps: ['project'],
  ...(mode === undefined ? {} : { mode }),
  ...extra,
});

beforeEach(() => {
  const valores = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    setItem: (k: string, v: string) => valores.set(k, v),
    getItem: (k: string) => valores.get(k) ?? null,
    removeItem: (k: string) => valores.delete(k),
  });
  useUiStore.setState({ mode: 'basic' });
});

describe('restauração do modo pelo autosave', () => {
  it('restaura o modo Resultados', () => {
    localStorage.setItem(KEY, snapshot('results'));
    restoreSnapshot();
    expect(useUiStore.getState().mode).toBe('results');
  });

  it('restaura sessão antiga, anterior ao modo Resultados, sem `mode` gravado', () => {
    localStorage.setItem(KEY, snapshot(undefined));
    restoreSnapshot();
    expect(useUiStore.getState().mode).toBe('basic');
  });

  it('cai no assistente quando o modo gravado é desconhecido', () => {
    // O autosave vive em localStorage e sobrevive a versões do aplicativo: um modo de uma
    // versão futura, ou storage corrompido, abriria o app numa tela que nenhum componente
    // reconhece — página em branco, sem explicação.
    for (const invalido of ['dashboards', '', 'RESULTS', 42, null]) {
      useUiStore.setState({ mode: 'expert' });
      localStorage.setItem(KEY, snapshot(invalido));
      restoreSnapshot();
      expect(useUiStore.getState().mode).toBe('basic');
    }
  });

  it('os modos válidos continuam sendo aceitos', () => {
    for (const modo of ['basic', 'geometry', 'expert', 'results'] as const) {
      localStorage.setItem(KEY, snapshot(modo));
      restoreSnapshot();
      expect(useUiStore.getState().mode).toBe(modo);
    }
  });
});

describe('restauração da etapa do assistente (T026)', () => {
  /**
   * Sessões salvas antes da união das etapas podem estar paradas numa etapa que deixou de ser
   * página. Sem normalizar, o assistente abriria numa página que nenhum componente desenha.
   */
  it('leva a etapa antiga à página que a mostra agora', () => {
    localStorage.setItem(KEY, snapshot('basic', { wizardStep: 'hvac', visitedSteps: ['project', 'location', 'envelope', 'windows'] }));
    restoreSnapshot();
    expect(useUiStore.getState().wizardStep).toBe('loads');
    expect(useUiStore.getState().visitedSteps).toEqual(['project', 'envelope']);
  });

  it('volta ao começo quando a etapa gravada é desconhecida', () => {
    localStorage.setItem(KEY, snapshot('basic', { wizardStep: 'algo-futuro', visitedSteps: 'não é lista' }));
    restoreSnapshot();
    expect(useUiStore.getState().wizardStep).toBe('project');
    expect(useUiStore.getState().visitedSteps).toEqual(['project']);
  });

  it('ir para uma etapa unida abre a página que a mostra', () => {
    // É o que o botão "Editar Janelas" da Revisão faz.
    useUiStore.getState().goToStep('windows');
    expect(useUiStore.getState().wizardStep).toBe('envelope');
    expect(useUiStore.getState().visitedSteps).toContain('envelope');
    expect(useUiStore.getState().visitedSteps).not.toContain('windows');
  });
});
