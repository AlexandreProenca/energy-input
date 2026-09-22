import type { ReactNode } from 'react';
import { niceTicks, type Range } from '@/core/results/plot';
import { fmt } from '@/ui/primitives';

/**
 * Moldura comum dos gráficos: área de desenho, eixos e os estados de vazio.
 *
 * Todo gráfico passa por aqui para que o nome acessível nunca seja esquecido — um `<svg>`
 * sem `role` e `aria-label` é invisível para leitor de tela, e o PRD §5.2 compromete
 * acessibilidade. Segue o precedente de `src/features/wizard/illustrations.tsx`: SVG a mão,
 * `viewBox`, `<title>` como dica, sem dependência de biblioteca.
 */

export const MARGENS = { esquerda: 46, direita: 10, topo: 10, base: 24 };

export interface ChartFrameProps {
  /** Nome acessível do gráfico. Obrigatório de propósito. */
  label: string;
  largura?: number;
  altura?: number;
  /** Domínio do eixo vertical, já calculado por quem tem os dados. */
  dominioY: Range;
  /** Rótulos do eixo horizontal, na ordem das faixas. */
  rotulosX?: string[];
  unidade?: string;
  /**
   * Recebe a área útil **e a escala vertical da moldura**, e devolve o conteúdo.
   *
   * A escala vem daqui de propósito: é a mesma que desenha as linhas de grade. Quando o
   * filho calcula a sua, as duas divergem no caso de borda — série constante, domínio com
   * folga — e as barras deixam de bater com a grade sem que nada acuse.
   */
  children: (area: { x0: number; x1: number; y0: number; y1: number; escalaY: (v: number) => number }) => ReactNode;
  /** Mensagem no lugar do gráfico quando não há o que desenhar. */
  vazio?: string;
}

export function ChartFrame({
  label,
  largura = 720,
  altura = 220,
  dominioY,
  rotulosX,
  unidade,
  children,
  vazio,
}: ChartFrameProps) {
  const x0 = MARGENS.esquerda;
  const x1 = largura - MARGENS.direita;
  const y0 = MARGENS.topo;
  const y1 = altura - MARGENS.base;
  const ticks = niceTicks(dominioY.min, dominioY.max, 4);
  const escalaY = (v: number) =>
    dominioY.max === dominioY.min ? (y0 + y1) / 2 : y1 - ((v - dominioY.min) / (dominioY.max - dominioY.min)) * (y1 - y0);

  if (vazio) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 px-6 text-center text-sm text-slate-500">
        {vazio}
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full" role="img" aria-label={label}>
      {/* Linhas de grade e rótulos do eixo vertical. */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x0} x2={x1} y1={escalaY(t)} y2={escalaY(t)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={x0 - 6} y={escalaY(t) + 3.5} fontSize="10" textAnchor="end" fill="#94a3b8">
            {fmt(t, 1)}
          </text>
        </g>
      ))}
      {unidade && (
        <text x={x0 - 6} y={y0 - 1} fontSize="9" textAnchor="end" fill="#cbd5e1">
          {unidade}
        </text>
      )}

      {children({ x0, x1, y0, y1, escalaY })}

      {/* Eixo horizontal por último, para ficar acima do desenho. */}
      <line x1={x0} x2={x1} y1={y1} y2={y1} stroke="#cbd5e1" strokeWidth="1" />
      {rotulosX?.map((r, i) => {
        const faixa = (x1 - x0) / rotulosX.length;
        return (
          <text key={i} x={x0 + faixa * (i + 0.5)} y={altura - 8} fontSize="10" textAnchor="middle" fill="#94a3b8">
            {r}
          </text>
        );
      })}
    </svg>
  );
}
