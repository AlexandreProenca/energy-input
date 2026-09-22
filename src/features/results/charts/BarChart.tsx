import { ChartFrame } from './ChartFrame';
import { fmt } from '@/ui/primitives';

export interface Barra {
  rotulo: string;
  valor: number;
  /** Cor da barra; sem ela, usa o verde da marca. */
  cor?: string;
}

/**
 * Barras verticais simples, a partir de valores **já agregados** — este componente não
 * calcula nada (a aritmética é da T004).
 *
 * O domínio começa em zero de propósito: barra é comparação de magnitude, e cortar a base
 * exagera diferenças pequenas. Linha, essa sim, pode ter base recortada.
 */
export function BarChart({ label, barras, unidade, vazio }: {
  label: string;
  barras: Barra[];
  unidade?: string;
  vazio?: string;
}) {
  const valores = barras.map((b) => b.valor);
  const max = valores.length ? Math.max(...valores, 0) : 0;
  const min = valores.length ? Math.min(...valores, 0) : 0;

  return (
    <ChartFrame
      label={label}
      dominioY={{ min, max: max === min ? min + 1 : max }}
      rotulosX={barras.map((b) => b.rotulo)}
      unidade={unidade}
      vazio={vazio ?? (barras.length === 0 ? 'Sem dados para este gráfico.' : undefined)}
    >
      {({ x0, x1, y0, y1 }) => {
        const faixa = (x1 - x0) / Math.max(barras.length, 1);
        // Teto de largura: com uma categoria só, `faixa` é a área inteira e a barra vira
        // um bloco que ocupa o gráfico. Acontece de verdade — há execução real com um único
        // uso final consumindo.
        const largura = Math.min(72, Math.max(2, faixa * 0.62));
        const escala = (v: number) => (max === min ? y1 : y1 - ((v - min) / (max - min)) * (y1 - y0));
        const base = escala(Math.max(min, 0));
        return barras.map((b, i) => {
          const topo = escala(b.valor);
          const altura = Math.abs(base - topo);
          return (
            <rect
              key={b.rotulo + i}
              x={x0 + faixa * i + (faixa - largura) / 2}
              y={Math.min(base, topo)}
              width={largura}
              height={Math.max(altura, b.valor === 0 ? 0 : 1)}
              rx="2"
              fill={b.cor ?? '#187352'}
            >
              <title>{`${b.rotulo}: ${fmt(b.valor, 2)}${unidade ? ` ${unidade}` : ''}`}</title>
            </rect>
          );
        });
      }}
    </ChartFrame>
  );
}
