import { describe, expect, it } from 'vitest';
import { estadoDoPainel, semAnoCompleto } from '../estado';
import type { Simulation } from '@/features/simulation/api';

const sim = (status: string, run_type: Simulation['run_type'] = 'annual'): Simulation => ({
  id: 'sim_01M2KXB9D4TQ7F3S0YJ8N5VZQK',
  model_version_id: 'mv_01M2KXB16RP92SR9SCA3PBVMSF',
  status,
  run_type,
  engine_version: '26.1.0',
});

describe('estado do painel de resultados', () => {
  it('sem execução adotada, não há o que mostrar', () => {
    expect(estadoDoPainel(undefined)).toBe('sem-execucao');
  });

  it('enfileirada ou rodando não é erro, é espera', () => {
    // Mostrar erro aqui faria o usuário procurar um problema que não existe.
    expect(estadoDoPainel(sim('queued'))).toBe('em-andamento');
    expect(estadoDoPainel(sim('running'))).toBe('em-andamento');
  });

  it('só `succeeded` libera os painéis', () => {
    // Contraprova: qualquer outro estado terminal precisa cair em `sem-sucesso`, senão o
    // painel tentaria desenhar gráfico de uma execução que não produziu resultado.
    expect(estadoDoPainel(sim('succeeded'))).toBe('pronto');
    for (const s of ['failed', 'cancelled', 'timeout']) {
      expect(estadoDoPainel(sim(s))).toBe('sem-sucesso');
    }
  });

  it('estado desconhecido do serviço conta como em andamento, não como pronto', () => {
    // `terminal()` lista os estados finais conhecidos. Um estado novo do serviço não pode
    // ser tratado como sucesso — desenharia gráfico sobre resultado que pode não existir.
    expect(estadoDoPainel(sim('reprocessing'))).toBe('em-andamento');
  });
});

describe('execução sem ano completo', () => {
  it('dias de projeto não representam o ano', () => {
    expect(semAnoCompleto(sim('succeeded', 'design_day'))).toBe(true);
    expect(semAnoCompleto(sim('succeeded', 'annual'))).toBe(false);
  });
});
