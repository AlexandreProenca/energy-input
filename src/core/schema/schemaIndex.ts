import type { RawObjectType, RawSchema } from './rawTypes';
import { toFieldSpec, type FieldSpec } from './fieldSpec';
import { detectSchemaVersion } from './slim';

export interface ObjectTypeInfo {
  type: string;
  group: string;
  memo?: string;
  /** Only one instance allowed (maxProperties: 1). */
  unique: boolean;
  /** Required at the top level of every epJSON file. */
  requiredInFile: boolean;
  /** Type has a meaningful name (otherwise the key is a placeholder). */
  hasName: boolean;
  nameRequired: boolean;
  /** Reference lists this object's name belongs to. */
  nameReferences: string[];
  /** Class-reference lists this object *type* belongs to. */
  classReferences: string[];
  fields: FieldSpec[];
  format?: string;
}

/** Something that contributes names to a reference list. */
export interface ReferenceProvider {
  type: string;
  /** undefined → the object name; otherwise the value of this field. */
  field?: string;
}

/**
 * Pre-digested, read-only view of a loaded schema. Built once per schema.
 * Field specs are built lazily because most of the 858 types are never opened.
 */
export class SchemaIndex {
  readonly version: string;
  readonly typeNames: string[];
  readonly groups: { name: string; types: string[] }[];
  private readonly raw: RawSchema;
  private readonly infoCache = new Map<string, ObjectTypeInfo>();
  private readonly providers = new Map<string, ReferenceProvider[]>();
  private readonly classProviders = new Map<string, string[]>();
  private readonly classLists = new Set<string>();

  constructor(raw: RawSchema) {
    this.raw = raw;
    this.version = raw.epjson_app_meta?.version ?? detectSchemaVersion(raw);
    this.typeNames = Object.keys(raw.properties);

    const groupMap = new Map<string, string[]>();
    for (const [type, def] of Object.entries(raw.properties)) {
      const list = groupMap.get(def.group) ?? [];
      list.push(type);
      groupMap.set(def.group, list);

      for (const ref of def.name?.reference ?? []) this.addProvider(ref, { type });
      for (const cls of def.name?.['reference-class-name'] ?? []) {
        this.classLists.add(cls);
        const l = this.classProviders.get(cls) ?? [];
        l.push(type);
        this.classProviders.set(cls, l);
      }
      const props = instanceSchema(def).properties ?? {};
      for (const [field, f] of Object.entries(props)) {
        for (const ref of f.reference ?? []) this.addProvider(ref, { type, field });
      }
    }
    this.groups = [...groupMap.entries()].map(([name, types]) => ({ name, types }));
  }

  private addProvider(list: string, p: ReferenceProvider) {
    const arr = this.providers.get(list) ?? [];
    arr.push(p);
    this.providers.set(list, arr);
  }

  get rawSchema(): RawSchema {
    return this.raw;
  }

  has(type: string): boolean {
    return type in this.raw.properties;
  }

  rawType(type: string): RawObjectType | undefined {
    return this.raw.properties[type];
  }

  info(type: string): ObjectTypeInfo | undefined {
    const cached = this.infoCache.get(type);
    if (cached) return cached;
    const def = this.raw.properties[type];
    if (!def) return undefined;

    const inst = instanceSchema(def);
    const props = inst.properties ?? {};
    const required = new Set(inst.required ?? []);
    const order = def.field_order ?? def.legacy_idd?.fields.filter((f) => f !== 'name') ?? [];
    const labels = def.field_labels ?? Object.fromEntries(
      Object.entries(def.legacy_idd?.field_info ?? {}).map(([k, v]) => [k, v.field_name]),
    );
    const keys = [...order.filter((k) => k in props), ...Object.keys(props).filter((k) => !order.includes(k))];

    const info: ObjectTypeInfo = {
      type,
      group: def.group,
      memo: def.memo,
      unique: def.maxProperties === 1,
      requiredInFile: this.raw.required.includes(type),
      hasName: !!def.name,
      nameRequired: !!def.name?.is_required,
      nameReferences: def.name?.reference ?? [],
      classReferences: def.name?.['reference-class-name'] ?? [],
      format: def.format,
      fields: keys.map((k) =>
        toFieldSpec(k, props[k], {
          required: required.has(k),
          label: labels[k],
          classLists: this.classLists,
          format: def.format,
        }),
      ),
    };
    this.infoCache.set(type, info);
    return info;
  }

  /** Types/fields whose names populate the given reference list. */
  providersOf(list: string): ReferenceProvider[] {
    return this.providers.get(list) ?? [];
  }

  /** Object type names belonging to a class-reference list. */
  classMembersOf(list: string): string[] {
    return this.classProviders.get(list) ?? [];
  }

  isClassList(list: string): boolean {
    return this.classLists.has(list);
  }
}

export function instanceSchema(def: RawObjectType) {
  return Object.values(def.patternProperties)[0];
}
