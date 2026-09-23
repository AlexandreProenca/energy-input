import { describe, expect, it } from 'vitest';
import { PAGE_META, STEP_META } from '../steps';
import { WIZARD_PAGES, WIZARD_STEPS } from '@/generators/answers';

/**
 * `PAGE_META` monta título, pergunta e ícone de cada página a partir de `STEP_META`. Uma página
 * sem etapa correspondente quebraria o assistente na tela, e não no build — o `!` do `find`
 * cala o tipo. Veio da revisão do PR da T026.
 */
describe('metadados das páginas', () => {
  it('existem para toda página, na ordem da navegação', () => {
    expect(PAGE_META.map((p) => p.id)).toEqual([...WIZARD_PAGES]);
  });

  it('têm título, pergunta, ícone e ao menos uma etapa', () => {
    for (const p of PAGE_META) {
      expect(p.title, p.id).toBeTruthy();
      expect(p.question, p.id).toBeTruthy();
      expect(p.icon, p.id).toBeTruthy();
      expect(p.steps.length, p.id).toBeGreaterThan(0);
    }
  });

  it('toda etapa de resposta tem título para o subtítulo da página unida', () => {
    expect(STEP_META.map((m) => m.id)).toEqual([...WIZARD_STEPS]);
  });

  it('as páginas unidas têm título próprio, que cita as duas etapas', () => {
    const titulo = (id: string) => PAGE_META.find((p) => p.id === id)!.title;
    expect(titulo('project')).toBe('Projeto e clima');
    expect(titulo('envelope')).toBe('Materiais e janelas');
    expect(titulo('loads')).toBe('Uso e climatização');
  });
});
