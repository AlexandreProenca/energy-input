import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Layers, Plus, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { EpJsonDocument } from '@/core/epjson/types';
import { findReferences, setObject } from '@/core/epjson/document';
import { constructionLayers, editConstruction, findMaterial, isGlazingConstruction, materialWithThickness, setSurfaceConstruction, type EditScope } from '@/core/geometry/edits';
import { readGeometryModel, type SurfaceCategory } from '@/core/geometry/model';
import { summarizeConstruction } from '@/core/geometry/thermal';
import { importLibraryConstruction, importLibraryMaterial, libraryConstructions, type LibraryUse } from '@/generators/library';
import { templates } from '@/templates';
import { useDocumentStore } from '@/store/documentStore';
import { useSchema } from '@/store/schemaStore';
import { useUiStore } from '@/store/uiStore';
import { Badge, Callout, IconButton, fmt } from '@/ui/primitives';
import { NumberInput } from '@/ui/NumberInput';

const HASH_COLORS = ['#d9cfc1', '#c8734a', '#a7a9ac', '#e9d27a', '#b9c7d6', '#c89b63', '#9fc5a8', '#d4a5a5'];

/** Illustration color for a document material, borrowed from the template it came from when possible. */
export function layerColor(doc: EpJsonDocument, name: string): string {
  const tpl = Object.values(templates.materials).find((m) => name.startsWith(m.label));
  if (tpl) return tpl.color;
  const kind = findMaterial(doc, name).kind;
  if (kind === 'Material:AirGap') return '#eaf4fb';
  if (kind === 'Material:NoMass') return '#cbd5e1';
  if (kind === 'Window') return '#bfe1f5';
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HASH_COLORS[h % HASH_COLORS.length];
}

function SectionStrip({ doc, layers }: { doc: EpJsonDocument; layers: ReturnType<typeof summarizeConstruction>['layers'] }) {
  const widths = layers.map((l) => Math.max(0.012, l.thickness || (l.kind === 'Material:AirGap' ? 0.04 : 0.012)));
  const total = widths.reduce((a, b) => a + b, 0);
  return (
    <div className="flex h-14 overflow-hidden rounded-lg border border-slate-200" aria-hidden>
      <span className="flex w-6 items-center justify-center bg-sky-50 text-[9px] text-slate-400 [writing-mode:vertical-rl]">ext.</span>
      {layers.map((l, i) => (
        <div key={i} title={l.name} className="border-r border-white/70" style={{ width: `${(widths[i] / total) * 100}%`, background: layerColor(doc, l.name) }} />
      ))}
      <span className="flex w-6 items-center justify-center bg-amber-50 text-[9px] text-slate-400 [writing-mode:vertical-rl]">int.</span>
    </div>
  );
}

