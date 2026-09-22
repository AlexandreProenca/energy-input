import { ChartFrame } from './ChartFrame';
import { fmt } from '@/ui/primitives';

export interface SerieEmpilhada {
  nome: string;
  cor: string;
  /** Um valor por faixa, na mesma ordem dos rótulos. */
  valores: number[];
}

/**
 * Barras empilhadas, para composição por categoria — consumo mensal por uso final, por
 * exemplo. Recebe valores já agregados e convertidos; não calcula nada.
 *
 * Séries inteiramente nulas são omitidas da pilha e da legenda: o resumo do motor devolve os
 * 14 recursos sempre, mesmo zerados, e desenhá-los produziria uma legenda com dez entradas
 * invisíveis.
 */
export function StackedBarChart({ label, rotulos, series, unidade, vazio }: {
  label: string;
  rotulos: string[];
  series: SerieEmpilhada[];
  unidade?: string;
  vazio?: string;
}) {
  const visiveis = series.filter((s) => s.valores.some((v) => Number.isFinite(v) && v !== 0));
  const totais = rotulos.map((_, i) => visiveis.reduce((a, s) => a + (s.valores[i] || 0), 0));
  const max = totais.length ? Math.max(...totais, 0) : 0;

  return (
    <div className="space-y-2">
      <ChartFrame
        label={label}
        dominioY={{ min: 0, max: max || 1 }}
        rotulosX={rotulos}
        unidade={unidade}
        vazio={vazio ?? (visiveis.length === 0 ? 'Nenhum recurso com consumo nesta execução.' : undefined)}
      >
        {({ x0, x1, y0, y1 }) => {
          const faixa = (x1 - x0) / Math.max(rotulos.length, 1);
          // Teto de largura: com uma categoria só, `faixa` é a área inteira e a barra vira
        // um bloco que ocupa o gráfico. Acontece de verdade — há execução real com um único
        // uso final consumindo.
        const largura = Math.min(72, Math.max(2, faixa * 0.62));
          const altura = (v: number) => (max === 0 ? 0 : (v / max) * (y1 - y0));
          return rotulos.map((rotulo, i) => {
            let acumulado = 0;
            return (
              <g key={rotulo + i}>
                {visiveis.map((s) => {
                  const v = s.valores[i] || 0;
                  const h = altura(v);
                  const y = y1 - altura(acumulado) - h;
                  acumulado += v;
                  if (h <= 0) return null;
                  return (
                    <rect key={s.nome} x={x0 + faixa * i + (faixa - largura) / 2} y={y} width={largura} height={h} fill={s.cor}>
                      <title>{`${rotulo} · ${s.nome}: ${fmt(v, 2)}${unidade ? ` ${unidade}` : ''}`}</title>
                    </rect>
                  );
                })}
              </g>
            );
          });
        }}
      </ChartFrame>
      {visiveis.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {visiveis.map((s) => (
            <li key={s.nome} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.cor }} aria-hidden />
              {s.nome}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
