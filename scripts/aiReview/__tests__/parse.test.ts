import { describe, expect, it } from 'vitest';
import { ReviewFormatError, describeShape, parseReview } from '../parse';

const BOM = '{"summary": "ok", "findings": [{"title": "x", "severity": "high"}]}';

describe('resposta bem formada', () => {
  it('lê o objeto e normaliza os campos ausentes', () => {
    const r = parseReview(BOM);
    expect(r.summary).toBe('ok');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toEqual({
      severity: 'high', confidence: 0, path: '', line: 1, title: 'x',
      failure_scenario: '', evidence: '', suggested_test: '',
    });
  });

  it('aceita revisão só com resumo, sem achados', () => {
    // É o caso mais desejável de todos — o PR limpo. Exigir `findings` reprovaria justamente
    // ele.
    expect(parseReview('{"summary": "nada a apontar"}').findings).toEqual([]);
  });

  it('aceita `findings` vazio sem resumo', () => {
    expect(parseReview('{"findings": []}')).toEqual({ findings: [], summary: '' });
  });
});

describe('desvios de formato observados', () => {
  /**
   * O defeito que derrubou o PR #11: `JSON.parse` exige que a string inteira seja um
   * documento só, e o modelo escreveu comentário depois do objeto.
   */
  it('lê objeto seguido de texto', () => {
    expect(parseReview(`${BOM}\n\nEspero que ajude!`).summary).toBe('ok');
  });

  it('lê objeto dentro de cerca de bloco, em três variações', () => {
    expect(parseReview('```json\n' + BOM + '\n```').summary).toBe('ok');
    expect(parseReview('``` json\n' + BOM + '\n```').summary).toBe('ok');
    expect(parseReview('```\n' + BOM + '\n```').summary).toBe('ok');
  });

  it('lê objeto depois de preâmbulo em prosa', () => {
    expect(parseReview('Segue a revisão:\n' + BOM).summary).toBe('ok');
  });

  it('não se perde em chave literal na prosa', () => {
    // A primeira `{` é de `{chaves}`, que não decodifica.
    expect(parseReview('use {chaves} assim e veja ' + BOM).summary).toBe('ok');
  });
});

describe('o que precisa reprovar', () => {
  const reprova = (bruto: string) => expect(() => parseReview(bruto)).toThrow(ReviewFormatError);

  it('recusa array, texto e número no lugar do objeto', () => {
    reprova('[1,2,3]');
    reprova('"texto"');
    reprova('42');
  });

  it('recusa objeto que não parece uma revisão', () => {
    // O caso da T019: objeto ilustrativo sem as chaves do contrato.
    reprova('{"severity": "high"}');
  });

  /**
   * O achado que a revisão do PR #13 levantou contra a T019. Conferir só a **presença** da
   * chave deixa passar um exemplo ilustrativo que contenha `findings` — mesmo defeito, outra
   * forma. Exigir o tipo fecha essa porta.
   */
  it('recusa objeto cujo `findings` não é lista e `summary` não é texto', () => {
    reprova('{"findings": "um texto"}');
    reprova('{"summary": 42}');
    reprova('{"findings": {"a": 1}}');
  });

  /**
   * Achado da revisão do PR #14, e o mais perigoso desta rodada. Com uma chave certa e a
   * outra errada, o objeto era aceito, `findings` virava lista vazia **em silêncio** e o
   * relatório anunciava "nenhum defeito" com achados que o modelo tinha escrito. É a mesma
   * família de passe silencioso da T019.
   */
  it('recusa quando uma chave está certa e a outra tem o tipo errado', () => {
    reprova('{"summary": "ok", "findings": "texto"}');
    reprova('{"summary": 42, "findings": []}');
  });

  it('recusa resposta vazia, sem objeto e com JSON truncado', () => {
    reprova('');
    reprova('   ');
    reprova('Não encontrei problemas.');
    reprova('{"summary": "ok", "findings": [');
  });
});

describe('ambiguidade reprova em vez de adivinhar', () => {
  /**
   * Duas revisões plausíveis na mesma resposta não têm como ser distinguidas com confiança.
   * Escolher uma seria adivinhar, e adivinhar errado faz o portão obrigatório dar verde
   * anunciando zero achado — que foi a regressão da T019.
   */
  it('recusa quando dois objetos parecem uma revisão', () => {
    const bruto = `Por exemplo ${'{"findings": [{"title": "exemplo"}]}'}. Segue:\n${BOM}`;
    expect(() => parseReview(bruto)).toThrow(/ambígua/);
  });

  it('não confunde sub-objeto de um achado com um segundo candidato', () => {
    // Cada achado é um objeto dentro de `findings`. Se a varredura entrasse neles, toda
    // resposta com achado seria "ambígua" e o job nunca passaria.
    const r = parseReview('Segue:\n' + BOM);
    expect(r.findings).toHaveLength(1);
  });

  it('não se confunde com chave dentro de string', () => {
    const bruto = '{"summary": "veja o trecho { isto }", "findings": []}';
    expect(parseReview(bruto).summary).toBe('veja o trecho { isto }');
  });

  it('não se confunde com aspas escapadas dentro de string', () => {
    // A busca pelo fim do objeto conta chaves fora de string, e precisa respeitar a barra
    // invertida: sem isso, uma aspa escapada fecharia a string cedo e a contagem de chaves
    // terminaria no lugar errado.
    expect(parseReview('{"summary": "ele disse \\"oi\\"", "findings": []}').summary)
      .toBe('ele disse "oi"');
  });
});

describe('normalização dos achados', () => {
  it('descarta elemento de `findings` que não é objeto', () => {
    // `findings: ["texto"]` não tem caminho, linha nem cenário; inventá-los produziria um
    // achado vazio no relatório do PR.
    expect(parseReview('{"findings": ["texto", 1, null, {"title": "real"}]}').findings)
      .toHaveLength(1);
  });

  it('cai para `low` em severidade desconhecida', () => {
    expect(parseReview('{"findings": [{"severity": "catastrófica"}]}').findings[0].severity).toBe('low');
  });

  it('cai para os padrões em confiança e linha não numéricas', () => {
    const f = parseReview('{"findings": [{"confidence": "alta", "line": null}]}').findings[0];
    expect(f.confidence).toBe(0);
    expect(f.line).toBe(1);
  });
});

describe('descrição da forma, para o log público', () => {
  /**
   * O log do CI deste repositório é público e a resposta deriva do diff do PR: o que vai
   * para lá identifica um problema de formato e não carrega conteúdo.
   */
  it('descreve como a resposta começa e o tamanho', () => {
    expect(describeShape('{"a":1}')).toBe('forma: objeto, 7 caracteres');
    expect(describeShape('[1]')).toBe('forma: array, 3 caracteres');
    expect(describeShape('```json\n{}')).toBe('forma: cerca de bloco, 10 caracteres');
    expect(describeShape('Segue a revisão')).toBe('forma: prosa, 15 caracteres');
    expect(describeShape('')).toBe('forma: vazia, 0 caracteres');
  });

  it('mede a resposta crua, com a cerca incluída', () => {
    // É a resposta que chegou, e é sobre ela que se diagnostica. Medir a versão sem cerca
    // esconderia justamente a diferença que se quer ver.
    const cercado = '```json\n{"findings":[]}\n```';
    expect(describeShape(cercado)).toBe(`forma: cerca de bloco, ${cercado.length} caracteres`);
  });

  it('não repete nenhum trecho da resposta', () => {
    const segredo = 'senha-do-diff-que-nao-pode-vazar';
    expect(describeShape(`prosa com ${segredo}`)).not.toContain(segredo);
  });
});
