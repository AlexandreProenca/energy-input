import { useState } from 'react';
import { Braces, CheckCircle2, CircleAlert, Database, FilePlus2, FolderOpen, Loader2, MousePointerClick, Save, Sparkles, TriangleAlert } from 'lucide-react';
import { clsx } from 'clsx';
import type { EpJsonDocument } from '@/core/epjson/types';
import { countObjects, diffDocuments, placeholderName, type DocumentDiff } from '@/core/epjson/document';
import { useSchemaStore, useSchema } from '@/store/schemaStore';
import { useDocumentStore } from '@/store/documentStore';
import { useUiStore } from '@/store/uiStore';
import { useWizardStore } from '@/store/wizardStore';
import { useValidation } from '@/hooks/useValidation';
import { exportCurrentDocument } from '@/lib/exportDocument';
import { pickFile, readTextFile } from '@/lib/files';
import { Button, Callout, Dialog } from '@/ui/primitives';
import { useExpertStore } from './expertStore';
import { TypeSidebar } from './TypeSidebar';
import { InstanceList } from './InstanceList';
import { ObjectEditor } from './ObjectEditor';
import { FileJsonView } from './FileJsonView';
import { ValidationPanel } from './ValidationPanel';

function DiffList({ title, items, tone }: { title: string; items: { type: string; name: string }[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <details className="rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        <span className={tone}>{title}</span> ({items.length})
      </summary>
      <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs">
        {items.slice(0, 300).map((i) => (
          <li key={`${i.type}/${i.name}`} className="truncate">
            <span className="font-mono text-slate-500">{i.type}</span> · {i.name}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function ExpertShell() {
  const { index } = useSchema();
  const schemaVersion = useSchemaStore((s) => s.version);
  const doc = useDocumentStore((s) => s.doc);
  const fileName = useDocumentStore((s) => s.fileName);
  const type = useUiStore((s) => s.expertType);
  const name = useUiStore((s) => s.expertName);
  const toast = useUiStore((s) => s.toast);
  const view = useExpertStore((s) => s.view);
  const setView = useExpertStore((s) => s.setView);
  const pendingNav = useExpertStore((s) => s.pendingNav);
  const issuesOpen = useExpertStore((s) => s.issuesOpen);
  const validation = useValidation(300);
  const [importing, setImporting] = useState<{ doc: EpJsonDocument; fileName: string; diff: DocumentDiff; errors: number } | undefined>();
  const [newOpen, setNewOpen] = useState(false);

  const back = () => useExpertStore.getState().navigate(name ? type : undefined, undefined);

  const replaceDocument = (next: EpJsonDocument, nextName: string, uploaded = true) => {
    if (uploaded) useDocumentStore.getState().openUpload(next, nextName);
    else {
      useDocumentStore.getState().reset(next, nextName);
      useDocumentStore.setState((s) => ({ origin: { kind: 'generated' }, revision: s.revision + 1 }));
    }
    useWizardStore.getState().unlink();
    useUiStore.getState().selectObject(undefined, undefined);
    useExpertStore.getState().setDirty(false);
  };

  const openFile = async () => {
    const file = await pickFile('.epJSON,.epjson,.json,application/json');
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readTextFile(file));
    } catch {
      toast('O arquivo não é um JSON válido.', 'error');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      toast('Um arquivo epJSON precisa ser um objeto JSON.', 'error');
      return;
    }
    const next = parsed as EpJsonDocument;
    const version = Object.values(next.Version ?? {})[0]?.version_identifier;
    if (version !== undefined && String(version) !== schemaVersion) {
      toast(`Arquivo da versão ${version}; o schema carregado é ${schemaVersion}. Pode haver campos incompatíveis.`, 'info');
    }
    const diff = diffDocuments(doc, next);
    const errors = useSchemaStore.getState().validator!.validate(next).filter((i) => i.severity === 'error').length;
    if (countObjects(doc) === 0) replaceDocument(next, file.name, true);
    else setImporting({ doc: next, fileName: file.name, diff, errors });
  };

  const uploadSchema = async () => {
    const file = await pickFile('.epJSON,.json');
    if (!file) return;
    try {
      await useSchemaStore.getState().loadCustom(file);
      toast(`Schema ${useSchemaStore.getState().version} carregado de ${file.name}.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  // Which panel is visible on small screens.
  const mobilePanel = view === 'fileJson' ? 'editor' : name ? 'editor' : type ? 'list' : 'types';
  // Medium screens: type sidebar + one of (list | editor).
  const mdPanel = view === 'fileJson' || name ? 'editor' : 'list';

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2">
        <Button size="sm" variant="ghost" icon={<FilePlus2 size={15} />} onClick={() => setNewOpen(true)}>
          Novo
        </Button>
        <Button size="sm" variant="ghost" icon={<FolderOpen size={15} />} onClick={() => void openFile()}>
          Abrir
        </Button>
        <Button size="sm" variant="ghost" icon={<Save size={15} />} onClick={() => exportCurrentDocument()}>
          Salvar
        </Button>
        <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
        <Button size="sm" variant={view === 'fileJson' ? 'subtle' : 'ghost'} icon={<Braces size={15} />} onClick={() => setView(view === 'fileJson' ? 'form' : 'fileJson')}>
          JSON do arquivo
        </Button>
        <button
          type="button"
          onClick={() => useExpertStore.getState().setIssuesOpen(!issuesOpen)}
          className={clsx(
            'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium',
            validation.errors ? 'bg-red-50 text-red-700 hover:bg-red-100' : validation.warnings ? 'bg-amber-50 text-amber-800 hover:bg-amber-100' : 'bg-brand-50 text-brand-700 hover:bg-brand-100',
          )}
        >
          {validation.pending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : validation.errors ? (
            <CircleAlert size={14} />
          ) : validation.warnings ? (
            <TriangleAlert size={14} />
          ) : (
            <CheckCircle2 size={14} />
          )}
          {validation.errors} erro(s) · {validation.warnings} aviso(s)
        </button>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span className="hidden truncate md:inline" title={fileName}>
            {fileName} · {countObjects(doc)} objetos
          </span>
          <button type="button" onClick={() => void uploadSchema()} className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 hover:bg-slate-200" title="Carregar outro Energy+.schema.epJSON">
            <Database size={13} /> Schema {schemaVersion}
          </button>
        </div>
      </div>

      {/* Panels */}
      <div className="relative flex min-h-0 flex-1">
        <aside className={clsx('w-full shrink-0 border-r border-slate-200 bg-white md:block md:w-60 lg:w-64 xl:w-72', mobilePanel === 'types' ? 'block' : 'hidden')}>
          <TypeSidebar validation={validation} />
        </aside>
        {view !== 'fileJson' && (
          <section className={clsx('w-full shrink-0 border-r border-slate-200 bg-white md:w-auto md:flex-1 lg:block lg:w-60 lg:flex-none xl:w-72', mobilePanel === 'list' ? 'block' : 'hidden', mdPanel === 'list' ? 'md:block' : 'md:hidden')}>
            {type ? (
              <InstanceList type={type} validation={validation} onBack={back} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500">
                <MousePointerClick size={28} className="text-slate-300" />
                Escolha um tipo de objeto à esquerda.
              </div>
            )}
          </section>
        )}
        <main className={clsx('min-w-0 flex-1 bg-white lg:block', mobilePanel === 'editor' ? 'block' : 'hidden', mdPanel === 'editor' ? 'md:block' : 'md:hidden')}>
          {view === 'fileJson' ? (
            <FileJsonView validation={validation} />
          ) : type && name && doc[type]?.[name] ? (
            <ObjectEditor key={`${type}/${name}`} type={type} name={name} validation={validation} onBack={back} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <Braces size={26} />
              </div>
              <p className="max-w-sm text-sm text-slate-600">
                Selecione um objeto para editar seus campos. O formulário é gerado a partir do schema oficial do EnergyPlus {index.version}, com todos os {index.typeNames.length} tipos.
              </p>
              <Button size="sm" variant="ghost" icon={<Sparkles size={14} />} onClick={() => useUiStore.getState().setMode('basic')}>
                Voltar ao assistente
              </Button>
            </div>
          )}
        </main>
        <ValidationPanel validation={validation} />
      </div>

      {/* Unsaved-changes guard */}
      <Dialog
        open={!!pendingNav}
        onClose={() => useExpertStore.getState().cancelNav()}
        title="Descartar alterações não salvas?"
        icon={<TriangleAlert size={18} />}
        footer={
          <>
            <Button onClick={() => useExpertStore.getState().cancelNav()}>Continuar editando</Button>
            <Button variant="danger" onClick={() => useExpertStore.getState().confirmNav()}>
              Descartar
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">O objeto aberto tem mudanças que ainda não foram salvas.</p>
      </Dialog>

      {/* New file */}
      <Dialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Novo arquivo"
        icon={<FilePlus2 size={18} />}
        footer={
          <>
            <Button onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button
              icon={<Sparkles size={15} />}
              onClick={() => {
                useWizardStore.getState().startFresh();
                useUiStore.setState({ mode: 'basic', wizardStep: 'project', visitedSteps: ['project'] });
                setNewOpen(false);
              }}
            >
              Usar o assistente
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                replaceDocument(
                  {
                    Version: { [placeholderName('Version')]: { version_identifier: index.version } },
                    Building: { Edifício: {} },
                    GlobalGeometryRules: { [placeholderName('GlobalGeometryRules')]: { starting_vertex_position: 'UpperLeftCorner', vertex_entry_direction: 'Counterclockwise', coordinate_system: 'Relative' } },
                  },
                  'modelo.epJSON',
                  false,
                );
                setNewOpen(false);
              }}
            >
              Arquivo em branco
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          O arquivo em branco começa só com os objetos obrigatórios (<code>Version</code>, <code>Building</code>, <code>GlobalGeometryRules</code>). O documento atual será substituído. Baixe o arquivo antes, se quiser guardá-lo.
        </p>
      </Dialog>

      {/* Import diff */}
      <Dialog
        open={!!importing}
        onClose={() => setImporting(undefined)}
        size="lg"
        title={`Abrir ${importing?.fileName ?? ''}?`}
        icon={<FolderOpen size={18} />}
        footer={
          <>
            <Button onClick={() => setImporting(undefined)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (importing) replaceDocument(importing.doc, importing.fileName, true);
                toast(`${importing?.fileName} aberto.`);
                setImporting(undefined);
              }}
            >
              Substituir documento atual
            </Button>
          </>
        }
      >
        {importing && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Comparação entre o documento atual e o arquivo escolhido:</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ['Novos', importing.diff.added.length, 'text-brand-700'],
                ['Removidos', importing.diff.removed.length, 'text-red-600'],
                ['Alterados', importing.diff.changed.length, 'text-amber-700'],
                ['Iguais', importing.diff.unchanged, 'text-slate-600'],
              ].map(([label, n, tone]) => (
                <div key={label as string} className="rounded-xl bg-slate-50 p-2">
                  <p className={clsx('text-xl font-semibold tabular-nums', tone as string)}>{n}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
            <DiffList title="Novos" items={importing.diff.added} tone="text-brand-700" />
            <DiffList title="Removidos" items={importing.diff.removed} tone="text-red-600" />
            <DiffList title="Alterados" items={importing.diff.changed} tone="text-amber-700" />
            {importing.errors > 0 && (
              <Callout tone="warning" icon={<TriangleAlert size={16} />}>
                O arquivo tem {importing.errors} erro(s) de validação. Você poderá corrigi-los depois de abrir.
              </Callout>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
