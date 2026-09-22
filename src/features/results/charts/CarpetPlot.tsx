import { useEffect, useMemo, useRef } from 'react';
import { divergingColor, type CarpetCell, type Range } from '@/core/results/plot';
import { fmt } from '@/ui/primitives';

const MESES = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/**
 * Carpete dia × hora do ano inteiro.
 *
 * Em `<canvas>`, e não em SVG: um ano horário são 8 760 células, e 8 760 `<rect>` no DOM
 * pesam demais — o `WeeklyHeatmap` do assistente desenha 168 e já é o limite confortável.
 *
 * Canvas é invisível para leitor de tela, então vai acompanhado de uma tabela de médias
 * mensais em `sr-only`. O PRD §5.2 compromete acessibilidade, e um elemento que só existe
 * como pixel não a cumpre.
 */
export function CarpetPlot({ label, cells, dominio, unidade, resumoMensal, vazio }: {
  label: string;
  cells: CarpetCell[];
  dominio: Range;
  unidade?: string;
  /** Média por mês, para a alternativa textual. */
  resumoMensal?: { mes: number; valor: number }[];
  vazio?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Memoizado porque um ano horário são 8 760 células: sem isto, cada render percorre a
  // lista inteira e espalha 8 760 argumentos em `Math.max` só para descobrir a largura.
  const colunas = useMemo(() => (cells.length ? cells.reduce((m, c) => (c.col > m ? c.col : m), 0) + 1 : 0), [cells]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || colunas === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const larguraCelula = canvas.width / colunas;
    const alturaCelula = canvas.height / 24;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const c of cells) {
      ctx.fillStyle = divergingColor(c.value, dominio);
      // Meio pixel a mais evita a costura clara entre células vizinhas.
      ctx.fillRect(c.col * larguraCelula, c.row * alturaCelula, larguraCelula + 0.5, alturaCelula + 0.5);
    }
  }, [cells, colunas, dominio]);

  if (vazio || colunas === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-200 px-6 text-center text-sm text-slate-500">
        {vazio ?? 'Sem dados para o carpete.'}
      </div>
    );
  }

  return (
    <figure className="space-y-1">
      <div className="flex gap-2">
        <div className="flex w-6 flex-col justify-between py-0.5 text-[10px] leading-none text-slate-400">
          <span>24h</span>
          <span>12h</span>
          <span>0h</span>
        </div>
        <canvas
          ref={ref}
          width={colunas}
          height={24}
          className="h-[180px] w-full rounded-lg"
          style={{ imageRendering: 'pixelated' }}
          role="img"
          aria-label={label}
        />
      </div>
      <div className="ml-8 flex justify-between text-[10px] text-slate-400">
        {MESES.map((m, i) => <span key={i}>{m}</span>)}
      </div>
      {resumoMensal && resumoMensal.length > 0 && (
        <table className="sr-only">
          <caption>{`${label} — média por mês`}</caption>
          <tbody>
            {resumoMensal.map((r) => (
              <tr key={r.mes}>
                <th scope="row">{`Mês ${r.mes}`}</th>
                <td>{`${fmt(r.valor, 1)}${unidade ? ` ${unidade}` : ''}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
