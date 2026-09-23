/**
 * Leitura da resposta do modelo na revisão por IA do PR.
 *
 * Puro e sem I/O, para ser testado no Vitest como qualquer outro módulo. Viveu três tarefas
 * dentro de um heredoc Python no `ai-pr-review.yml`, onde nada o exercitava — nem `npm test`,
 * nem `tsc` — e só rodava com PR aberto, quando falhar bloqueia em vez de avisar. As T018 e
 * T019 corrigiram defeitos ali com roteiro descartável de verificação; esta é a terceira, e
 * o lugar certo passou a ser este.
 */

/** Um achado, já com os campos que o relatório usa. */
export interface Finding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  path: string;
  line: number;
  title: string;
  failure_scenario: string;
  evidence: string;
  suggested_test: string;
}

export interface Review {
  findings: Finding[];
  summary: string;
}

/** Falha de formato, separada de qualquer outra para o chamador decidir o que logar. */
export class ReviewFormatError extends Error {}

const SEVERIDADES = ['critical', 'high', 'medium', 'low'] as const;

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const numero = (v: unknown, padrao: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : padrao;

/**
 * Um objeto **parece uma revisão** quando traz ao menos uma das chaves do contrato e
 * **nenhuma delas com o tipo errado**.
 *
 * As duas metades importam, e a segunda veio da revisão do PR #14. Exigir só que uma esteja
 * certa deixa passar `{"summary": "ok", "findings": "texto"}`: o objeto é aceito, `findings`
 * é normalizado para lista vazia e o relatório anuncia "nenhum defeito" com achados que o
 * modelo escreveu. É a mesma família de passe silencioso da T019 — o portão obrigatório dá
 * verde sem ter lido a revisão.
 */
function pareceRevisao(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if ('findings' in o && !Array.isArray(o.findings)) return false;
  if ('summary' in o && typeof o.summary !== 'string') return false;
  return 'findings' in o || 'summary' in o;
}

function normalizar(o: Record<string, unknown>): Review {
  const brutos = Array.isArray(o.findings) ? o.findings : [];
  const findings: Finding[] = [];
  for (const f of brutos) {
    // Achado que não é objeto é descartado, e não convertido: `findings: ["texto"]` não tem
    // caminho, linha nem cenário, e inventá-los produziria um relatório com achado vazio.
    if (typeof f !== 'object' || f === null || Array.isArray(f)) continue;
    const r = f as Record<string, unknown>;
    const sev = texto(r.severity);
    findings.push({
      severity: (SEVERIDADES as readonly string[]).includes(sev) ? (sev as Finding['severity']) : 'low',
      confidence: numero(r.confidence, 0),
      path: texto(r.path),
      line: numero(r.line, 1),
      title: texto(r.title),
      failure_scenario: texto(r.failure_scenario),
      evidence: texto(r.evidence),
      suggested_test: texto(r.suggested_test),
    });
  }
  return { findings, summary: texto(o.summary) };
}

/** Tira a cerca de bloco, que é como o modelo às vezes embrulha a resposta. */
function semCerca(bruto: string): string {
  const t = bruto.trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```\s*[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
}

/**
 * Todos os objetos que parecem uma revisão dentro do texto.
 *
 * Varre **todas** as chaves de abertura porque prosa do tipo `use {chaves} assim` antes do
 * objeto faria a primeira apontar para lixo. `JSON.parse` não diz onde o documento terminou,
 * então o fim é procurado por contagem de chaves fora de string.
 */
function candidatos(t: string): Record<string, unknown>[] {
  const achados: Record<string, unknown>[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{') continue;
    const fim = fimDoObjeto(t, i);
    if (fim === -1) continue;
    try {
      const obj: unknown = JSON.parse(t.slice(i, fim + 1));
      if (pareceRevisao(obj)) {
        achados.push(obj);
        // Continua **depois** deste objeto: varrer o interior dele acharia sub-objetos que
        // não são a revisão, e contá-los como candidatos tornaria toda resposta ambígua.
        i = fim;
      }
    } catch {
      // Chave que não abre objeto válido: segue para a próxima.
    }
  }
  return achados;
}

/** Índice da chave que fecha o objeto aberto em `inicio`, ou -1. */
function fimDoObjeto(t: string, inicio: number): number {
  let profundidade = 0;
  let emString = false;
  let escapado = false;
  for (let i = inicio; i < t.length; i++) {
    const c = t[i];
    if (emString) {
      if (escapado) escapado = false;
      else if (c === '\\') escapado = true;
      else if (c === '"') emString = false;
      continue;
    }
    if (c === '"') emString = true;
    else if (c === '{') profundidade++;
    else if (c === '}') {
      profundidade--;
      if (profundidade === 0) return i;
    }
  }
  return -1;
}

/**
 * A revisão contida na resposta do modelo.
 *
 * O caminho normal é a resposta inteira ser um documento só — é o que
 * `response_format: json_object` produz. A varredura existe para os desvios observados:
 * texto depois do objeto (que derrubava o job antes da T018), cerca de bloco e preâmbulo
 * em prosa.
 *
 * **Ambiguidade reprova, não é resolvida por heurística.** Dois objetos que parecem revisão
 * na mesma resposta — o ilustrativo e o real — não têm como ser distinguidos com confiança,
 * e escolher um seria adivinhar. Adivinhar errado faz o portão obrigatório dar verde
 * anunciando zero achado, que foi exatamente a regressão da T019.
 */
/**
 * Dobra a barra invertida que não começa um escape válido de JSON.
 *
 * Em JSON, `\\` só pode vir antes de `"\\/bfnrt` ou de `u` com quatro dígitos hexadecimais. O
 * modelo, ao citar código como evidência, às vezes escreve a barra crua: uma regex do nginx
 * como `\\|\\1` vira `"…\\|\\1…"` dentro da string, e o documento inteiro deixa de decodificar
 * (T030). Dobrar a barra dá o que o modelo quis dizer — a barra literal.
 *
 * Varre caractere a caractere, e não com uma regex, por causa dos pares: em `\\\\1` (barra
 * escapada seguida de `1`) a primeira barra escapa a segunda, e a segunda NÃO pode ser tratada
 * como início de escape. Só é usada quando a resposta não decodifica como veio.
 */
export function repararEscapes(texto: string): string {
  let saida = '';
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c !== '\\') { saida += c; continue; }
    const proximo = texto[i + 1];
    if (proximo !== undefined && '"\\/bfnrt'.includes(proximo)) { saida += c + proximo; i++; continue; }
    if (proximo === 'u' && /^[0-9a-fA-F]{4}$/.test(texto.slice(i + 2, i + 6))) { saida += texto.slice(i, i + 6); i += 5; continue; }
    saida += '\\\\';
  }
  return saida;
}

