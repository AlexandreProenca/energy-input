import { describe, expect, it } from 'vitest';
import { lerRecusa, lerSessao, quandoRenovar } from '../sessao';

const RESPOSTA = {
  access_token: 'eyJ.token', token_type: 'Bearer', expires_in: 900, scope: 'models:read simulations:write',
  usuario: { id: 'usr_01', nome: 'Ana', email: 'ana@exemplo.com', papel: 'member' },
  tenant: { id: 'tnt_01', nome: 'Escritório' },
};

describe('leitura da sessão', () => {
  it('lê token, validade, escopos, usuário e tenant', () => {
    expect(lerSessao(RESPOSTA, 1_000)).toEqual({
      token: 'eyJ.token', expiraEm: 901_000, escopos: ['models:read', 'simulations:write'],
      usuario: { id: 'usr_01', nome: 'Ana', email: 'ana@exemplo.com', papel: 'member' },
      tenant: { id: 'tnt_01', nome: 'Escritório' },
    });
  });

  it('recusa resposta pela metade, em vez de mostrar sessão de ninguém', () => {
    for (const faltando of ['access_token', 'expires_in', 'usuario', 'tenant']) {
      const { [faltando]: _, ...parcial } = RESPOSTA as Record<string, unknown>;
      expect(lerSessao(parcial, 0), faltando).toBeUndefined();
    }
    expect(lerSessao({ ...RESPOSTA, expires_in: 0 }, 0)).toBeUndefined();
    expect(lerSessao({ ...RESPOSTA, tenant: { nome: 'sem id' } }, 0)).toBeUndefined();
    expect(lerSessao(null, 0)).toBeUndefined();
  });

  it('usa o e-mail quando não há nome, e o id quando o tenant não tem nome', () => {
    const s = lerSessao({ ...RESPOSTA, usuario: { id: 'usr_01', email: 'ana@exemplo.com' }, tenant: { id: 'tnt_01' } }, 0)!;
    expect(s.usuario.nome).toBe('ana@exemplo.com');
    expect(s.tenant.nome).toBe('tnt_01');
  });
});

describe('recusa do login', () => {
  it('401 é uma recusa só, sem dizer se o e-mail existe', () => {
    const r = lerRecusa(401, { detail: 'usuário não encontrado' }, 0);
    expect(r).toEqual({ tipo: 'credenciais', mensagem: 'E-mail ou senha incorretos.' });
    expect(r.mensagem).not.toMatch(/encontrado|existe/);
  });

  it('409 pede a escolha entre os tenants em que a senha confere', () => {
    const r = lerRecusa(409, { tenants: [{ id: 'tnt_a', nome: 'A' }, { id: 'tnt_b' }, { nome: 'sem id' }] }, 0);
    expect(r).toMatchObject({ tipo: 'escolher-tenant', tenants: [{ id: 'tnt_a', nome: 'A' }, { id: 'tnt_b', nome: 'tnt_b' }] });
  });

  it('429 diz quanto esperar', () => {
    expect(lerRecusa(429, null, 30)).toMatchObject({ tipo: 'muitas-tentativas', esperarSegundos: 30, mensagem: 'Muitas tentativas. Tente de novo em 30 s.' });
    expect(lerRecusa(429, null, 600).mensagem).toBe('Muitas tentativas. Tente de novo em 10 min.');
    expect(lerRecusa(429, null, 0)).toMatchObject({ esperarSegundos: 60 });
  });

  it('422 aponta o e-mail, que é o que o serviço valida no formato', () => {
    // Visto no homolog (T069): corpo sem e-mail válido responde 422 com `errors[].field`.
    expect(lerRecusa(422, { errors: [{ field: 'email', message: 'value is not a valid email address' }] }, 0))
      .toEqual({ tipo: 'credenciais', mensagem: 'Confira o e-mail digitado.' });
  });

  it('404 é o serviço sem login ainda; o resto é indisponibilidade', () => {
    expect(lerRecusa(404, null, 0).mensagem).toMatch(/ainda não oferece login/);
    expect(lerRecusa(0, null, 0).mensagem).toMatch(/sem resposta/);
    expect(lerRecusa(502, null, 0).tipo).toBe('indisponivel');
  });
});

describe('quando renovar', () => {
  it('um minuto antes de vencer', () => {
    expect(quandoRenovar({ expiraEm: 900_000 }, 0)).toBe(840_000);
  });
  it('na metade do que resta, quando falta pouco', () => {
    expect(quandoRenovar({ expiraEm: 90_000 }, 0)).toBe(45_000);
  });
  it('nunca menos que 5 s, nem com o token já vencido', () => {
    expect(quandoRenovar({ expiraEm: 1_000 }, 0)).toBe(5_000);
    expect(quandoRenovar({ expiraEm: 0 }, 10_000)).toBe(5_000);
  });
});
