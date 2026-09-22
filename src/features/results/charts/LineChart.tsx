import { ChartFrame } from './ChartFrame';
import { bandPath, linearScale, polylinePath } from '@/core/results/plot';
import type { EnvelopeBucket } from '@/core/results/series';
import { fmt } from '@/ui/primitives';

/**
 * Curva com banda de mínimo e máximo, a partir dos baldes de `downsampleEnvelope` (T004).
 *
 * Desenha a **banda e a média**, não só a média: a reamostragem preserva os extremos de cada
 * balde justamente para que o pico continue visível depois de 8 760 pontos virarem algumas
 * centenas. Uma linha só da média esconderia o número que o engenheiro procura.
 */
export function LineChart({ label, baldes, unidade, rotulosX, vazio, cor = '#187352' }: {
  label: string;
  baldes: EnvelopeBucket[];
  unidade?: string;
  rotulosX?: string[];
  vazio?: string;
  cor?: string;
}) {
  const min = baldes.length ? Math.min(...baldes.map((b) => b.min)) : 0;
  const max = baldes.length ? Math.max(...baldes.map((b) => b.max)) : 1;
  // Uma folga de 5% evita que a curva encoste na borda e pareça cortada.
  const folga = (max - min) * 0.05 || 1;

  return (
    <ChartFrame
      label={label}
      dominioY={{ min: min - folga, max: max + folga }}
      rotulosX={rotulosX}
      unidade={unidade}
      vazio={vazio ?? (baldes.length === 0 ? 'Sem dados para este gráfico.' : undefined)}
    >
      {({ x0, x1, y0, y1 }) => {
        const ex = linearScale({ min: 0, max: Math.max(baldes.length - 1, 1) }, { min: x0, max: x1 });
        const ey = linearScale({ min: min - folga, max: max + folga }, { min: y1, max: y0 });
        const topo = baldes.map((b, i) => ({ x: ex(i), y: ey(b.max) }));
        const base = baldes.map((b, i) => ({ x: ex(i), y: ey(b.min) }));
        const media = baldes.map((b, i) => ({ x: ex(i), y: ey(b.mean) }));
        return (
          <>
            <path d={bandPath(topo, base)} fill={cor} opacity="0.16" />
            <path d={polylinePath(media)} fill="none" stroke={cor} strokeWidth="1.6" strokeLinejoin="round" />
            {/* Área transparente por balde: dá a dica sem encher o DOM de elementos visíveis. */}
            {baldes.map((b, i) => (
              <rect key={i} x={ex(i) - (x1 - x0) / baldes.length / 2} y={y0} width={(x1 - x0) / baldes.length} height={y1 - y0} fill="transparent">
                <title>
                  {`mín ${fmt(b.min, 1)} · média ${fmt(b.mean, 1)} · máx ${fmt(b.max, 1)}${unidade ? ` ${unidade}` : ''}`}
                </title>
              </rect>
            ))}
          </>
        );
      }}
    </ChartFrame>
  );
}
