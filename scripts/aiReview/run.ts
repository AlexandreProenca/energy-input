/**
 * Ponto de entrada da revisão por IA do PR, chamado pelo `ai-pr-review.yml`.
 *
 * Aqui mora o I/O — ler os arquivos do passo anterior, falar com a API e escrever
 * `review.md`. Tudo que decide alguma coisa está em `parse.ts`, `report.ts` e `prompts.ts`,
 * que são puros e testados no Vitest.
 *
 *   npx tsx scripts/aiReview/run.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ReviewFormatError, describeShape, parseReview } from './parse';
import { renderReport } from './report';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';

function ler(caminho: string): string {
  try {
    return readFileSync(caminho, 'utf8');
  } catch {
    return '';
  }
}

/** Falha com a anotação que o GitHub Actions reconhece, e com código 1. */
function morrer(mensagem: string, detalhe?: string): never {
  console.error(`::error::${mensagem}`);
  if (detalhe) console.error(`::notice::${detalhe}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const chave = process.env.DEEPSEEK_API_KEY;
  if (!chave) morrer('DEEPSEEK_API_KEY não está definida.');

  const userPrompt = buildUserPrompt({
    contexto: ler('contexto.md').trim(),
    titulo: process.env.PR_TITLE ?? '',
    descricao: process.env.PR_BODY ?? '',
    arquivos: ler('arquivos-alterados.txt').split('\n').filter(Boolean),
    diff: ler('pr.diff'),
    truncado: process.env.TRUNCATED === 'true',
  });

  let bruto: string;
  try {
    const resposta = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
        max_tokens: 3500,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!resposta.ok) {
      // O status é lido antes de qualquer outro `await`. Se `text()` rejeitasse — fluxo
      // interrompido, por exemplo —, o `catch` de baixo reportaria "falha na comunicação" e
      // esconderia o código HTTP, que é o que de fato diagnostica. O corpo do erro é da API,
      // não do diff, então pode ir para o log.
      const status = resposta.status;
      const corpo = await resposta.text().catch(() => '(corpo ilegível)');
      morrer(`A API DeepSeek respondeu ${status}: ${corpo.slice(0, 500)}`);
    }
    const corpo = await resposta.json() as { choices?: { message?: { content?: string } }[] };
    bruto = corpo.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    morrer(`Falha na comunicação com a API DeepSeek: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    writeFileSync('review.md', `${renderReport(parseReview(bruto))}\n`, 'utf8');
  } catch (e) {
    if (e instanceof ReviewFormatError) {
      // O log do CI é público e a resposta deriva do diff do PR: vai para lá a forma, não o
      // conteúdo. O portão continua reprovando — check obrigatório que passa sem entender o
      // resultado não é portão nenhum.
      morrer(`Resposta do modelo em formato inválido: ${e.message}`, describeShape(bruto));
    }
    throw e;
  }
}

void main();
