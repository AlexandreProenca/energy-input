import { describe, expect, it } from 'vitest';
import { MAXIMO_DE_ACHADOS, renderReport } from '../report';
import type { Finding, Review } from '../parse';

const achado = (over: Partial<Finding> = {}): Finding => ({
  severity: 'high', confidence: 0.75, path: 'src/core/x.ts', line: 42, title: 'Título',
  failure_scenario: 'Falha assim', evidence: 'A linha tal', suggested_test: 'Testar isso',
  ...over,
});

describe('relatório sem achados', () => {
  it('usa o resumo do modelo quando há um', () => {
    expect(renderReport({ findings: [], summary: '  Tudo certo.  ' })).toBe('Tudo certo.');
  });

  it('cai numa frase própria quando nem resumo há', () => {
    // Comentário vazio no PR seria pior que nenhum: parece que a revisão quebrou.
    expect(renderReport({ findings: [], summary: '' })).toMatch(/Nenhum defeito demonstrável/);
  });
});

describe('relatório com achados', () => {
  it('monta o bloco com severidade em pt-BR e confiança em porcentagem', () => {
    const md = renderReport({ findings: [achado()], summary: 'Resumo.' });
    expect(md).toContain('### [ALTA] Título');
    expect(md).toContain('`src/core/x.ts:42` · confiança: 75%');
    expect(md).toContain('**Cenário de falha:** Falha assim');
    expect(md).toContain('### Resumo da Análise\n\nResumo.');
  });

  it('traduz as quatro severidades', () => {
    const md = renderReport({
      findings: (['critical', 'high', 'medium', 'low'] as const).map((s) => achado({ severity: s })),
      summary: 'x',
    });
    for (const pt of ['CRÍTICA', 'ALTA', 'MÉDIA', 'BAIXA']) expect(md).toContain(`[${pt}]`);
  });

  it('arredonda a confiança em vez de imprimir a fração crua', () => {
    expect(renderReport({ findings: [achado({ confidence: 0.666 })], summary: 'x' }))
      .toContain('confiança: 67%');
  });
});

describe('corte em cinco achados', () => {
  const muitos = (n: number): Review => ({
    findings: Array.from({ length: n }, (_, i) => achado({ title: `Achado ${i + 1}` })),
    summary: 'x',
  });

  it('mostra no máximo cinco', () => {
    const md = renderReport(muitos(12));
    expect(md).toContain('Achado 5');
    expect(md).not.toContain('Achado 6');
  });

  /**
   * O que a versão em Python não fazia: ela cortava em cinco **em silêncio**. Um relatório
   * que mostra cinco de doze sem dizer nada deixa quem lê achando que viu tudo.
   */
  it('diz quantos ficaram de fora', () => {
    expect(renderReport(muitos(12))).toContain('Mais 7 achados');
  });

  it('concorda no singular', () => {
    expect(renderReport(muitos(MAXIMO_DE_ACHADOS + 1))).toContain('Mais 1 achado de severidade menor não foi listado');
  });

  it('não diz nada quando nada ficou de fora', () => {
    expect(renderReport(muitos(MAXIMO_DE_ACHADOS))).not.toContain('Mais ');
  });
});
