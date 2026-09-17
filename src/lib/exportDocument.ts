import { serializeDocument } from '@/core/epjson/document';
import { useDocumentStore } from '@/store/documentStore';
import { useSchemaStore } from '@/store/schemaStore';
import { useUiStore } from '@/store/uiStore';
import { downloadText, safeFileName } from './files';

/** Downloads the current document (types and fields in schema order). */
export function exportCurrentDocument(fileName?: string) {
  const { doc, fileName: current, setFileName } = useDocumentStore.getState();
  const index = useSchemaStore.getState().index;
  const name = fileName ? safeFileName(fileName) : current;
  downloadText(name, serializeDocument(doc, index));
  setFileName(name);
  useUiStore.getState().toast(`Arquivo ${name} baixado.`);
}
