import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import summary from '../__fixtures__/summary.json';
import catalogo from '../__fixtures__/catalogo-variaveis.json';
import operativa from '../__fixtures__/serie-temperatura-operativa.json';
import externa from '../__fixtures__/serie-temperatura-externa.json';
import medidor from '../__fixtures__/serie-medidor-energia.json';
import erro422 from '../__fixtures__/erro-422-variavel-inexistente.json';

/**
 * Estas fixtures são respostas REAIS do serviço de homologação, capturadas por
 * `scripts/capture-results-fixtures.ts` a partir de uma execução anual concluída.
 * Os testes abaixo não exercitam código do aplicativo: eles travam o *contrato* que os
 * tipos e os gráficos do épico E1 assumem. Se o serviço mudar de forma, quebram aqui —
 * antes de quebrarem num gráfico silenciosamente errado.
 */
describe('contrato das séries temporais', () => {
  it('trata a hora 24 como o fim do último intervalo do dia, e não como hora 0 do dia seguinte', () => {
    const pontos = operativa.itens;
    const meiaNoite = pontos.find((p) => p.hour === 24);
    expect(meiaNoite).toBeDefined();
    // A hora 24 ainda pertence ao dia 1; é o carimbo UTC que já virou o dia.
    expect(meiaNoite!.day).toBe(1);
    expect(meiaNoite!.month).toBe(1);
    expect(meiaNoite!.timestamp).toBe('2013-01-02T03:00:00Z');

    // Contraprova: o ponto seguinte é a hora 1 do dia 2, não uma segunda hora 24.
    const seguinte = pontos[pontos.indexOf(meiaNoite!) + 1];
    expect(seguinte.day).toBe(2);
    expect(seguinte.hour).toBe(1);

    // Logo, um dia tem exatamente 24 baldes numerados de 1 a 24 — nunca um 25º, nem um 0.
    const primeiroDia = pontos.filter((p) => p.month === 1 && p.day === 1).map((p) => p.hour);
    expect(primeiroDia).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });

  it('liga a hora local ao carimbo UTC pelo utc_offset_hours', () => {
    expect(operativa.utc_offset_hours).toBe(-3);
    const p = operativa.itens[0];
    // hora local 1 (fim do intervalo 00h–01h) com fuso −3 ⇒ 04:00 UTC.
    expect(p.hour).toBe(1);
    expect(p.timestamp).toBe('2013-01-01T04:00:00Z');
  });

  it('entrega o ano inteiro numa única página, sem cursor', () => {
    expect(operativa._pontos_na_pagina_original).toBe(8760);
    expect(operativa.proximo_cursor).toBeNull();
  });

  it('descreve a série com frequência do contrato e agregação do motor', () => {
    // Grafias diferentes no mesmo objeto: `frequency` é do contrato (minúscula),
    // `aggregation` vem do motor (capitalizada). Filtrar pela grafia errada devolve vazio.
    expect(operativa.variable.frequency).toBe('hourly');
    expect(operativa.variable.aggregation).toBe('Avg');
    expect(operativa.variable.units).toBe('C');
    expect(operativa.variable.is_meter).toBe(false);
  });

  it('identifica o medidor e o distingue da variável de zona pela chave vazia', () => {
    expect(medidor.variable.is_meter).toBe(true);
    expect(medidor.variable.key).toBe('');
    expect(medidor.variable.units).toBe('J');
    // Variável de zona traz a zona na chave; variável de ambiente traz "Environment".
    expect(operativa.variable.key).toBe('ZONE ONE');
    expect(externa.variable.key).toBe('Environment');
  });
});

describe('contrato do catálogo de variáveis', () => {
  it('é um catálogo de tipos: não traz chave nem promete que a série foi gravada', () => {
    expect(catalogo.sources).toEqual(['rdd', 'mdd']);
    for (const item of catalogo.items) expect(item).not.toHaveProperty('key');
    // 349 tipos disponíveis nesta execução, 200 por página.
    expect(catalogo.total).toBeGreaterThan(catalogo.returned);
    // E a página não é o catálogo: `Zone Operative Temperature` FOI registrada por esta
    // simulação (há fixture da série) e mesmo assim não aparece na primeira página. Ou
    // seja, o seletor de séries não pode oferecer só o que a primeira página trouxe.
    expect(catalogo.items.some((i) => i.name === 'Zone Operative Temperature')).toBe(false);
    expect(operativa.variable.name).toBe('Zone Operative Temperature');
  });

  it('pagina por cursor opaco', () => {
    expect(typeof catalogo.next_cursor).toBe('string');
  });
});

