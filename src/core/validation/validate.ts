import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import type { RawSchema } from '../schema/rawTypes';
import type { EpJsonDocument } from '../epjson/types';
import type { ValidationIssue } from './issues';

const EPLUS_FORMATS = ['singleLine', 'compactSchedule', 'Spectral', 'vertices', 'ViewFactor', 'FluidProperty'];

/**
 * Validates epJSON documents against the EnergyPlus JSON Schema.
 *
 * Compiling the full 858-type schema takes >1 s, so each object type's
 * sub-schema is compiled lazily the first time a document contains it and then
 * cached. The schema has no `$ref`s, so sub-schemas are self-contained.
 */
export class EpJsonValidator {
  private readonly ajv: Ajv;
  private readonly cache = new Map<string, ValidateFunction>();

  constructor(private readonly schema: RawSchema) {
    this.ajv = new Ajv({ strict: false, allErrors: true, validateSchema: false, allowUnionTypes: true });
    for (const f of EPLUS_FORMATS) this.ajv.addFormat(f, true);
  }

  private validatorFor(type: string): ValidateFunction | undefined {
    let fn = this.cache.get(type);
    if (!fn) {
      const def = this.schema.properties[type];
      if (!def) return undefined;
      // Strip keywords that are not JSON Schema before compiling.
      const { legacy_idd: _l, field_order: _o, field_labels: _f, name: _n, ...sub } = def;
      fn = this.ajv.compile(sub);
      this.cache.set(type, fn);
    }
    return fn;
  }

  validate(doc: EpJsonDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      return [{ severity: 'error', source: 'file', message: 'O arquivo precisa ser um objeto JSON.' }];
    }
    for (const req of this.schema.required) {
      if (!doc[req] || Object.keys(doc[req]).length === 0) {
        issues.push({ severity: 'error', source: 'file', objectType: req, message: `Objeto obrigatório ausente: ${req}` });
      }
    }
    for (const [type, instances] of Object.entries(doc)) {
      issues.push(...this.validateType(type, instances));
    }
    return issues;
  }

  validateType(type: string, instances: unknown): ValidationIssue[] {
    const fn = this.validatorFor(type);
    if (!fn) {
      return [{ severity: 'error', source: 'schema', objectType: type, message: `Tipo de objeto desconhecido nesta versão do EnergyPlus: "${type}"` }];
    }
    if (fn(instances)) return [];
    return translateErrors(type, fn.errors ?? []);
  }

  /** Validates a single instance (used by forms before saving). */
  validateInstance(type: string, name: string, data: unknown): ValidationIssue[] {
    return this.validateType(type, { [name]: data }).filter((i) => !i.objectName || i.objectName === name);
  }
}

function decodePointer(seg: string) {
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** Converts ajv errors into pt-BR issues, collapsing noisy anyOf branches. */
export function translateErrors(type: string, errors: ErrorObject[]): ValidationIssue[] {
  const anyOfPaths = new Set(errors.filter((e) => e.keyword === 'anyOf').map((e) => e.instancePath));
  const out = new Map<string, ValidationIssue>();

  for (const e of errors) {
    const parts = e.instancePath.split('/').slice(1).map(decodePointer);
    if (e.keyword !== 'anyOf' && anyOfPaths.has(e.instancePath)) continue;

    const issue: ValidationIssue = { severity: 'error', source: 'schema', objectType: type, message: '' };
    const [name, field, idx, itemField] = parts;
    if (name !== undefined) issue.objectName = name;
    if (field !== undefined) issue.field = field;
    if (idx !== undefined) issue.itemIndex = Number(idx);
    if (itemField !== undefined) issue.itemField = itemField;

    const p = e.params as Record<string, unknown>;
    switch (e.keyword) {
      case 'required': {
        const missing = String(p.missingProperty);
        if (issue.itemIndex !== undefined) issue.itemField = missing;
        else if (issue.objectName !== undefined) issue.field = missing;
        issue.message = `Campo obrigatório não preenchido: ${missing}`;
        break;
      }
      case 'enum':
        issue.message = `Valor inválido. Opções: ${(p.allowedValues as unknown[]).filter((v) => v !== '').join(', ')}`;
        break;
      case 'type':
        issue.message = p.type === 'number' || p.type === 'integer' ? `Deve ser um número${p.type === 'integer' ? ' inteiro' : ''}` : `Tipo inválido (esperado: ${p.type})`;
        break;
      case 'minimum':
      case 'maximum':
      case 'exclusiveMinimum':
      case 'exclusiveMaximum':
        issue.message = `Deve ser ${p.comparison} ${p.limit}`;
        break;
      case 'anyOf':
        issue.message = 'Valor inválido: informe um número ou a opção automática';
        break;
      case 'additionalProperties':
        issue.field = String(p.additionalProperty);
        issue.message = `Campo desconhecido: ${p.additionalProperty}`;
        break;
      case 'maxProperties':
        issue.message = `Só pode existir ${p.limit} objeto(s) do tipo ${type}`;
        break;
      case 'minProperties':
        issue.message = `É necessário ao menos ${p.limit} objeto(s) do tipo ${type}`;
        break;
      case 'pattern':
        issue.message = 'O nome do objeto não pode ser vazio';
        break;
      case 'minItems':
        issue.message = `A lista precisa ter ao menos ${p.limit} item(ns)`;
        break;
      case 'maxItems':
        issue.message = `A lista pode ter no máximo ${p.limit} item(ns)`;
        break;
      default:
        issue.message = e.message ?? 'Valor inválido';
    }
    // "additionalProperties" on the instance map means an empty/blank name.
    if (e.keyword === 'additionalProperties' && parts.length === 0) {
      issue.objectName = String(p.additionalProperty);
      issue.field = undefined;
      issue.message = 'Nome de objeto inválido (vazio ou só espaços)';
    }
    const key = [issue.objectName, issue.field, issue.itemIndex, issue.itemField, issue.message].join('|');
    out.set(key, issue);
  }
  return [...out.values()];
}
