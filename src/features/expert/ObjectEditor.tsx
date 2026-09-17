import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Code2, FormInput, Loader2, Pencil, Save, TriangleAlert, Undo2 } from 'lucide-react';
import type { EpObject } from '@/core/epjson/types';
import { setObject, stableStringify } from '@/core/epjson/document';
import type { FieldSpec } from '@/core/schema/fieldSpec';
import type { ValidationIssue } from '@/core/validation/issues';
import { useSchema } from '@/store/schemaStore';
import { useDocumentStore } from '@/store/documentStore';
import { useUiStore } from '@/store/uiStore';
import { objectKey, type ValidationSummary } from '@/hooks/useValidation';
import { TYPE_HINTS } from '@/i18n/pt-BR';
import { Badge, Button, Callout, Segmented } from '@/ui/primitives';
import { useExpertStore } from './expertStore';
import { FieldInput, FieldRow, type FieldContext } from './fields/FieldWidget';
import { ArrayField } from './fields/ArrayField';
import { RenameDialog } from './ObjectDialogs';

const JsonCode = lazy(() => import('./JsonCode'));

function issuesByField(issues: ValidationIssue[]) {
  const map = new Map<string, string[]>();
  for (const i of issues) {
    const key = i.itemIndex !== undefined ? `${i.field}[${i.itemIndex}].${i.itemField}` : i.field ?? '';
    map.set(key, [...(map.get(key) ?? []), i.message]);
  }
  return map;
}

