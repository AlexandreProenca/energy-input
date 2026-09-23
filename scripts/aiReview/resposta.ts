/**
 * O que interessa da resposta da API do modelo: o texto e se ele foi cortado.
 *
 * Puro, para ser testado. O `finish_reason` passou a importar na T029: com `"length"`, o modelo
 * parou no limite de tokens no meio do JSON, e o parser recusava a resposta com um genérico
 * "formato inválido" — o log mostrava só `forma: objeto, 8714 caracteres`, sem dizer por quê.
 */
export interface RespostaDoModelo {
  bruto: string;
  /** O modelo parou por limite de tokens, e o texto está incompleto. */
  cortada: boolean;
}

export function lerResposta(corpo: unknown): RespostaDoModelo {
  const escolha = (corpo as { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[] } | null)
    ?.choices?.[0];
  const conteudo = escolha?.message?.content;
  return { bruto: typeof conteudo === 'string' ? conteudo : '', cortada: escolha?.finish_reason === 'length' };
}
