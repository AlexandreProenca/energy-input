import { describe, expect, it } from 'vitest';
import { ReviewFormatError, describeShape, diagnoseResponse, parseReview, repararEscapes, tipoDoErro } from '../parse';

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

describe('escape inválido de JSON (T030)', () => {
  /**
   * A hipótese para as falhas do PR #24, que cita regex do nginx: o modelo copia `\|` e `\1`
   * para dentro da string da evidência sem dobrar a barra, e o documento inteiro deixa de
   * decodificar — sobra um objeto que "não parece revisão" só porque não foi lido.
   */
  const COM_REGEX = String.raw`{"summary": "ok", "findings": [{"title": "origem", "severity": "medium",
    "evidence": "\"~^https?://([^|/]+)\|\1$\" 1;"}]}`;

  it('lê a revisão cuja evidência cita regex com barra crua', () => {
    const r = parseReview(COM_REGEX);
    expect(r.summary).toBe('ok');
    expect(r.findings[0].evidence).toBe(String.raw`"~^https?://([^|/]+)\|\1$" 1;`);
  });

  it('lê também quando há prosa em volta', () => {
    expect(parseReview(`Segue:\n${COM_REGEX}\nFim.`).findings).toHaveLength(1);
  });

  it('mantém os escapes válidos, inclusive barra escapada seguida de dígito', () => {
    // `\\1` é barra literal + `1`: a segunda barra não começa escape e não pode ser dobrada.
    for (const valido of [String.raw`\\1`, String.raw`\"`, String.raw`\/`, String.raw`\n\t\b\f\r`, String.raw`é`]) {
      expect(repararEscapes(valido)).toBe(valido);
    }
  });

  it('dobra só a barra que não começa escape válido', () => {
    expect(repararEscapes(String.raw`\|\1`)).toBe(String.raw`\\|\\1`);
    expect(repararEscapes(String.raw`\\\1`)).toBe(String.raw`\\\\1`);
    expect(repararEscapes(String.raw`\u12`)).toBe(String.raw`\\u12`);
    expect(repararEscapes('fim\\')).toBe('fim\\\\');
  });

  it('não torna decodificável uma barra fora de string', () => {
    // Fora de string a barra já é erro de sintaxe, e dobrada continua sendo: o reparo não tem
    // como mudar a estrutura do documento, só o conteúdo das strings.
    expect(() => parseReview(String.raw`{"summary": \x "ok", "findings": []}`)).toThrow(ReviewFormatError);
    expect(() => JSON.parse(repararEscapes(String.raw`{"a": 1 \ }`))).toThrow();
  });

  it('não mexe em resposta que já decodifica', () => {
    // A barra dobrada em JSON válido é barra literal; repará-la de novo a quadruplicaria.
    const valido = JSON.stringify({ summary: String.raw`regex \|\1`, findings: [] });
    expect(parseReview(valido).summary).toBe(String.raw`regex \|\1`);
  });
});

describe('diagnóstico da resposta recusada, para o log público (T030)', () => {
  const segredo = 'senha-do-diff-que-nao-pode-vazar';

  it('diz o tipo e a posição do erro de sintaxe, e se o reparo resolveria', () => {
    const d = diagnoseResponse(String.raw`{"summary": "\1"}`);
    expect(d).toMatch(/^forma: objeto, 17 caracteres; JSON inválido: .+ na posição 14; decodifica depois de reparar escapes$/);
  });

  it('diz as chaves de topo e seus tipos quando o JSON decodifica', () => {
    expect(diagnoseResponse('{"review": {"x": 1}, "notes": [], "ok": null}'))
      .toBe('forma: objeto, 45 caracteres; JSON válido; chaves de topo: review(object), notes(lista), ok(nulo)');
    expect(diagnoseResponse('[1]')).toBe('forma: array, 3 caracteres; JSON válido, mas um array no topo');
  });

  it('nomeia o erro por uma lista fixa, e não pelo texto da mensagem', () => {
    // Mensagens simuladas: as de versões do Node que citam o trecho, e formatos que ninguém viu.
    expect(tipoDoErro(`Unexpected token 's', ..."${segredo}"... is not valid JSON`)).toBe('Unexpected token');
    expect(tipoDoErro(`Unexpected token ${segredo} in JSON at position 3`)).toBe('Unexpected token');
    expect(tipoDoErro(`Expected ',' or '}' after property value in JSON at position 9`)).toBe('Expected (pontuação ausente)');
    expect(tipoDoErro(`Unexpected non-whitespace character after JSON at position 5 (${segredo})`))
      .toBe('Unexpected non-whitespace character after JSON');
    expect(tipoDoErro(`Erro novo: ${segredo}`)).toBe('erro de sintaxe não reconhecido');
  });

  it('não repete trecho do conteúdo, nem em chave nem na mensagem de erro', () => {
    // A mensagem do V8 para token inesperado cita o texto; nome de chave fora do padrão também
    // poderia carregar conteúdo.
    for (const bruto of [`{"${segredo}": 1}`, `{"summary": ${segredo}}`, `${segredo} {`, `{"a": "${segredo}`]) {
      expect(diagnoseResponse(bruto)).not.toContain(segredo);
      expect(diagnoseResponse(bruto)).not.toContain('senha');
    }
  });
});
