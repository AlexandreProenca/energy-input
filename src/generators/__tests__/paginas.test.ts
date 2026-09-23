import { describe, expect, it } from 'vitest';
import { PAGE_STEPS, WIZARD_PAGES, WIZARD_STEPS, pageOf } from '../answers';

/**
 * As páginas do assistente agrupam etapas de resposta: projeto com clima, materiais com
 * janelas, uso com climatização. As respostas continuam por etapa — só a navegação muda.
 */
describe('páginas do assistente', () => {
  it('são sete, com as três uniões pedidas', () => {
    expect(WIZARD_PAGES).toHaveLength(7);
    expect(PAGE_STEPS.project).toEqual(['project', 'location']);
    expect(PAGE_STEPS.envelope).toEqual(['envelope', 'windows']);
    expect(PAGE_STEPS.loads).toEqual(['loads', 'hvac']);
  });

  it('mostram toda etapa exatamente uma vez, na ordem original', () => {
    // Uma etapa fora de todas as páginas seria uma resposta que o usuário não tem onde dar;
    // em duas, apareceria duplicada.
    expect(WIZARD_PAGES.flatMap((p) => PAGE_STEPS[p])).toEqual([...WIZARD_STEPS]);
  });

  it('têm o id da primeira etapa que mostram', () => {
    for (const p of WIZARD_PAGES) expect(PAGE_STEPS[p][0]).toBe(p);
  });
});

describe('pageOf', () => {
  it('leva cada etapa à página que a mostra', () => {
    expect(pageOf('location')).toBe('project');
    expect(pageOf('windows')).toBe('envelope');
    expect(pageOf('hvac')).toBe('loads');
    expect(pageOf('geometry')).toBe('geometry');
  });

  it('volta ao começo com valor desconhecido, vindo de autosave corrompido ou futuro', () => {
    expect(pageOf('etapa-que-nao-existe')).toBe('project');
    expect(pageOf(undefined)).toBe('project');
    expect(pageOf(42)).toBe('project');
  });
});