describe('contrato do resumo permanente', () => {
  it('traz conforto em horas, incluindo um indicador ASHRAE 55 além do desvio de setpoint', () => {
    const nomes = summary.comfort.map((c) => c.name);
    expect(nomes).toContain('occupied_heating_setpoint_not_met');
    expect(nomes).toContain('occupied_cooling_setpoint_not_met');
    expect(nomes).toContain('simple_ashrae_55_not_comfortable');
    for (const c of summary.comfort) expect(c.units).toBe('Hours');
  });

  it('lista todos os recursos por uso final, inclusive os zerados', () => {
    // O motor devolve os 14 recursos sempre. Um gráfico que não filtrar valores nulos
    // desenha 14 séries vazias por categoria.
    const aquecimento = summary.end_uses.find((u) => u.category === 'Heating')!;
    expect(aquecimento.resources.length).toBe(14);
    expect(aquecimento.resources.every((r) => r.value === 0)).toBe(true);
    expect(aquecimento.resources.find((r) => r.resource === 'Electricity')!.units).toBe('GJ');
    // Água sai em m3, não em GJ: converter tudo para kWh sem olhar a unidade mente.
    expect(aquecimento.resources.find((r) => r.resource === 'Water')!.units).toBe('m3');
  });

  it('separa área total, condicionada e não condicionada', () => {
    expect(summary.building_area.map((a) => a.name)).toEqual(['total', 'conditioned', 'unconditioned']);
  });

  it('traz campos que a interface Summary local ainda não modela', () => {
    // Guarda de regressão para a defasagem registrada no MEMORY.md: quando
    // src/features/simulation/api.ts passar a modelá-los, este teste documenta desde quando.
    expect(summary).toHaveProperty('simulation_id');
    expect(summary).toHaveProperty('status');
  });
});

describe('contrato do erro de série', () => {
  it('usa problem+json e nomeia a variável ausente no campo que a causou', () => {
    // O 422 serve tanto para "não registrada" quanto para ambiguidade de chave; quem
    // consumir precisa distinguir pelo corpo, não pelo código.
    expect(erro422.status).toBe(422);
    expect(erro422.title).toBe('Entrada inválida');
    expect(erro422.detail).toBe('variável inexistente nesta simulação');
    expect(erro422.errors[0].field).toBe('variable');
    expect(erro422.errors[0].message).toContain('Electricity:Facility');
  });
});

describe('higienização das fixtures', () => {
  // Guarda de segurança, não de contrato: as fixtures vêm de uma conta real e são
  // versionadas. Se alguém regravar com `scripts/capture-results-fixtures.ts` e o mapa de
  // troca falhar, um identificador da conta entra no repositório em silêncio. Este teste
  // varre o diretório — inclusive fixtures futuras, que os imports acima não alcançam.
  const dir = new URL('../__fixtures__/', import.meta.url);
  const arquivos = readdirSync(dir).filter((f) => f.endsWith('.json'));

  const PLACEHOLDERS = new Set([
    'sim_01M2KXB9D4TQ7F3S0YJ8N5VZQK',
    'mdl_01M2KXAZ9WQK8YT4N6P0R2S5V7',
    'mv_01M2KXB16RP92SR9SCA3PBVMSF',
  ]);

  it('varre todas as fixtures, inclusive as que este arquivo não importa', () => {
    expect(arquivos.length).toBeGreaterThanOrEqual(8);
  });

  it('usa marcadores que respeitam os padrões de identificador do contrato', () => {
    // Um marcador com corpo de tamanho errado passaria despercebido — a fixture pareceria
    // higienizada e ao mesmo tempo violaria o formato que a T003 vai validar nos tipos.
    // Os padrões são os do OpenAPI: prefixo + ULID Crockford de 26 caracteres.
    const padroes: Record<string, RegExp> = {
      sim: /^sim_[0-7][0-9A-HJKMNP-TV-Z]{25}$/,
      mdl: /^mdl_[0-7][0-9A-HJKMNP-TV-Z]{25}$/,
      mv: /^mv_[0-7][0-9A-HJKMNP-TV-Z]{25}$/,
    };
    for (const marcador of PLACEHOLDERS) {
      const prefixo = marcador.slice(0, marcador.indexOf('_'));
      expect(padroes[prefixo], `sem padrão conhecido para "${prefixo}"`).toBeDefined();
      expect(marcador).toMatch(padroes[prefixo]);
    }
  });

  it.each(arquivos)('%s não carrega identificador real da conta', (arquivo) => {
    const texto = readFileSync(new URL(arquivo, dir), 'utf8');
    // Qualquer ULID com os prefixos do contrato precisa ser um dos marcadores conhecidos.
    const encontrados = texto.match(/\b(?:sim|mdl|mv|tnt)_[0-7][0-9A-HJKMNP-TV-Z]{25}\b/g) ?? [];
    for (const id of encontrados) expect(PLACEHOLDERS).toContain(id);
    // `owner` e `request_id` identificam o tenant e a requisição; nenhum deles é contrato.
    expect(texto).not.toMatch(/"owner"\s*:\s*"tnt_/);
    expect(texto).not.toMatch(/"request_id"\s*:\s*"(?!<request_id>)/);
  });
});
