import { describe, expect, it } from 'vitest';
import { defaultAnswers } from '../answers';
import { generateDocument } from '../compose';
import { templates } from '@/templates';

describe('saídas padrão do assistente', () => {
  it('derivam de `defaultOn`, sem lista duplicada', () => {
    // Esta é a trava da divergência. Antes, `answers.ts` repetia os ids numa lista literal e
    // nada lia `defaultOn`: as duas fontes coincidiam por acaso, e quem tentasse mudar o
    // padrão editando só o JSON não mudaria nada.
    const esperado = templates.outputs.filter((p) => p.defaultOn).map((p) => p.id);
    expect(defaultAnswers().outputs.selected).toEqual(esperado);
  });

  it('incluem o preset de conforto', () => {
    expect(defaultAnswers().outputs.selected).toContain('conforto');
  });

  it('o documento padrão pede a temperatura operativa que os painéis consomem', () => {
    // Sem esta variável, o painel de temperatura e as horas de desconforto (T005) não têm
    // fonte: o resumo permanente não traz série, e o cálculo depende dela.
    const doc = generateDocument(defaultAnswers(), templates).document;
    const nomes = Object.values(doc['Output:Variable'] ?? {}).map((v) => (v as { variable_name: string }).variable_name);
    expect(nomes).toContain('Zone Operative Temperature');
    // A externa vem junto porque a faixa adaptativa da T005 depende dela.
    expect(nomes).toContain('Site Outdoor Air Drybulb Temperature');
  });

  it('continua pedindo o SQLite, sem o qual não existe série nenhuma', () => {
    // `/results/timeseries` lê o `eplusout.sql`. Desligar o preset `resumo` por engano
    // deixaria todos os painéis vazios sem erro aparente.
    const doc = generateDocument(defaultAnswers(), templates).document;
    expect(doc['Output:SQLite']).toBeDefined();
  });

  it('não liga preset que custa caro sem ninguém ter pedido', () => {
    // `geometria` gera DXF e não alimenta painel nenhum.
    expect(defaultAnswers().outputs.selected).not.toContain('geometria');
  });
});
