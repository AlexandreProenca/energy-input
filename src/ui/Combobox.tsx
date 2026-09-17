import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Check, ChevronDown, Plus } from 'lucide-react';

export interface ComboOption {
  value: string;
  label?: string;
  detail?: string;
}

/**
 * Searchable single-value picker. With `allowFree`, any typed text is accepted;
 * `onCreate` adds a "Criar …" action for values that do not exist yet.
 */
export function Combobox({
  value,
  options,
  onChange,
  placeholder,
  allowFree,
  onCreate,
  createLabel = 'Criar',
  invalid,
  emptyText = 'Nenhuma opção encontrada',
  ariaLabel,
  footer,
}: {
  value: string;
  options: ComboOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  allowFree?: boolean;
  onCreate?: (v: string) => void;
  createLabel?: string;
  invalid?: boolean;
  emptyText?: string;
  ariaLabel?: string;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    const list = q && q !== value.toUpperCase() ? options.filter((o) => `${o.value} ${o.label ?? ''} ${o.detail ?? ''}`.toUpperCase().includes(q)) : options;
    return list.slice(0, 200);
  }, [options, query, value]);

  const exact = options.some((o) => o.value.toUpperCase() === query.trim().toUpperCase());
  const canCreate = !!onCreate && query.trim() !== '' && !exact;

  const pick = (v: string) => {
    onChange(v);
    setQuery(v);
    setOpen(false);
  };

  return (
    <div ref={wrap} className="relative">
      <div className="relative">
        <input
          className={clsx('input pr-9', invalid && 'input-error')}
          value={query}
          placeholder={placeholder}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={open}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
            if (allowFree) onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (open && filtered[active]) pick(filtered[active].value);
              else if (allowFree) pick(query);
            } else if (e.key === 'Escape') {
              setOpen(false);
              setQuery(value);
            }
          }}
          onBlur={() => {
            if (!allowFree) setTimeout(() => setQuery((q) => (options.some((o) => o.value === q) ? q : value)), 150);
          }}
        />
        <button type="button" tabIndex={-1} aria-label="Abrir opções" className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400" onClick={() => setOpen((o) => !o)}>
          <ChevronDown size={16} />
        </button>
      </div>
      {open && (
        <div className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl scrollbar-thin" role="listbox">
          {filtered.length === 0 && !canCreate && <div className="px-3 py-2 text-sm text-slate-500">{emptyText}</div>}
          {filtered.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.value)}
              onMouseEnter={() => setActive(i)}
              className={clsx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm', i === active ? 'bg-brand-50' : 'hover:bg-slate-50')}
            >
              <Check size={14} className={clsx('shrink-0', o.value === value ? 'text-brand-600' : 'invisible')} />
              <span className="min-w-0 flex-1 truncate">{o.label ?? o.value}</span>
              {o.detail && <span className="shrink-0 text-xs text-slate-400">{o.detail}</span>}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onCreate!(query.trim());
                pick(query.trim());
              }}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              <Plus size={14} /> {createLabel} “{query.trim()}”
            </button>
          )}
          {footer}
        </div>
      )}
    </div>
  );
}
