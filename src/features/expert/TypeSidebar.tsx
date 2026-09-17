import { useMemo, useState } from 'react';
import { ChevronRight, Search, TriangleAlert, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useSchema } from '@/store/schemaStore';
import { useDocumentStore } from '@/store/documentStore';
import { useUiStore } from '@/store/uiStore';
import { groupLabel, TYPE_HINTS } from '@/i18n/pt-BR';
import type { ValidationSummary } from '@/hooks/useValidation';
import { useExpertStore } from './expertStore';

export function TypeSidebar({ validation }: { validation: ValidationSummary }) {
  const { index } = useSchema();
  const doc = useDocumentStore((s) => s.doc);
  const selected = useUiStore((s) => s.expertType);
  const navigate = useExpertStore((s) => s.navigate);
  const [query, setQuery] = useState('');
  const [onlyUsed, setOnlyUsed] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const errorTypes = useMemo(() => {
    const s = new Set<string>();
    for (const i of validation.issues) if (i.severity === 'error' && i.objectType) s.add(i.objectType);
    return s;
  }, [validation.issues]);

  const q = query.trim().toUpperCase();
  const groups = useMemo(
    () =>
      index.groups
        .map((g) => ({
          ...g,
          types: g.types.filter((t) => (q ? t.toUpperCase().includes(q) || (TYPE_HINTS[t] ?? '').toUpperCase().includes(q) : !onlyUsed || doc[t])),
        }))
        .filter((g) => g.types.length > 0),
    [index, q, onlyUsed, doc],
  );
  const usedCount = Object.keys(doc).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-slate-200 p-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input h-9 pl-8 pr-8" placeholder={`Buscar entre ${index.typeNames.length} tipos…`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar tipo de objeto" />
          {query && (
            <button type="button" aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" onClick={() => setQuery('')}>
              <X size={15} />
            </button>
          )}
        </div>
        {!q && (
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
            <button type="button" onClick={() => setOnlyUsed(true)} className={clsx('flex-1 rounded-md py-1', onlyUsed ? 'bg-white shadow-sm text-brand-700' : 'text-slate-500')}>
              No arquivo ({usedCount})
            </button>
            <button type="button" onClick={() => setOnlyUsed(false)} className={clsx('flex-1 rounded-md py-1', !onlyUsed ? 'bg-white shadow-sm text-brand-700' : 'text-slate-500')}>
              Todos ({index.typeNames.length})
            </button>
          </div>
        )}
      </div>
      <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2" aria-label="Tipos de objeto">
        {groups.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Nenhum tipo encontrado.</p>}
        {groups.map((g) => {
          const count = g.types.reduce((n, t) => n + Object.keys(doc[t] ?? {}).length, 0);
          const expanded = q || onlyUsed ? open[g.name] !== false : open[g.name] === true || g.types.includes(selected ?? '');
          return (
            <div key={g.name} className="mb-0.5">
              <button
                type="button"
                aria-expanded={!!expanded}
                onClick={() => setOpen((o) => ({ ...o, [g.name]: !expanded }))}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-100"
              >
                <ChevronRight size={14} className={clsx('shrink-0 transition', expanded && 'rotate-90')} />
                <span className="flex-1 truncate" title={g.name}>
                  {groupLabel(g.name)}
                </span>
                {count > 0 && <span className="rounded-full bg-brand-100 px-1.5 text-[10px] text-brand-800">{count}</span>}
              </button>
              {expanded && (
                <ul className="mb-1 ml-3 border-l border-slate-200 pl-1">
                  {g.types.map((t) => {
                    const n = Object.keys(doc[t] ?? {}).length;
                    return (
                      <li key={t}>
                        <button
                          type="button"
                          onClick={() => navigate(t, undefined)}
                          aria-current={selected === t ? 'true' : undefined}
                          title={TYPE_HINTS[t] ?? t}
                          className={clsx(
                            'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px]',
                            selected === t ? 'bg-brand-600 text-white' : n ? 'text-slate-800 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{t}</span>
                          {errorTypes.has(t) && <TriangleAlert size={12} className={selected === t ? 'text-white' : 'text-red-500'} />}
                          {n > 0 && <span className={clsx('text-[11px] tabular-nums', selected === t ? 'text-white/80' : 'text-slate-500')}>{n}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
