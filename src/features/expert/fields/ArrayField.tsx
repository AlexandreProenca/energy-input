import { useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import type { EpObject } from '@/core/epjson/types';
import type { FieldSpec } from '@/core/schema/fieldSpec';
import { parseLocaleNumber } from '@/ui/NumberInput';
import { Button, Dialog, IconButton } from '@/ui/primitives';
import { FieldInput, type FieldContext } from './FieldWidget';

type ArraySpec = Extract<FieldSpec, { kind: 'array' }>;

/**
 * Extensible group editor (vertices, schedule fields, equipment lists…):
 * one table row per group, with add/remove/reorder and spreadsheet paste.
 */
export function ArrayField({
  spec,
  value,
  onChange,
  ctx,
  errorsFor,
}: {
  spec: ArraySpec;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: FieldContext;
  errorsFor: (index: number, itemField: string) => string[];
}) {
  const rows: EpObject[] = Array.isArray(value) ? (value as EpObject[]) : [];
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const set = (next: EpObject[]) => onChange(next.length ? next : undefined);
  const single = spec.itemFields.length === 1;

  const update = (i: number, key: string, v: unknown) => {
    const next = rows.map((r, j) => {
      if (j !== i) return r;
      const copy = { ...r };
      if (v === undefined) delete copy[key];
      else copy[key] = v;
      return copy;
    });
    set(next);
  };
  const move = (i: number, d: number) => {
    const next = [...rows];
    const [r] = next.splice(i, 1);
    next.splice(i + d, 0, r);
    set(next);
  };

  const applyPaste = () => {
    const parsed = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const cells = single ? [line] : line.split(/\t|;|\s{2,}|,(?=\s*-?\d)/).map((c) => c.trim());
        const row: EpObject = {};
        spec.itemFields.forEach((f, i) => {
          const c = cells[i];
          if (c === undefined || c === '') return;
          const n = parseLocaleNumber(c);
          row[f.key] = (f.kind === 'number' || f.kind === 'integer' || f.kind === 'autoNumber' || f.kind === 'numberOrText') && n !== undefined && !Number.isNaN(n) ? n : c;
        });
        return row;
      });
    set([...rows, ...parsed]);
    setPasteText('');
    setPasteOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="scrollbar-thin overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-max text-xs">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 px-2 py-2 text-center">#</th>
              {spec.itemFields.map((f) => (
                <th key={f.key} className="px-2 py-2 font-semibold" title={f.note}>
                  {f.label}
                  {f.required && <span className="text-red-500">*</span>}
                  {f.units && <span className="ml-1 normal-case text-slate-400">({f.units})</span>}
                </th>
              ))}
              <th className="w-24 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={spec.itemFields.length + 2} className="px-3 py-4 text-center text-slate-500">
                  Nenhum item. Adicione uma linha ou cole de uma planilha.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-slate-100 align-top">
                <td className="px-2 py-1.5 text-center tabular-nums text-slate-400">{i + 1}</td>
                {spec.itemFields.map((f) => {
                  const errs = errorsFor(i, f.key);
                  return (
                    <td key={f.key} className="min-w-[130px] px-1.5 py-1" title={errs.join('\n') || undefined}>
                      <FieldInput spec={f} value={row?.[f.key]} ctx={ctx} compact invalid={errs.length > 0} onChange={(v) => update(i, f.key, v)} />
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-1 py-1">
                  <IconButton label="Mover para cima" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp size={13} />
                  </IconButton>
                  <IconButton label="Mover para baixo" className="h-7 w-7" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown size={13} />
                  </IconButton>
                  <IconButton label="Remover linha" className="h-7 w-7 hover:text-red-600" onClick={() => set(rows.filter((_, j) => j !== i))}>
                    <Trash2 size={13} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="subtle" icon={<Plus size={14} />} onClick={() => set([...rows, {}])}>
          Adicionar linha
        </Button>
        <Button size="sm" variant="ghost" icon={<ClipboardPaste size={14} />} onClick={() => setPasteOpen(true)}>
          Colar de planilha
        </Button>
        <span className="self-center text-xs text-slate-400">{rows.length} item(ns)</span>
      </div>
      <Dialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        icon={<ClipboardPaste size={18} />}
        title="Colar linhas"
        footer={
          <>
            <Button onClick={() => setPasteOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={applyPaste} disabled={!pasteText.trim()}>
              Adicionar linhas
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm text-slate-600">
          Uma linha por item{single ? '' : `, colunas separadas por Tab ou ponto e vírgula, na ordem: ${spec.itemFields.map((f) => f.label).join(' · ')}`}.
        </p>
        <textarea className="input h-48 font-mono text-xs" value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={single ? 'Through: 12/31\nFor: AllDays\nUntil: 24:00\n1' : '0\t0\t3\n0\t0\t0\n10\t0\t0'} />
      </Dialog>
    </div>
  );
}
