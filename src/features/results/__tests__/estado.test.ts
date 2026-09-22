import { describe, expect, it } from 'vitest';
import { estadoDoPainel, semAnoCompleto, usosFinaisEmKwh } from '../estado';
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

describe('usos finais convertidos para kWh', () => {
  it('descarta recurso que não é energia, em vez de somá-lo como zero', () => {
    // `end_uses` mistura GJ e m3 na mesma lista. Somar a água como zero pareceria correto e
    // esconderia que o dado foi ignorado; somá-la como número seria pior ainda.
    const barras = usosFinaisEmKwh([
      { category: 'Cooling', resources: [
        { resource: 'Electricity', value: 3.6, units: 'GJ' },
        { resource: 'Water', value: 1000, units: 'm3' },
      ] },
    ]);
    expect(barras).toHaveLength(1);
    expect(barras[0].valor).toBeCloseTo(1000, 6); // 3,6 GJ = 1000 kWh
  });

  it('omite categoria inteiramente zerada', () => {
    // O motor devolve os 14 recursos sempre. Sem o filtro, o gráfico teria dezenas de
    // barras invisíveis e uma legenda ilegível.
    const zerada = Array.from({ length: 14 }, (_, i) => ({ resource: `R${i}`, value: 0, units: 'GJ' }));
    expect(usosFinaisEmKwh([{ category: 'Heating', resources: zerada }])).toEqual([]);
  });

  it('soma os recursos de energia da mesma categoria', () => {
    const barras = usosFinaisEmKwh([
      { category: 'Interior Lighting', resources: [
        { resource: 'Electricity', value: 3.6, units: 'GJ' },
        { resource: 'Natural Gas', value: 3_600_000, units: 'J' },
      ] },
    ]);
    expect(barras[0].valor).toBeCloseTo(1001, 6);
  });
});
