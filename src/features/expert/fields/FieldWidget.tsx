import { useMemo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import type { EpJsonDocument } from '@/core/epjson/types';
import { describeBounds, type FieldSpec } from '@/core/schema/fieldSpec';
import type { SchemaIndex } from '@/core/schema/schemaIndex';
import { namesForLists } from '@/core/validation/crossRefs';
import { formatLocaleNumber, NumberInput, parseLocaleNumber } from '@/ui/NumberInput';
import { Combobox, type ComboOption } from '@/ui/Combobox';
import { HelpTip, Segmented } from '@/ui/primitives';
import { suggestionsFor } from './outputSuggestions';

export interface FieldContext {
  doc: EpJsonDocument;
  index: SchemaIndex;
  /** Creates an empty object of `type` named `name` in the document. */
  createObject: (type: string, name: string) => void;
}

const defaultText = (d: FieldSpec['default']) => (d === undefined ? undefined : typeof d === 'number' ? formatLocaleNumber(d) : String(d));

/** Input control for one field value (no label). `value === undefined` means "omit / use default". */
export function FieldInput({
  spec,
  value,
  onChange,
  ctx,
  invalid,
  compact,
}: {
  spec: FieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: FieldContext;
  invalid?: boolean;
  compact?: boolean;
}) {
  const placeholder = defaultText(spec.default) !== undefined ? `padrão: ${defaultText(spec.default)}` : compact ? '' : 'vazio';

  switch (spec.kind) {
    case 'number':
    case 'integer':
      return (
        <NumberInput
          aria-label={spec.label}
          value={typeof value === 'number' ? value : undefined}
          integer={spec.kind === 'integer'}
          unit={compact ? undefined : spec.units}
          placeholder={placeholder}
          invalid={invalid || (value !== undefined && typeof value !== 'number')}
          onValue={(v) => onChange(v)}
          className={compact ? 'h-8 px-2 text-xs' : undefined}
        />
      );

    case 'text':
      return (
        <input
          aria-label={spec.label}
          className={clsx('input', compact && 'h-8 px-2 text-xs', invalid && 'input-error')}
          value={typeof value === 'string' ? value : value === undefined ? '' : String(value)}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        />
      );

    case 'numberOrText':
      return (
        <input
          aria-label={spec.label}
          className={clsx('input font-mono', compact && 'h-8 px-2 text-xs', invalid && 'input-error')}
          value={value === undefined ? '' : typeof value === 'number' ? formatLocaleNumber(value) : String(value)}
          placeholder={placeholder}
          onChange={(e) => {
            const t = e.target.value;
            if (t === '') return onChange(undefined);
            const n = parseLocaleNumber(t);
            // Keep text like "Until: 08:00" as a string; plain numbers become numbers.
            onChange(n !== undefined && !Number.isNaN(n) && /^[\s\d.,eE+-]+$/.test(t) ? n : t);
          }}
        />
      );

    case 'enum': {
      const current = typeof value === 'string' ? value : undefined;
      const unknown = current !== undefined && !spec.options.includes(current);
      if (spec.options.length > 12) {
        return (
          <Combobox
            ariaLabel={spec.label}
            value={current ?? ''}
            invalid={invalid || unknown}
            placeholder={placeholder}
            options={spec.options.map((o) => ({ value: o, detail: o === spec.default ? 'padrão' : undefined }))}
            onChange={(v) => onChange(v === '' ? undefined : v)}
          />
        );
      }
      return (
        <select
          aria-label={spec.label}
          className={clsx('input', compact && 'h-8 px-2 text-xs', (invalid || unknown) && 'input-error', current === undefined && 'text-slate-400')}
          value={current ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        >
          <option value="">{spec.default !== undefined ? `— padrão (${spec.default}) —` : '— não definido —'}</option>
          {unknown && <option value={current}>{current} (inválido)</option>}
          {spec.options.map((o) => (
            <option key={o} value={o} className="text-slate-900">
              {o}
            </option>
          ))}
        </select>
      );
    }

    case 'yesno': {
      const v = value === 'Yes' || value === 'No' ? value : '';
      return (
        <Segmented
          size="sm"
          ariaLabel={spec.label}
          value={v}
          onChange={(nv) => onChange(nv === '' ? undefined : nv)}
          options={[
            { value: '', label: spec.default !== undefined ? `Padrão (${spec.default === 'Yes' ? 'Sim' : 'Não'})` : 'Não definido' },
            { value: 'Yes', label: 'Sim' },
            { value: 'No', label: 'Não' },
          ]}
        />
      );
    }

    case 'autoNumber': {
      const autoLabel = spec.autoValue === 'Autosize' ? 'Autosize' : 'Autocalcular';
      const mode = value === undefined || value === '' ? 'default' : typeof value === 'number' ? 'value' : 'auto';
      return (
        <div className={clsx('flex flex-wrap items-center gap-2', compact && 'flex-nowrap')}>
          <Segmented
            size="sm"
            ariaLabel={`${spec.label}: modo`}
            value={mode}
            onChange={(m) => onChange(m === 'default' ? undefined : m === 'auto' ? spec.autoValue : typeof spec.default === 'number' ? spec.default : 0)}
            options={[
              ...(spec.default !== undefined && !compact ? [{ value: 'default' as const, label: 'Padrão' }] : []),
              { value: 'auto' as const, label: autoLabel },
              { value: 'value' as const, label: 'Valor' },
            ]}
          />
          {mode === 'value' && (
            <div className="min-w-[120px] flex-1">
              <NumberInput aria-label={spec.label} value={value as number} integer={spec.integer} unit={spec.units} invalid={invalid} onValue={(v) => onChange(v ?? spec.autoValue)} />
            </div>
          )}
          {mode === 'default' && <span className="text-xs text-slate-400">({defaultText(spec.default)})</span>}
        </div>
      );
    }

    case 'numericEnum':
      return (
        <select
          aria-label={spec.label}
          className={clsx('input', invalid && 'input-error')}
          value={typeof value === 'number' ? String(value) : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        >
          <option value="">{spec.default !== undefined ? `— padrão (${spec.default}) —` : '— não definido —'}</option>
          {spec.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );

    case 'reference':
      return <ReferenceInput spec={spec} value={value} onChange={onChange} ctx={ctx} invalid={invalid} compact={compact} />;

    case 'classReference': {
      const options = spec.lists.flatMap((l) => ctx.index.classMembersOf(l)).map((t) => ({ value: t }));
      return <Combobox ariaLabel={spec.label} value={typeof value === 'string' ? value : ''} options={options} invalid={invalid} placeholder="Tipo de objeto…" onChange={(v) => onChange(v || undefined)} />;
    }

    case 'externalList':
      return (
        <Combobox
          ariaLabel={spec.label}
          allowFree
          value={typeof value === 'string' ? value : ''}
          invalid={invalid}
          placeholder={placeholder}
          options={suggestionsFor(spec.lists).map((s) => ({ value: s }))}
          onChange={(v) => onChange(v === '' ? undefined : v)}
          emptyText="Digite o nome exato (veja eplusout.rdd após uma simulação)"
        />
      );

    case 'array':
      return null; // rendered by ArrayField
  }
}

function ReferenceInput({
  spec,
  value,
  onChange,
  ctx,
  invalid,
  compact,
}: {
  spec: Extract<FieldSpec, { kind: 'reference' }>;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: FieldContext;
  invalid?: boolean;
  compact?: boolean;
}) {
  const names = useMemo(() => namesForLists(ctx.doc, ctx.index, spec.lists), [ctx.doc, ctx.index, spec.lists]);
  const options: ComboOption[] = useMemo(() => [...(names?.values() ?? [])].map((n) => ({ value: n.name, detail: n.type })), [names]);
  const creatable = useMemo(() => {
    const providers = spec.lists.flatMap((l) => ctx.index.providersOf(l)).filter((p) => !p.field);
    return providers[0]?.type;
  }, [ctx.index, spec.lists]);
  const current = typeof value === 'string' ? value : '';
  const dangling = !!names && current !== '' && !names.has(current.toUpperCase());

  return (
    <div>
      <Combobox
        ariaLabel={spec.label}
        value={current}
        options={options}
        allowFree
        invalid={invalid || dangling}
        placeholder={names ? (options.length ? 'Escolha ou digite…' : 'Nenhum objeto compatível ainda') : 'Nome (referência livre)'}
        onChange={(v) => onChange(v === '' ? undefined : v)}
        onCreate={creatable ? (name) => ctx.createObject(creatable, name) : undefined}
        createLabel={creatable ? `Criar ${creatable}` : undefined}
        emptyText={names ? 'Nenhum objeto encontrado' : 'Digite o nome'}
      />
      {dangling && !compact && <p className="mt-1 text-xs text-amber-700">Nenhum objeto com este nome ({spec.lists.join(', ')}).</p>}
    </div>
  );
}

/** Label, help, units and error around a FieldInput. */
export function FieldRow({
  spec,
  errors,
  children,
  onReset,
  hasValue,
}: {
  spec: FieldSpec;
  errors: string[];
  children: ReactNode;
  onReset: () => void;
  hasValue: boolean;
}) {
  const bounds = spec.kind === 'number' || spec.kind === 'integer' || spec.kind === 'autoNumber' ? describeBounds(spec) : undefined;
  const hintParts = [spec.units && `Unidade: ${spec.units}${spec.ipUnits ? ` (IP: ${spec.ipUnits})` : ''}`, bounds && `Faixa: ${bounds}`].filter(Boolean);
  return (
    <div id={`field-${spec.key}`} className="scroll-mt-24 rounded-lg px-1 py-2 target:bg-amber-50">
      <div className="mb-1.5 flex items-center gap-1.5">
        <label className="text-sm font-medium text-slate-800">
          {spec.label}
          {spec.required && <span className="ml-0.5 text-red-500" title="Obrigatório">*</span>}
        </label>
        {spec.note && <HelpTip>{spec.note}</HelpTip>}
        <code className="hidden text-[10px] text-slate-400 sm:inline">{spec.key}</code>
        {hasValue && spec.kind !== 'array' && (
          <button type="button" onClick={onReset} className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 hover:text-brand-700" title="Remover o valor (usar o padrão)">
            <RotateCcw size={11} /> limpar
          </button>
        )}
      </div>
      {children}
      {errors.length > 0 ? (
        errors.map((e) => (
          <p key={e} className="mt-1 text-xs font-medium text-red-600">
            {e}
          </p>
        ))
      ) : hintParts.length > 0 ? (
        <p className="mt-1 text-[11px] text-slate-500">{hintParts.join(' · ')}</p>
      ) : null}
    </div>
  );
}
