import { useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useSchema } from '@/store/schemaStore';
import { useDocumentStore } from '@/store/documentStore';
import { useUiStore } from '@/store/uiStore';
import { deleteObject, findReferences, nameExists, renameObject } from '@/core/epjson/document';
import { Button, Callout, Dialog, Field } from '@/ui/primitives';
import { useExpertStore } from './expertStore';

export function RenameDialog({ type, name, onClose, onRenamed }: { type: string; name: string; onClose: () => void; onRenamed?: (newName: string) => void }) {
  const { index } = useSchema();
  const doc = useDocumentStore((s) => s.doc);
  const commit = useDocumentStore((s) => s.commit);
  const [value, setValue] = useState(name);
  const [propagate, setPropagate] = useState(true);
  const refs = useMemo(() => findReferences(doc, index, type, name), [doc, index, type, name]);
  const trimmed = value.trim();
  const error = !trimmed ? 'O nome não pode ficar vazio.' : trimmed !== name && nameExists(doc, type, trimmed, name) ? `Já existe um ${type} com este nome (EnergyPlus não diferencia maiúsculas).` : undefined;

  const save = () => {
    if (error || trimmed === name) return onClose();
    commit(renameObject(doc, index, type, name, trimmed, propagate), `Renomear ${type}`);
    if (onRenamed) onRenamed(trimmed);
    else {
      useUiStore.getState().selectObject(type, trimmed);
      useExpertStore.getState().setDirty(false);
    }
    useUiStore.getState().toast(propagate && refs.length ? `Renomeado e ${refs.length} referência(s) atualizada(s).` : 'Objeto renomeado.');
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      icon={<Pencil size={18} />}
      title="Renomear objeto"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!!error} onClick={save}>
            Renomear
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4"
      >
        <Field label="Novo nome" error={error} htmlFor="rename-input">
          <input id="rename-input" autoFocus className="input" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        {refs.length > 0 ? (
          <label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm">
            <input type="checkbox" className="mt-1 accent-brand-600" checked={propagate} onChange={(e) => setPropagate(e.target.checked)} />
            <span>
              Atualizar as <strong>{refs.length}</strong> referência(s) a “{name}” em outros objetos
              <span className="mt-1 block max-h-28 overflow-y-auto text-xs text-slate-500">
                {refs.slice(0, 20).map((r) => (
                  <span key={`${r.type}/${r.name}/${r.field}/${r.itemIndex}`} className="block truncate">
                    {r.type} · {r.name} · {r.itemField ?? r.field}
                  </span>
                ))}
              </span>
            </span>
          </label>
        ) : (
          <p className="text-xs text-slate-500">Nenhum outro objeto faz referência a este nome.</p>
        )}
      </form>
    </Dialog>
  );
}

export function DeleteDialog({ type, name, onClose, onDeleted }: { type: string; name: string; onClose: () => void; onDeleted?: () => void }) {
  const { index } = useSchema();
  const doc = useDocumentStore((s) => s.doc);
  const commit = useDocumentStore((s) => s.commit);
  const refs = useMemo(() => findReferences(doc, index, type, name), [doc, index, type, name]);
  return (
    <Dialog
      open
      onClose={onClose}
      icon={<Trash2 size={18} />}
      title={`Excluir “${name}”?`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={() => {
              commit(deleteObject(doc, type, name), `Excluir ${type}`);
              const ui = useUiStore.getState();
              if (onDeleted) onDeleted();
              else {
                if (ui.expertName === name) ui.selectObject(type, undefined);
                useExpertStore.getState().setDirty(false);
              }
              ui.toast('Objeto excluído. Use “Desfazer” se precisar.', 'info');
              onClose();
            }}
          >
            Excluir
          </Button>
        </>
      }
    >
      {refs.length > 0 ? (
        <Callout tone="warning" title={`${refs.length} objeto(s) apontam para este nome`}>
          As referências ficarão quebradas e aparecerão como avisos na validação.
        </Callout>
      ) : (
        <p className="text-sm text-slate-600">Você pode desfazer esta ação.</p>
      )}
    </Dialog>
  );
}
