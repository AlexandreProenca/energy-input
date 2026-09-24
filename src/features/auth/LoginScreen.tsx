import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Building2, Loader2, LogIn, Zap } from 'lucide-react';
import { Button, Callout, Field } from '@/ui/primitives';
import { useAuthStore } from './authStore';

/**
 * A tela de login (T032, ADR-0004). Ocupa a tela inteira, por cima de qualquer diálogo: aberta a
 * partir de "Simular", o diálogo continua lá atrás e se conecta sozinho quando a sessão chega.
 *
 * A senha fica só no estado deste componente, enquanto ele existe. Nada dela vai para o store.
 */
export function LoginScreen() {
  const aberta = useAuthStore((s) => s.telaAberta);
  const enviando = useAuthStore((s) => s.enviando);
  const recusa = useAuthStore((s) => s.recusa);
  const tenants = useAuthStore((s) => s.tenants);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [tenantId, setTenantId] = useState('');
  const campoEmail = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberta) { setSenha(''); setTenantId(''); return; }
    campoEmail.current?.focus();
  }, [aberta]);
  useEffect(() => { if (recusa?.tipo === 'credenciais') setSenha(''); }, [recusa]);
  useEffect(() => { if (tenants?.length) setTenantId((atual) => atual || tenants[0].id); }, [tenants]);

  if (!aberta) return null;
  const esperando = recusa?.tipo === 'muitas-tentativas';
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !senha || enviando) return;
    void useAuthStore.getState().entrar(email, senha, tenants?.length ? tenantId : undefined);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-gradient-to-br from-brand-50 via-white to-slate-100 p-4" role="dialog" aria-modal="true" aria-labelledby="login-titulo"
      onKeyDown={(e) => e.key === 'Escape' && useAuthStore.getState().fecharLogin()}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <Zap size={22} className="fill-sun-400 text-sun-400" />
          </div>
          <div>
            <h1 id="login-titulo" className="text-lg font-bold text-slate-900">Entrar no Energy Input</h1>
            <p className="text-xs text-slate-500">Arquivos epJSON para EnergyPlus</p>
          </div>
        </div>
        <p className="mb-5 text-sm text-slate-600">Use o e-mail e a senha da sua conta no serviço de simulação. Suas simulações, estudos e versões ficam na sua organização.</p>

        <form className="space-y-4" onSubmit={enviar}>
          <Field label="E-mail">
            <input ref={campoEmail} className="input" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={enviando} />
          </Field>
          <Field label="Senha">
            <input className="input" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} disabled={enviando} />
          </Field>
          {tenants && tenants.length > 1 && (
            <Field label="Organização">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="shrink-0 text-slate-400" />
                <select className="input" value={tenantId} onChange={(e) => setTenantId(e.target.value)} disabled={enviando}>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
            </Field>
          )}
          {recusa && <Callout tone={recusa.tipo === 'escolher-tenant' ? 'info' : 'error'}>{recusa.mensagem}</Callout>}
          <Button type="submit" variant="primary" size="lg" className="w-full justify-center" disabled={enviando || esperando || !email.trim() || !senha}
            icon={enviando ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <div className="mt-6 border-t border-slate-100 pt-4 text-center">
          <button type="button" className="text-sm font-medium text-brand-700 hover:underline" onClick={() => useAuthStore.getState().fecharLogin()}>Continuar sem entrar</button>
          <p className="mt-1 text-xs text-slate-500">Criar, editar e baixar arquivos epJSON não exige conta. Simular e ver resultados, sim.</p>
        </div>
      </div>
    </div>
  );
}
