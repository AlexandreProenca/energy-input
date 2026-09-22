import { describe, expect, it } from 'vitest';
import { bandPath, carpetCells, divergingColor, linearScale, niceTicks, polylinePath } from '../plot';

describe('escala linear', () => {
  it('mapeia domínio em faixa, inclusive invertida (y cresce para baixo no SVG)', () => {
    const s = linearScale({ min: 0, max: 10 }, { min: 100, max: 0 });
    expect(s(0)).toBe(100);
    expect(s(10)).toBe(0);
    expect(s(5)).toBe(50);
  });

  it('não divide por zero em domínio degenerado', () => {
    // Uma zona com temperatura constante tem min === max. Sem esta guarda o resultado é
    // Infinity, e a curva some da tela sem erro nenhum.
    const s = linearScale({ min: 20, max: 20 }, { min: 0, max: 100 });
    expect(s(20)).toBe(50);
    expect(Number.isFinite(s(20))).toBe(true);
  });
});

describe('marcações de eixo', () => {
  it('usa passos redondos e fica dentro do domínio', () => {
    const t = niceTicks(0, 100, 5);
    expect(t).toEqual([0, 20, 40, 60, 80, 100]);
    // O passo é constante e de 1, 2 ou 5 vezes potência de dez.
    const passos = t.slice(1).map((v, i) => v - t[i]);
    expect(new Set(passos).size).toBe(1);
  });

  it('não deixa erro de ponto flutuante chegar ao rótulo do eixo', () => {
    // Multiplicar por inteiro evita ACUMULAR erro, mas não escapa da representação:
    // `3 × 0,1` é 0,30000000000000004, e esse número iria inteiro para o eixo.
    const t = niceTicks(0, 1, 10);
    expect(t).toContain(0.3);
    for (const v of t) expect(String(v).length).toBeLessThan(6);
  });

  it('devolve lista vazia em domínio degenerado ou não finito', () => {
    expect(niceTicks(5, 5)).toEqual([]);
    expect(niceTicks(NaN, 10)).toEqual([]);
    expect(niceTicks(0, Infinity)).toEqual([]);
  });

  it('funciona com domínio negativo e com números pequenos', () => {
    expect(niceTicks(-10, 10, 4)).toContain(0);
    expect(niceTicks(0, 0.5, 5).length).toBeGreaterThan(1);
  });
});

describe('caminhos SVG', () => {
  it('lista vazia não vira "M NaN NaN"', () => {
    // O SVG com `d` inválido não avisa, só não desenha.
    expect(polylinePath([])).toBe('');
    expect(bandPath([], [])).toBe('');
  });

  it('quebra a linha em ponto não finito, em vez de emendar por cima do buraco', () => {
    // Emendar desenharia um segmento que os dados não sustentam — a lacuna tem de aparecer.
    const d = polylinePath([{ x: 0, y: 0 }, { x: 1, y: NaN }, { x: 2, y: 2 }]);
    expect(d).toBe('M0 0M2 2');
    expect(d).not.toContain('NaN');
  });

  it('a banda fecha o caminho e volta pelo lado de baixo', () => {
    const d = bandPath([{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 5 }, { x: 10, y: 5 }]);
    expect(d).toBe('M0 0L10 0L10 5L0 5Z');
  });

  it('recusa banda com lados de comprimentos diferentes', () => {
    // Emparelhar por índice o que não corresponde produziria uma faixa plausível e errada.
    expect(bandPath([{ x: 0, y: 0 }], [{ x: 0, y: 1 }, { x: 1, y: 2 }])).toBe('');
  });
});

describe('carpete', () => {
  it('a hora 24 é a última linha do mesmo dia, não a primeira do seguinte', () => {
    // Errar isto desloca o carpete inteiro em uma linha e um dia.
    const cells = carpetCells([{ hour: 1, value: 1 }, { hour: 24, value: 2 }], () => 0);
    expect(cells).toEqual([{ col: 0, row: 0, value: 1 }, { col: 0, row: 23, value: 2 }]);
  });

  it('descarta hora fora de 1..24 e valor não finito', () => {
    const cells = carpetCells(
      [{ hour: 0, value: 1 }, { hour: 25, value: 2 }, { hour: 5, value: NaN }, { hour: 5, value: 9 }],
      () => 0,
    );
    expect(cells).toEqual([{ col: 0, row: 4, value: 9 }]);
  });

  it('um ano horário vira 8760 células em 365 colunas', () => {
    const pontos = Array.from({ length: 8760 }, (_, i) => ({ hour: (i % 24) + 1, value: i }));
    const cells = carpetCells(pontos, (i) => Math.floor(i / 24));
    expect(cells).toHaveLength(8760);
    expect(new Set(cells.map(c => c.col)).size).toBe(365);
    expect(new Set(cells.map(c => c.row)).size).toBe(24);
  });
});

describe('cor divergente', () => {
  it('o centro é neutro e os extremos são frio e quente', () => {
    const d = { min: 10, max: 30 };
    expect(divergingColor(20, d)).toBe('#f1f5f9');
    expect(divergingColor(10, d)).toBe('#5b9bc0');
    expect(divergingColor(30, d)).toBe('#ef6c35');
  });

  it('fecha nas bordas em vez de extrapolar para fora da legenda', () => {
    const d = { min: 10, max: 30 };
    expect(divergingColor(-50, d)).toBe(divergingColor(10, d));
    expect(divergingColor(999, d)).toBe(divergingColor(30, d));
  });

  it('é determinística e sempre devolve cor hexadecimal válida', () => {
    const d = { min: 0, max: 40 };
    for (let v = -10; v <= 50; v += 3) {
      expect(divergingColor(v, d)).toMatch(/^#[0-9a-f]{6}$/);
      expect(divergingColor(v, d)).toBe(divergingColor(v, d));
    }
  });

  it('valor ausente tem cor própria, para a lacuna não parecer temperatura', () => {
    expect(divergingColor(NaN, { min: 0, max: 40 })).toBe('#e2e8f0');
  });
});

describe('escala da moldura com domínio de borda', () => {
  it('série constante não desaparece: o domínio degenerado cai no meio da área', () => {
    // Era o caso em que a barra e a grade divergiam — a moldura usava `min + 1` e a barra
    // usava `max`. Com a escala vinda da moldura, as duas concordam por construção.
    const s = linearScale({ min: 7, max: 7 }, { min: 200, max: 0 });
    expect(s(7)).toBe(100);
  });

  it('a escala é a mesma para as marcações e para o desenho', () => {
    const dominio = { min: 0, max: 20 };
    const s = linearScale(dominio, { min: 180, max: 10 });
    for (const t of niceTicks(dominio.min, dominio.max, 4)) {
      expect(Number.isFinite(s(t))).toBe(true);
      expect(s(t)).toBeLessThanOrEqual(180);
      expect(s(t)).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('orientação do carpete', () => {
  it('a linha 0 é a madrugada e a 23 é o fim da noite', () => {
    // O eixo do painel precisa rotular o TOPO como 0h: a linha 0 é a hora 1 do contrato,
    // isto é, o intervalo 0h–1h. Os rótulos estavam invertidos e diziam 24h no topo.
    const cells = carpetCells(
      [{ hour: 1, value: 1 }, { hour: 13, value: 2 }, { hour: 24, value: 3 }],
      () => 0,
    );
    expect(cells.find((c) => c.value === 1)!.row).toBe(0); // 0h–1h, no topo
    expect(cells.find((c) => c.value === 2)!.row).toBe(12); // 12h–13h, no meio
    expect(cells.find((c) => c.value === 3)!.row).toBe(23); // 23h–24h, na base
  });
});
