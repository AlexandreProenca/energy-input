/**
 * Chaves da escolha de climatização (T031). Ficam à parte de `conditioning.ts` porque os
 * geradores de geometria as usam, e `conditioning.ts` usa os geradores de geometria.
 */
export const chaveDoPavimento = (indice: number) => `pavimento:${indice}`;
export const chaveDoAmbiente = (id: string) => `ambiente:${id}`;
