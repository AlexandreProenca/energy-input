import { describe, expect, it } from 'vitest';
import { reescreverCookie, rotaDeSessao } from '../cookieDeSessao';

describe('cookie de sessão pelo proxy de desenvolvimento', () => {
  it('leva o caminho do serviço para o do proxy, e mantém os atributos de segurança', () => {
    expect(reescreverCookie('ee_refresh=abc; Path=/v1/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=43200'))
      .toBe('ee_refresh=abc; Path=/simulation-api/v1/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=43200');
  });

  it('tira o Domain: o cookie é da origem do aplicativo', () => {
    expect(reescreverCookie('a=b; Domain=homolog.ee.dev.br; path=/v1/auth/refresh; HttpOnly'))
      .toBe('a=b; Path=/simulation-api/v1/auth/refresh; HttpOnly');
  });

  it('não mexe em caminho que não é o de sessão, nem no valor do cookie', () => {
    expect(reescreverCookie('x=Path=/v1/auth; Path=/outro')).toBe('x=Path=/v1/auth; Path=/outro');
  });

  it('só as rotas de sessão levam cookie', () => {
    for (const rota of ['/v1/auth/login', '/v1/auth/refresh', '/v1/auth/logout']) expect(rotaDeSessao(rota), rota).toBe(true);
    for (const rota of ['/v1/engines', '/v1/auth/token', '/v1/auth/loginx', '/v1/simulations', undefined]) expect(rotaDeSessao(rota), String(rota)).toBe(false);
  });
});
