import { useMemo, useState } from 'react';
import { ArrowLeft, Copy, FilePlus2, Pencil, Search, Trash2, TriangleAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { useSchema } from '@/store/schemaStore';
import { useDocumentStore } from '@/store/documentStore';
import { useUiStore } from '@/store/uiStore';
import { cloneObject, placeholderName, setObject, uniqueName } from '@/core/epjson/document';
import { groupLabel, TYPE_HINTS } from '@/i18n/pt-BR';
import { objectKey, type ValidationSummary } from '@/hooks/useValidation';
import { IconButton } from '@/ui/primitives';
import { useExpertStore } from './expertStore';
import { DeleteDialog, RenameDialog } from './ObjectDialogs';

export function InstanceList({ type, validation, onBack }: { type: string; validation: ValidationSummary; onBack: () => void }) {
  const { index } = useSchema();
  const doc = useDocumentStore((s) => s.doc);
  const commit = useDocumentStore((s) => s.commit);
  const selectedName = useUiStore((s) => s.expertName);
  const toast = useUiStore((s) => s.toast);
  const navigate = useExpertStore((s) => s.navigate);
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState<string>();
  const [deleting, setDeleting] = useState<string>();

  const info = index.info(type)!;
  const names = useMemo(() => Object.keys(doc[type] ?? {}), [doc, type]);
  const shown = filter ? names.filter((n) => n.toUpperCase().includes(filter.toUpperCase())) : names;
  const canAdd = !info.unique || names.length === 0;

  const add = () => {
    const name = info.hasName ? uniqueName(doc, type, `Novo ${type}`) : uniqueName(doc, type, placeholderName(type));
    commit(setObject(doc, type, name, {}), `Criar ${type}`);
    navigate(type, name);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 p-3">
        <button type="button" onClick={onBack} className="mb-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 md:hidden">
          <ArrowLeft size={14} /> Tipos
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{groupLabel(info.group)}</p>
        <h2 className="break-all font-mono text-sm font-semibold text-slate-900">{type}</h2>
        {(TYPE_HINTS[type] || info.memo) && <p className="mt-1 line-clamp-3 text-xs text-slate-500" title={info.memo}>{TYPE_HINTS[type] ?? info.memo}</p>}
        <div className="mt-2 flex flex-wrap gap-1">
          {info.unique && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">único no arquivo</span>}
          {info.requiredInFile && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700">obrigatório</span>}
        </div>
        <button
          type="button"
          disabled={!canAdd}
          onClick={add}
          title={canAdd ? undefined : 'Este tipo só pode ter um objeto'}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <FilePlus2 size={16} /> Novo objeto
        </button>
      </div>
      {names.length > 6 && (
        <div className="relative border-b border-slate-100 px-3 py-2">
          <Search size={14} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input h-8 pl-7 text-xs" placeholder="Filtrar por nome…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar objetos" />
        </div>
      )}
      <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
        {names.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-slate-500">
            Nenhum objeto deste tipo.
            <br />
            Clique em “Novo objeto”.
          </li>
        )}
        {shown.map((name) => {
          const issues = validation.byObject.get(objectKey(type, name)) ?? [];
          const errors = issues.filter((i) => i.severity === 'error').length;
          const active = selectedName === name;
          return (
            <li key={name} className="group relative">
              <button
                type="button"
                onClick={() => navigate(type, name)}
                aria-current={active ? 'true' : undefined}
                className={clsx('flex w-full items-center gap-2 rounded-lg py-2 pl-3 pr-20 text-left text-sm', active ? 'bg-brand-50 font-medium text-brand-900 ring-1 ring-brand-300' : 'text-slate-700 hover:bg-slate-100')}
              >
                {issues.length > 0 && <TriangleAlert size={13} className={clsx('shrink-0', errors ? 'text-red-500' : 'text-amber-500')} />}
                <span className="truncate">{info.hasName ? name : <span className="italic text-slate-500">{name}</span>}</span>
              </button>
              <div className={clsx('absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5', active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100')}>
                {info.hasName && (
                  <IconButton label="Renomear" className="h-7 w-7" onClick={() => setRenaming(name)}>
                    <Pencil size={13} />
                  </IconButton>
                )}
                {!info.unique && (
                  <IconButton
                    label="Duplicar"
                    className="h-7 w-7"
                    onClick={() => {
                      const r = cloneObject(doc, type, name);
                      commit(r.doc, `Duplicar ${type}`);
                      navigate(type, r.name);
                      toast(`Criado “${r.name}”.`);
                    }}
                  >
                    <Copy size={13} />
                  </IconButton>
                )}
                <IconButton label="Excluir" className="h-7 w-7 hover:text-red-600" onClick={() => setDeleting(name)}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>
      {renaming && <RenameDialog type={type} name={renaming} onClose={() => setRenaming(undefined)} />}
      {deleting && <DeleteDialog type={type} name={deleting} onClose={() => setDeleting(undefined)} />}
    </div>
  );
}