function decodifica(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
}

export function parseReview(bruto: string): Review {
  const original = semCerca(bruto);
  if (!original) throw new ReviewFormatError('resposta vazia');

  // Escape inválido só é reparado se o texto não decodifica como veio: resposta válida passa
  // intacta, sem depender de o reparo estar certo.
  const t = decodifica(original) === undefined ? repararEscapes(original) : original;

  // Caminho normal: a resposta inteira é o objeto.
  const inteiro = decodifica(t);
  if (pareceRevisao(inteiro)) return normalizar(inteiro);

  const encontrados = candidatos(t);
  if (encontrados.length === 1) return normalizar(encontrados[0]);
  if (encontrados.length === 0) {
    throw new ReviewFormatError("nenhum objeto com 'findings' (lista) ou 'summary' (texto) na resposta");
  }
  throw new ReviewFormatError(
    `resposta ambígua: ${encontrados.length} objetos parecem uma revisão, e escolher um seria adivinhar`,
  );
}

/**
 * Descrição da **forma** da resposta, para o log de falha.
 *
 * O log do CI deste repositório é público e a resposta deriva do diff do PR, então vai para
 * lá o que identifica um problema de formato — tamanho e como a resposta começa — e nada
 * derivado do conteúdo.
 *
 * Mede a resposta **crua**, com cerca de bloco e tudo: é ela que chegou, e é sobre ela que
 * se diagnostica. Medir a versão sem cerca esconderia justamente a diferença que se quer
 * ver.
 */