export function ConstructionSection({
  element,
  construction,
  use,
  category,
  interzone,
  onConstructionChange,
}: {
  element: string;
  construction?: string;
  use: LibraryUse;
  category: SurfaceCategory | 'Opening';
  interzone?: boolean;
  /** Called after the element starts using another construction name. */
  onConstructionChange?: (name: string) => void;
}) {
  const { index } = useSchema();
  const doc = useDocumentStore((s) => s.doc);
  const commit = useDocumentStore((s) => s.commit);
  const toast = useUiStore((s) => s.toast);
  const [scopeChoice, setScopeChoice] = useState<'only' | 'all'>('only');

  const glazingUse = use === 'window';
  const existing = useMemo(
    () => Object.keys(doc.Construction ?? {}).filter((c) => isGlazingConstruction(doc, c) === glazingUse).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [doc, glazingUse],
  );
  const library = useMemo(() => {
    const available = libraryConstructions(templates).filter((c) => (glazingUse ? c.use === 'window' : c.use !== 'window') && !doc.Construction?.[c.name]);
    // Matching use first; doors are only offered for doors.
    return {
      matching: available.filter((c) => c.use === use),
      others: available.filter((c) => c.use !== use && (use === 'door' || c.use !== 'door')),
    };
  }, [doc, glazingUse, use]);

  const layers = construction ? constructionLayers(doc, construction) : [];
  const summary = useMemo(() => summarizeConstruction(doc, layers, category, interzone), [doc, layers, category, interzone]);
  const users = useMemo(() => (construction ? findReferences(doc, index, 'Construction', construction).filter((r) => r.field === 'construction_name') : []), [doc, index, construction]);
  const shared = users.length > 1;
  const scope: EditScope = shared && scopeChoice === 'only' ? { mode: 'only', element } : { mode: 'all' };

  const assign = (value: string) => {
    let next = doc;
    let name = value.slice(4);
    if (value.startsWith('lib:')) {
      const r = importLibraryConstruction(doc, templates, name);
      next = r.doc;
      name = r.name;
    }
    next = setSurfaceConstruction(next, readGeometryModel(next), element, name);
    commit(next, 'Trocar construção');
    onConstructionChange?.(name);
    toast(`“${element}” agora usa “${name}”.`);
  };

  const applyLayers = (newLayers: string[], base: EpJsonDocument = doc) => {
    if (!construction) return;
    try {
      const r = editConstruction(base, construction, newLayers, scope);
      commit(r.doc, 'Editar camadas');
      if (r.construction !== construction) {
        onConstructionChange?.(r.construction);
        toast(`Criada a construção “${r.construction}” só para este elemento.`, 'info');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const materialOptions = useMemo(() => {
    const docMats = ['Material', 'Material:NoMass', 'Material:AirGap'].flatMap((t) => Object.keys(doc[t] ?? {}));
    return { docMats: docMats.sort((a, b) => a.localeCompare(b, 'pt-BR')), lib: Object.entries(templates.materials) };
  }, [doc]);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor={`cons-${element}`}>
          {glazingUse ? 'Vidro (construção)' : 'Construção'}
        </label>
        <select id={`cons-${element}`} className="input" value={construction ? `doc:${construction}` : ''} onChange={(e) => e.target.value && assign(e.target.value)}>
          {!construction && <option value="">— sem construção —</option>}
          {construction && !existing.includes(construction) && <option value={`doc:${construction}`}>{construction} (tipo incompatível?)</option>}
          <optgroup label="No arquivo">
            {existing.map((c) => (
              <option key={c} value={`doc:${c}`}>
                {c}
              </option>
            ))}
          </optgroup>
          {library.matching.length > 0 && (
            <optgroup label="Biblioteca — recomendadas (serão adicionadas ao arquivo)">
              {library.matching.map((c) => (
                <option key={c.id} value={`lib:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          {library.others.length > 0 && (
            <optgroup label="Biblioteca — outras">
              {library.others.map((c) => (
                <option key={c.id} value={`lib:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {construction && (
          <p className="mt-1 text-xs text-slate-500">
            Usada por {users.length} elemento(s){shared ? '' : ' — só este'}.
          </p>
        )}
      </div>

      {construction && summary.glazing && (
        <GlazingEditor doc={doc} material={layers[0]} users={users.length} />
      )}

      {construction && !summary.glazing && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Layers size={15} className="text-brand-600" />
            <span className="text-sm font-semibold text-slate-800">Camadas</span>
            <Badge tone="slate">Espessura {fmt(summary.thickness * 100, 1)} cm</Badge>
            {summary.uValue !== undefined && <Badge tone="slate">U {fmt(summary.uValue, 2)} W/m²K</Badge>}
            {summary.capacity > 0 && <Badge tone="slate">CT {summary.capacity} kJ/m²K</Badge>}
          </div>
          <SectionStrip doc={doc} layers={summary.layers} />

          {shared && (
            <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900" role="radiogroup" aria-label="Alcance da edição">
              <p className="mb-1 font-medium">Esta construção é usada por {users.length} elementos. Ao editar camadas:</p>
              <label className="flex items-center gap-2">
                <input type="radio" className="accent-brand-600" checked={scopeChoice === 'only'} onChange={() => setScopeChoice('only')} />
                alterar só “{element}” (cria uma cópia)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" className="accent-brand-600" checked={scopeChoice === 'all'} onChange={() => setScopeChoice('all')} />
                alterar todos os {users.length} elementos
              </label>
            </div>
          )}

          <ol className="space-y-2">
            {summary.layers.map((l, i) => (
              <li key={`${i}-${l.name}`} className="rounded-lg bg-slate-50 p-2">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 shrink-0 rounded border border-slate-300" style={{ background: layerColor(doc, l.name) }} />
                  <span className="text-[11px] font-semibold uppercase text-slate-400">{i === 0 ? 'externa' : i === summary.layers.length - 1 ? 'interna' : `${i + 1}ª`}</span>
                  <div className="ml-auto flex">
                    <IconButton label="Mover para fora" className="h-7 w-7" disabled={i === 0} onClick={() => applyLayers(swap(layers, i, i - 1))}>
                      <ArrowUp size={13} />
                    </IconButton>
                    <IconButton label="Mover para dentro" className="h-7 w-7" disabled={i === layers.length - 1} onClick={() => applyLayers(swap(layers, i, i + 1))}>
                      <ArrowDown size={13} />
                    </IconButton>
                    <IconButton label="Remover camada" className="h-7 w-7 hover:text-red-600" disabled={layers.length === 1} onClick={() => applyLayers(layers.filter((_, j) => j !== i))}>
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </div>
                <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                  <select
                    aria-label={`Material da camada ${i + 1}`}
                    className={clsx('input h-9 px-2 text-xs', l.missing && 'input-error')}
                    value={`doc:${l.name}`}
                    onChange={(e) => {
                      const v = e.target.value;
                      let base = doc;
                      let name = v.slice(4);
                      if (v.startsWith('lib:')) {
                        const r = importLibraryMaterial(doc, templates, name);
                        base = r.doc;
                        name = r.name;
                      }
                      applyLayers(layers.map((x, j) => (j === i ? name : x)), base);
                    }}
                  >
                    {l.missing && <option value={`doc:${l.name}`}>{l.name} (não encontrado)</option>}
                    <optgroup label="No arquivo">
                      {materialOptions.docMats.map((m) => (
                        <option key={m} value={`doc:${m}`}>
                          {m}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Biblioteca">
                      {materialOptions.lib.map(([id, m]) => (
                        <option key={id} value={`lib:${id}`}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  {l.kind === 'Material' ? (
                    <NumberInput
                      aria-label={`Espessura da camada ${i + 1}`}
                      className="h-9 text-xs"
                      unit="cm"
                      commitOnBlur
                      min={0.1}
                      max={300}
                      value={Math.round(l.thickness * 1000) / 10}
                      onValue={(cm) => {
                        if (cm === undefined || Math.abs(cm / 100 - l.thickness) < 1e-6) return;
                        try {
                          const r = materialWithThickness(doc, l.name, cm / 100);
                          applyLayers(layers.map((x, j) => (j === i ? r.name : x)), r.doc);
                        } catch (e) {
                          toast(e instanceof Error ? e.message : String(e), 'error');
                        }
                      }}
                    />
                  ) : (
                    <span className="flex items-center justify-end text-xs text-slate-500" title="Camada sem espessura física no EnergyPlus">
                      R {fmt(l.resistance, 2)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => {
              const r = importLibraryMaterial(doc, templates, 'eps', 0.03);
              applyLayers([...layers.slice(0, -1), r.name, ...layers.slice(-1)], r.doc);
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-700"
          >
            <Plus size={13} /> Adicionar camada (isolante EPS 3 cm, troque depois)
          </button>
          <p className="text-[11px] leading-relaxed text-slate-500">
            No EnergyPlus as superfícies são planos: a espessura muda a troca de calor, não o volume do ambiente. O 3D desenha a espessura para dentro da zona.
          </p>
        </div>
      )}
      {!construction && <Callout tone="warning">Escolha uma construção para este elemento.</Callout>}
    </div>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function GlazingEditor({ doc, material, users }: { doc: EpJsonDocument; material: string; users: number }) {
  const commit = useDocumentStore((s) => s.commit);
  const info = findMaterial(doc, material);
  if (info.type !== 'WindowMaterial:SimpleGlazingSystem' || !info.data) return null;
  const set = (field: string, v: number | undefined) => {
    if (v === undefined) return;
    commit(setObject(doc, info.type!, info.name, { ...info.data, [field]: v }), 'Editar vidro');
  };
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
      <p className="text-sm font-semibold text-slate-800">Propriedades do vidro “{info.name}”</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          ['u_factor', 'U (W/m²K)', 0.1, 7],
          ['solar_heat_gain_coefficient', 'Fator solar', 0.01, 0.99],
          ['visible_transmittance', 'Transm. luz', 0.01, 0.99],
        ].map(([field, label, min, max]) => (
          <label key={field as string} className="text-xs text-slate-600">
            {label as string}
            <NumberInput className="mt-1 h-9 text-xs" min={min as number} max={max as number} value={info.data![field as string] as number | undefined} onValue={(v) => set(field as string, v)} />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">Altera todas as {users} abertura(s) que usam este vidro. Para um vidro diferente só nesta janela, escolha outra construção acima.</p>
    </div>
  );
}
