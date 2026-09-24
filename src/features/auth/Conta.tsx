import { useState } from 'react';
import { Building2, Loader2, LogIn, LogOut, UserRound } from 'lucide-react';
import { Button } from '@/ui/primitives';
import { useAuthStore } from './authStore';

const PAPEL: Record<string, string> = { owner: 'dono', admin: 'administrador', member: 'membro', readonly: 'somente leitura' };

/** No cabeçalho: "Entrar", ou quem entrou, em qual organização, e "Sair". */
export function Conta() {
  const estado = useAuthStore((s) => s.estado);
  const sessao = useAuthStore((s) => s.sessao);
  const [aberto, setAberto] = useState(false);

  if (estado === 'verificando') return <span className="flex h-8 w-8 items-center justify-center text-slate-400" aria-label="Verificando a sessão"><Loader2 size={16} className="animate-spin" /></span>;
  if (!sessao) {
    return <Button size="sm" icon={<LogIn size={15} />} onClick={() => useAuthStore.getState().abrirLogin()}><span className="hidden sm:inline">Entrar</span></Button>;
  }
  return (
    <div className="relative">
      <button type="button" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100" aria-expanded={aberto} aria-haspopup="menu" onClick={() => setAberto((v) => !v)}>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{sessao.usuario.nome.trim().charAt(0).toUpperCase()}</span>
        <span className="hidden leading-tight xl:block">
          <span className="block max-w-[10rem] truncate text-xs font-semibold text-slate-800">{sessao.usuario.nome}</span>
          <span className="block max-w-[10rem] truncate text-[11px] text-slate-500">{sessao.tenant.nome}</span>
        </span>
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg" onMouseLeave={() => setAberto(false)}>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><UserRound size={15} className="text-slate-400" />{sessao.usuario.nome}</p>
          <p className="ml-6 truncate text-xs text-slate-500">{sessao.usuario.email}</p>
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-700"><Building2 size={15} className="text-slate-400" />{sessao.tenant.nome}</p>
          {sessao.usuario.papel && <p className="ml-6 text-xs text-slate-500">Papel: {PAPEL[sessao.usuario.papel] ?? sessao.usuario.papel}</p>}
          <Button size="sm" className="mt-3 w-full justify-center" icon={<LogOut size={14} />} role="menuitem" onClick={() => { setAberto(false); void useAuthStore.getState().sair(); }}>Sair</Button>
        </div>
      )}
    </div>
  );
}
