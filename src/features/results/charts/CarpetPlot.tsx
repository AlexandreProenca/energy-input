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
export function CarpetPlot({ label, cells, dominio, unidade, resumoMensal, vazio, cor, legenda }: {
  label: string;
  cells: CarpetCell[];
  dominio: Range;
  unidade?: string;
  /** Média por mês, para a alternativa textual. */
  resumoMensal?: { mes: number; valor: number }[];
  vazio?: string;
  /**
   * Cor de cada célula. O padrão é a escala divergente contínua, que é o que o carpete de
   * temperatura quer. O painel de desconforto passa uma função **categórica** — frio, ok,
   * quente —, porque ali o valor da célula é um estado e não uma grandeza: interpolá-lo
   * produziria tons intermediários entre "frio" e "confortável", que não existem.
   */
  cor?: (value: number) => string;
  /** Legenda visível, necessária quando a cor é categórica e não tem eixo que a explique. */
  legenda?: { rotulo: string; cor: string }[];
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
      ctx.fillStyle = cor ? cor(c.value) : divergingColor(c.value, dominio);
      // Meio pixel a mais evita a costura clara entre células vizinhas.
      ctx.fillRect(c.col * larguraCelula, c.row * alturaCelula, larguraCelula + 0.5, alturaCelula + 0.5);
    }
  }, [cells, colunas, dominio, cor]);

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
        {/*
          A linha 0 do carpete é a hora 1 do contrato, isto é, o intervalo 0h–1h, e é
          desenhada no TOPO. A linha 23 é a hora 24, na base. Os rótulos estavam invertidos:
          diziam 24h no topo, onde está a madrugada. Conferido por leitura de pixel — a
          linha do meio (início da tarde) é a mais quente, como tem de ser.
        */}
        <div className="flex w-6 flex-col justify-between py-0.5 text-[10px] leading-none text-slate-400">
          <span>0h</span>
          <span>12h</span>
          <span>24h</span>
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
      {legenda && legenda.length > 0 && (
        <div className="ml-8 flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-slate-600">
          {legenda.map((l) => (
            <span key={l.rotulo} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.cor }} aria-hidden />
              {l.rotulo}
            </span>
          ))}
        </div>
      )}
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
