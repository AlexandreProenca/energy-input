import { lazy, Suspense, useMemo, useState } from 'react';
import { Code2, Copy, Download, Loader2 } from 'lucide-react';
import { serializeDocument } from '@/core/epjson/document';
import { useDocumentStore } from '@/store/documentStore';
import { useSchemaStore } from '@/store/schemaStore';
import { useUiStore } from '@/store/uiStore';
import { exportCurrentDocument } from '@/lib/exportDocument';
import { Button, Dialog } from '@/ui/primitives';

const JsonCode = lazy(() => import('@/features/expert/JsonCode'));

export function JsonPreviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useDocumentStore((s) => s.doc);
  const index = useSchemaStore((s) => s.index);
  const toast = useUiStore((s) => s.toast);
  const [type, setType] = useState('');
  const text = useMemo(() => (open ? serializeDocument(type ? { [type]: doc[type] } : doc, index) : ''), [open, doc, index, type]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      icon={<Code2 size={18} />}
      title="epJSON gerado"
      footer={
        <>
          <Button
            icon={<Copy size={15} />}
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => toast('JSON copiado.'));
            }}
          >
            Copiar
          </Button>
          <Button variant="primary" icon={<Download size={15} />} onClick={() => exportCurrentDocument()}>
            Baixar arquivo completo
          </Button>
        </>
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <label htmlFor="json-type" className="text-sm text-slate-600">
          Mostrar:
        </label>
        <select id="json-type" className="input max-w-xs" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Arquivo completo</option>
          {Object.keys(doc)
            .sort()
            .map((t) => (
              <option key={t} value={t}>
                {t} ({Object.keys(doc[t]).length})
              </option>
            ))}
        </select>
      </div>
      <Suspense fallback={<Loader2 className="mx-auto animate-spin text-slate-400" />}>
        <JsonCode value={text} readOnly height="60vh" />
      </Suspense>
    </Dialog>
  );
}