export function ObjectEditor({ type, name, validation, onBack }: { type: string; name: string; validation: ValidationSummary; onBack: () => void }) {
  const { index, validator } = useSchema();
  const doc = useDocumentStore((s) => s.doc);
  const commit = useDocumentStore((s) => s.commit);
  const toast = useUiStore((s) => s.toast);
  const view = useExpertStore((s) => s.view);
  const setView = useExpertStore((s) => s.setView);
  const setDirty = useExpertStore((s) => s.setDirty);
  const focusField = useExpertStore((s) => s.focusField);
  const clearFocus = useExpertStore((s) => s.clearFocus);
  const info = index.info(type)!;
  const original = doc[type]?.[name];

  const [draft, setDraft] = useState<EpObject>(() => structuredClone(original ?? {}));
  const [showAll, setShowAll] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string>();
  const [triedSave, setTriedSave] = useState(false);
  const lastOriginal = useRef(original);

  const dirty = useMemo(() => stableStringify(draft) !== stableStringify(original ?? {}), [draft, original]);

  // Reset the draft when switching objects, or when the stored object changes (undo, wizard) while clean.
  useEffect(() => {
    setDraft(structuredClone(original ?? {}));
    setTriedSave(false);
    lastOriginal.current = original;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, name]);
  useEffect(() => {
    if (original !== lastOriginal.current) {
      lastOriginal.current = original;
      if (!dirty) setDraft(structuredClone(original ?? {}));
    }
  }, [original, dirty]);

  useEffect(() => setDirty(dirty), [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);

  useEffect(() => {
    if (view === 'objectJson') {
      setJsonText(JSON.stringify(draft, null, 2));
      setJsonError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, type, name]);

  useEffect(() => {
    if (!focusField) return;
    setView('form');
    const t = setTimeout(() => {
      const el = document.getElementById(`field-${focusField}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('ring-2', 'ring-amber-400');
      setTimeout(() => el?.classList.remove('ring-2', 'ring-amber-400'), 1800);
      clearFocus();
    }, 80);
    return () => clearTimeout(t);
  }, [focusField, clearFocus, setView]);

  const draftIssues = useMemo(() => validator.validateInstance(type, name, draft), [validator, type, name, draft]);
  const refIssues = useMemo(() => (validation.byObject.get(objectKey(type, name)) ?? []).filter((i) => i.source === 'reference'), [validation, type, name]);
  const fieldErrors = useMemo(() => issuesByField([...draftIssues, ...(dirty ? [] : refIssues)]), [draftIssues, refIssues, dirty]);
  const missingRequired = draftIssues.filter((i) => i.message.startsWith('Campo obrigatório'));
  const objectLevel = draftIssues.filter((i) => !i.field);

  const ctx: FieldContext = {
    doc,
    index,
    createObject: (t, n) => {
      if (doc[t]?.[n]) return;
      commit(setObject(useDocumentStore.getState().doc, t, n, {}), `Criar ${t}`);
      toast(`${t} “${n}” criado. Preencha os campos obrigatórios dele depois.`, 'info');
    },
  };

  const setField = (key: string, v: unknown) =>
    setDraft((d) => {
      const next = { ...d };
      if (v === undefined) delete next[key];
      else next[key] = v;
      return next;
    });

  const save = () => {
    setTriedSave(true);
    if (missingRequired.length > 0) {
      toast(`Preencha ${missingRequired.length} campo(s) obrigatório(s) antes de salvar.`, 'error');
      const first = missingRequired[0];
      document.getElementById(`field-${first.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    commit(setObject(useDocumentStore.getState().doc, type, name, draft), `Editar ${type}`);
    toast('Alterações salvas.');
  };

  if (!original) {
    return <div className="p-8 text-center text-sm text-slate-500">Este objeto não existe mais.</div>;
  }

  const visibleFields = showAll ? info.fields : info.fields.filter((f) => f.required || draft[f.key] !== undefined);

  const renderField = (spec: FieldSpec) => {
    const errs = fieldErrors.get(spec.key) ?? [];
    const showErrs = triedSave || draft[spec.key] !== undefined ? errs : errs.filter((e) => !e.startsWith('Campo obrigatório'));
    return (
      <FieldRow key={spec.key} spec={spec} errors={showErrs} hasValue={draft[spec.key] !== undefined} onReset={() => setField(spec.key, undefined)}>
        {spec.kind === 'array' ? (
          <ArrayField
            spec={spec}
            value={draft[spec.key]}
            ctx={ctx}
            onChange={(v) => setField(spec.key, v)}
            errorsFor={(i, f) => fieldErrors.get(`${spec.key}[${i}].${f}`) ?? []}
          />
        ) : (
          <FieldInput spec={spec} value={draft[spec.key]} ctx={ctx} invalid={errs.length > 0 && (triedSave || draft[spec.key] !== undefined)} onChange={(v) => setField(spec.key, v)} />
        )}
      </FieldRow>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 lg:hidden">
          <ArrowLeft size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] text-slate-500">{type}</p>
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-base font-semibold text-slate-900">{info.hasName ? name : TYPE_HINTS[type] ?? type}</h2>
            {info.hasName && (
              <button type="button" aria-label="Renomear" className="text-slate-400 hover:text-brand-700" onClick={() => setRenaming(true)}>
                <Pencil size={14} />
              </button>
            )}
            {dirty && <Badge tone="amber">não salvo</Badge>}
          </div>
        </div>
        <Segmented
          size="sm"
          ariaLabel="Visualização"
          value={view === 'objectJson' ? 'objectJson' : 'form'}
          onChange={(v) => {
            if (v === 'objectJson') {
              setJsonText(JSON.stringify(draft, null, 2));
              setJsonError(undefined);
            }
            setView(v);
          }}
          options={[
            { value: 'form', label: 'Formulário', icon: <FormInput size={13} /> },
            { value: 'objectJson', label: 'JSON', icon: <Code2 size={13} /> },
          ]}
        />
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {objectLevel.length > 0 && (
          <div className="mb-3">
            <Callout tone="error" icon={<TriangleAlert size={16} />}>
              {objectLevel.map((i) => i.message).join(' ')}
            </Callout>
          </div>
        )}
        {view === 'objectJson' ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Edite os campos deste objeto em JSON. As mudanças entram no rascunho; clique em “Salvar” para aplicar.</p>
            <Suspense fallback={<Loader2 className="mx-auto animate-spin text-slate-400" />}>
              <JsonCode
                value={jsonText}
                height="calc(100vh - 330px)"
                onChange={(t) => {
                  setJsonText(t);
                  try {
                    const parsed = JSON.parse(t);
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('O objeto precisa ser um JSON { … }');
                    setDraft(parsed);
                    setJsonError(undefined);
                  } catch (e) {
                    setJsonError(e instanceof Error ? e.message : String(e));
                  }
                }}
              />
            </Suspense>
            {jsonError ? (
              <p className="text-xs font-medium text-red-600">JSON inválido: {jsonError}</p>
            ) : (
              draftIssues.length > 0 && (
                <ul className="space-y-0.5 text-xs text-red-600">
                  {draftIssues.map((i) => (
                    <li key={`${i.field}${i.itemIndex}${i.itemField}${i.message}`}>
                      <code>{i.field ?? ''}</code> {i.message}
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                <span className="text-red-500">*</span> obrigatório · campos vazios usam o padrão do EnergyPlus
              </p>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" className="accent-brand-600" checked={!showAll} onChange={(e) => setShowAll(!e.target.checked)} />
                Só preenchidos
              </label>
            </div>
            {info.fields.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Este tipo não tem campos além do nome.</p>}
            <div className="divide-y divide-slate-100">{visibleFields.map(renderField)}</div>
            {refIssues.length > 0 && !dirty && (
              <div className="mt-3">
                <Callout tone="warning" icon={<TriangleAlert size={16} />} title="Referências">
                  {refIssues.map((i) => (
                    <p key={i.message}>{i.message}</p>
                  ))}
                </Callout>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="flex-1 text-xs text-slate-500">
          {missingRequired.length > 0 ? (
            <span className="text-red-600">{missingRequired.length} obrigatório(s) faltando</span>
          ) : draftIssues.length > 0 ? (
            <span className="text-amber-700">{draftIssues.length} problema(s) de validação</span>
          ) : (
            <span className="flex items-center gap-1 text-brand-700">
              <Check size={13} /> Objeto válido
            </span>
          )}
        </span>
        <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} disabled={!dirty} onClick={() => setDraft(structuredClone(original))}>
          Descartar
        </Button>
        <Button size="sm" variant="primary" icon={<Save size={14} />} disabled={!dirty || !!jsonError} onClick={save}>
          Salvar
        </Button>
      </div>
      {renaming && <RenameDialog type={type} name={name} onClose={() => setRenaming(false)} />}
    </div>
  );
}
