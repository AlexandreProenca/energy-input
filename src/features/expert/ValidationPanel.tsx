import { useMemo, useState } from 'react';
import { ChevronDown, CircleAlert, TriangleAlert, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { ValidationSummary } from '@/hooks/useValidation';
import { IconButton, Segmented } from '@/ui/primitives';
import { useExpertStore } from './expertStore';

export function ValidationPanel({ validation }: { validation: ValidationSummary }) {
  const open = useExpertStore((s) => s.issuesOpen);
  const setOpen = useExpertStore((s) => s.setIssuesOpen);
  const navigate = useExpertStore((s) => s.navigate);
  const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all');

  const issues = useMemo(() => validation.issues.filter((i) => filter === 'all' || i.severity === filter), [validation.issues, filter]);
  if (!open) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex max-h-[45%] flex-col border-t border-slate-300 bg-white shadow-[0_-8px_24px_rgba(15,23,42,.08)]">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2">
        <h3 className="text-sm font-semibold text-slate-800">Validação</h3>
        <Segmented
          size="sm"
          ariaLabel="Filtrar problemas"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Todos (${validation.issues.length})` },
            { value: 'error', label: `Erros (${validation.errors})` },
            { value: 'warning', label: `Avisos (${validation.warnings})` },
          ]}
        />
        <IconButton label="Fechar painel" className="ml-auto" onClick={() => setOpen(false)}>
          <ChevronDown size={18} />
        </IconButton>
      </div>
      <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {issues.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Nenhum problema encontrado. 🎉</li>}
        {issues.slice(0, 500).map((i, n) => (
          <li key={n}>
            <button
              type="button"
              disabled={!i.objectType}
              onClick={() => i.objectType && navigate(i.objectType, i.objectName, i.field)}
              className="flex w-full items-start gap-2 border-b border-slate-50 px-4 py-2 text-left text-sm hover:bg-slate-50"
            >
              {i.severity === 'error' ? <CircleAlert size={15} className="mt-0.5 shrink-0 text-red-500" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-500" />}
              <span className="min-w-0 flex-1">
                <span className={clsx('block', i.severity === 'error' ? 'text-slate-800' : 'text-slate-700')}>{i.message}</span>
                <span className="block truncate font-mono text-[11px] text-slate-500">
                  {[i.objectType, i.objectName, i.field, i.itemIndex !== undefined ? `#${i.itemIndex + 1}` : undefined, i.itemField].filter((x) => x !== undefined).join(' › ')}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {issues.length > 500 && (
        <p className="flex items-center gap-1 px-4 py-1 text-xs text-slate-500">
          <X size={12} /> Mostrando 500 de {issues.length}.
        </p>
      )}
    </div>
  );
}
