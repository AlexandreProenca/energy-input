import { create } from 'zustand';
import type { RawSchema } from '@/core/schema/rawTypes';
import { SchemaIndex } from '@/core/schema/schemaIndex';
import { looksLikeEpJsonSchema, slimSchema } from '@/core/schema/slim';
import { EpJsonValidator } from '@/core/validation/validate';

interface SchemaState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  version?: string;
  source?: string;
  available: string[];
  index?: SchemaIndex;
  validator?: EpJsonValidator;
  load: (version?: string) => Promise<void>;
  loadCustom: (file: File) => Promise<void>;
}

function activate(schema: RawSchema) {
  const index = new SchemaIndex(schema);
  return { index, validator: new EpJsonValidator(schema), version: index.version, source: schema.epjson_app_meta?.source };
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  status: 'idle',
  available: [],
  async load(version) {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: undefined });
    try {
      const base = import.meta.env.BASE_URL;
      const manifest = (await (await fetch(`${base}schema/manifest.json`)).json()) as { default: string; versions: string[] };
      const v = version ?? manifest.default;
      const res = await fetch(`${base}schema/${v}/schema.json`);
      if (!res.ok) throw new Error(`Não foi possível baixar o schema ${v} (HTTP ${res.status}).`);
      const schema = (await res.json()) as RawSchema;
      set({ status: 'ready', available: manifest.versions, ...activate(schema) });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
  async loadCustom(file) {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('O arquivo não é um JSON válido.');
    }
    if (!looksLikeEpJsonSchema(parsed)) throw new Error('Este arquivo não parece ser um Energy+.schema.epJSON.');
    const schema = (parsed as RawSchema).epjson_app_meta ? (parsed as RawSchema) : slimSchema(parsed as RawSchema, file.name);
    set({ status: 'ready', ...activate(schema) });
  },
}));

export function useSchema() {
  const index = useSchemaStore((s) => s.index);
  const validator = useSchemaStore((s) => s.validator);
  if (!index || !validator) throw new Error('Schema ainda não carregado');
  return { index, validator };
}
