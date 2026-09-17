import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { serializeDocument } from '@/core/epjson/document';
import type { EpJsonDocument } from '@/core/epjson/types';
import { useDocumentStore } from '@/store/documentStore';
import { useSchema } from '@/store/schemaStore';
import type { ValidationSummary } from '@/hooks/useValidation';

const JsonCode = lazy(() => import('./JsonCode'));

/** Whole-file JSON editor, kept in sync with the form views. */
export function FileJsonView({ validation }: { validation: ValidationSummary }) {
  const { index } = useSchema();
  const doc = useDocumentStore((s) => s.doc);
  const commit = useDocumentStore((s) => s.commit);
  const [text, setText] = useState(() => serializeDocument(doc, index));
  const [parseError, setParseError] = useState<string>();
  const lastApplied = useRef<EpJsonDocument>(doc);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // External changes (undo, wizard, forms) replace the text when it is not mid-edit.
  useEffect(() => {
    if (doc !== lastApplied.current && !parseError) {
      lastApplied.current = doc;
      setText(serializeDocument(doc, index));
    }
  }, [doc, index, parseError]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (t: string) => {
    setText(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const parsed = JSON.parse(t);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('O arquivo precisa ser um objeto JSON { … }');
        const bad = Object.entries(parsed).find(([, v]) => !v || typeof v !== 'object' || Array.isArray(v));
        if (bad) throw new Error(`"${bad[0]}" deve conter um objeto { "nome": { … } }`);
        setParseError(undefined);
        lastApplied.current = parsed;
        commit(parsed, 'Edição do JSON');
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e));
      }
    }, 600);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 text-sm">
        <span className="font-semibold text-slate-800">JSON do arquivo completo</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs">
          {parseError ? (
            <span className="flex items-center gap-1 text-red-600">
              <TriangleAlert size={14} /> {parseError}
            </span>
          ) : validation.errors ? (
            <span className="flex items-center gap-1 text-red-600">
              <TriangleAlert size={14} /> JSON ok · {validation.errors} erro(s) de schema
            </span>
          ) : (
            <span className="flex items-center gap-1 text-brand-700">
              <CheckCircle2 size={14} /> Sincronizado e válido
            </span>
          )}
        </span>
      </div>
      <div className="min-h-0 flex-1 p-3">
        <Suspense fallback={<Loader2 className="mx-auto mt-10 animate-spin text-slate-400" />}>
          <JsonCode value={text} onChange={onChange} height="calc(100vh - 210px)" />
        </Suspense>
      </div>
    </div>
  );
}
