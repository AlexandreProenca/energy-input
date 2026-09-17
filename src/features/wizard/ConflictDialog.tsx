import { useState } from 'react';
import { GitMerge } from 'lucide-react';
import { useWizardStore } from '@/store/wizardStore';
import { Button, Dialog } from '@/ui/primitives';

/** Asked when a wizard change would overwrite objects edited in Expert mode. */
export function ConflictDialog() {
  const pending = useWizardStore((s) => s.pending);
  const resolve = useWizardStore((s) => s.resolve);
  const cancel = useWizardStore((s) => s.cancelPending);
  const [remember, setRemember] = useState(false);
  if (!pending) return null;
  const list = pending.conflicts.slice(0, 8);

  return (
    <Dialog
      open
      onClose={cancel}
      icon={<GitMerge size={18} />}
      title="Você editou objetos que o assistente quer atualizar"
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" className="accent-brand-600" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Lembrar a escolha nesta sessão
          </label>
          <Button onClick={() => resolve('overwrite', remember)}>Sobrescrever</Button>
          <Button variant="primary" onClick={() => resolve('keep', remember)}>
            Manter minhas edições
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        A mudança feita no assistente altera {pending.conflicts.length} objeto(s) que foram modificados no modo especialista. O que fazer com eles?
      </p>
      <ul className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
        {list.map((c) => (
          <li key={`${c.type}/${c.name}`} className="truncate">
            <span className="font-mono text-xs text-slate-500">{c.type}</span> · <strong className="text-slate-800">{c.name}</strong>
          </li>
        ))}
        {pending.conflicts.length > list.length && <li className="text-xs text-slate-500">e mais {pending.conflicts.length - list.length}…</li>}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        “Manter” preserva suas versões desses objetos e aplica o resto da mudança (cuidado: geometria editada pode ficar desalinhada com o resto). “Sobrescrever” usa os valores do assistente.
        Fechar esta janela desfaz a mudança no assistente. Objetos que você criou nunca são apagados.
      </p>
    </Dialog>
  );
}
