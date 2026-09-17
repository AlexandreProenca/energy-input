import CodeMirror from '@uiw/react-codemirror';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter, lintGutter } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';

const theme = EditorView.theme({
  '&': { fontSize: '12.5px', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' },
  '.cm-content': { fontFamily: '"JetBrains Mono", ui-monospace, monospace' },
  '.cm-gutters': { backgroundColor: '#f8fafc', borderRight: '1px solid #e2e8f0' },
});

export default function JsonCode({
  value,
  onChange,
  readOnly,
  height = '100%',
}: {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  height?: string;
}) {
  return (
    <CodeMirror
      value={value}
      height={height}
      readOnly={readOnly}
      editable={!readOnly}
      onChange={onChange}
      basicSetup={{ foldGutter: true, highlightActiveLine: !readOnly, autocompletion: false }}
      extensions={[json(), theme, EditorView.lineWrapping, ...(readOnly ? [] : [linter(jsonParseLinter()), lintGutter()])]}
    />
  );
}