export function describeShape(bruto: string): string {
  const inicio = bruto.trimStart().charAt(0);
  const forma = inicio === '{' ? 'objeto'
    : inicio === '[' ? 'array'
    : inicio === '`' ? 'cerca de bloco'
    : inicio === '' ? 'vazia'
    : 'prosa';
  return `forma: ${forma}, ${bruto.length} caracteres`;
}

/**
 * Tipos de erro do `JSON.parse` que o diagnóstico sabe nomear, do V8 do Node 18 ao 22.
 * A família "Expected …" (Node 20+) cita pontuação, por isso vira um nome só.
 */
const TIPOS_DE_ERRO: ReadonlyArray<[RegExp, string]> = [
  [/^Bad escaped character/, 'Bad escaped character'],
  [/^Bad control character/, 'Bad control character'],
  [/^Bad Unicode escape/, 'Bad Unicode escape'],
  [/^Unterminated string/, 'Unterminated string'],
  [/^Unexpected end of JSON input/, 'Unexpected end of JSON input'],
  [/^Unexpected non-whitespace character after JSON/, 'Unexpected non-whitespace character after JSON'],
  [/^Unexpected token/, 'Unexpected token'],
  [/^Unexpected number/, 'Unexpected number'],
  [/^Unexpected string/, 'Unexpected string'],
  [/^Expected /, 'Expected (pontuação ausente)'],
];

/**
 * O tipo do erro de sintaxe, **escolhido de uma lista fixa**, nunca copiado da mensagem.
 *
 * A mensagem do V8 às vezes cita um trecho do texto, e a forma muda entre versões do Node: o
 * Node 18 escreve `Unexpected token s in JSON…`, o 20 `Unexpected token 's', ..."trecho"... is
 * not valid JSON`. Um corte na primeira aspa já vazou uma vez (T030, §6). Com a lista, nenhum
 * formato de mensagem — presente ou futuro — leva conteúdo ao log; o que ela não conhece sai
 * como "erro de sintaxe não reconhecido".
 */
export function tipoDoErro(mensagem: string): string {
  for (const [padrao, nome] of TIPOS_DE_ERRO) if (padrao.test(mensagem)) return nome;
  return 'erro de sintaxe não reconhecido';
}

/**
 * Por que a resposta não foi lida — sem repetir nada do conteúdo (T030).
 *
 * `describeShape` dizia só a forma e o tamanho, e isso não bastou: duas falhas seguidas no PR #24
 * foram atribuídas a um corte por limite de tokens (T029) que os dados depois desmentiram. Aqui
 * vai o que distingue as causas: se o texto decodifica como JSON, o **tipo** e a **posição** do
 * erro de sintaxe e, se decodifica, os **nomes** das chaves de topo e seus tipos. Nomes de chave
 * são esquema, não conteúdo; ainda assim, nome fora de `[A-Za-z_]` é omitido.
 */
export function diagnoseResponse(bruto: string): string {
  const texto = semCerca(bruto);
  const partes = [describeShape(bruto)];
  try {
    const obj: unknown = JSON.parse(texto);
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      partes.push(`JSON válido, mas ${Array.isArray(obj) ? 'um array' : typeof obj} no topo`);
    } else {
      const chaves = Object.entries(obj as Record<string, unknown>).map(([k, v]) =>
        `${/^[A-Za-z_]{1,40}$/.test(k) ? k : '<chave>'}(${Array.isArray(v) ? 'lista' : v === null ? 'nulo' : typeof v})`);
      partes.push(`JSON válido; chaves de topo: ${chaves.join(', ') || 'nenhuma'}`);
    }
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    const posicao = /at position (\d+)/.exec(mensagem)?.[1];
    partes.push(`JSON inválido: ${tipoDoErro(mensagem)}${posicao ? ` na posição ${posicao}` : ''}`);
    if (decodifica(repararEscapes(texto)) !== undefined) partes.push('decodifica depois de reparar escapes');
  }
  return partes.join('; ');
}
