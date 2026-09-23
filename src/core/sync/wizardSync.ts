import type { EpJsonDocument, ObjectRef } from '../epjson/types';
import { stableStringify } from '../epjson/document';

/** Hash of each object last written by the wizard, keyed by `type|name` (see ownKey). */
export type OwnershipMap = Record<string, string>;

export type ConflictResolution = 'keep' | 'overwrite';

export interface SyncPlan {
  next: EpJsonDocument;
  owned: OwnershipMap;
  /** Objects the user edited (or created) that the wizard wants to change. */
  conflicts: ObjectRef[];
  /** Wizard objects no longer generated but kept because the user edited them. */
  orphaned: ObjectRef[];
  /**
   * Wizard objects no longer generated but kept because something that stays still
   * references them — directly or through another retained object. They remain owned by
   * the wizard, so they leave on a later sync once nothing points at them.
   */
  retained: ObjectRef[];
}

// Object type names never contain "||", so splitting on its first occurrence is safe.
const SEP = '||';
export const ownKey = (type: string, name: string) => `${type}${SEP}${name}`;
const splitKey = (key: string): ObjectRef => {
  const i = key.indexOf(SEP);
  return { type: key.slice(0, i), name: key.slice(i + SEP.length) };
};

/**
 * Every string value inside an object, upper-cased — the names it may reference.
 *
 * Schema-agnostic on purpose: epJSON references are plain strings in ordinary fields and
 * in extensible arrays (`vertices`, `equipment`, …). A coincidental match (an enum value
 * equal to an object name) only keeps an object that could have gone, which is harmless;
 * a missed reference leaves a dangling one, which EnergyPlus rejects as fatal. Upper-cased
 * because EnergyPlus compares names case-insensitively.
 */
function collectStrings(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    if (value.trim()) out.add(value.toUpperCase());
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
  } else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
}

/** FNV-1a over the canonical JSON — compact enough for localStorage. */
export function hashObject(value: unknown): string {
  const s = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

/**
 * Applies a freshly generated wizard document onto the current document
 * without clobbering manual edits:
 *  - objects the wizard owns and the user did not touch are replaced/removed — except
 *    that a removal never leaves a dangling reference: a stale wizard object that anything
 *    staying still points at is kept (see `retained`);
 *  - objects the user edited (hash differs from what the wizard last wrote), or
 *    created with a name the wizard now wants, are conflicts, resolved by
 *    `resolution`;
 *  - objects the wizard never owned are left alone.
 */
export function planWizardSync(
  current: EpJsonDocument,
  generated: EpJsonDocument,
  owned: OwnershipMap,
  resolution: ConflictResolution,
): SyncPlan {
  const next: EpJsonDocument = {};
  for (const [t, inst] of Object.entries(current)) next[t] = { ...inst };
  const newOwned: OwnershipMap = {};
  const conflicts: ObjectRef[] = [];
  const orphaned: ObjectRef[] = [];

  const generatedKeys = new Set<string>();
  for (const [type, inst] of Object.entries(generated)) {
    for (const name of Object.keys(inst)) generatedKeys.add(ownKey(type, name));
  }

  for (const [type, inst] of Object.entries(generated)) {
    for (const [name, data] of Object.entries(inst)) {
      const key = ownKey(type, name);
      const cur = current[type]?.[name];
      const genHash = hashObject(data);
      const curHash = cur ? hashObject(cur) : undefined;
      const userTouched = cur !== undefined && curHash !== genHash && owned[key] !== curHash;

      // The wizard's own output for this object did not change: silently keep the user's edit.
      if (userTouched && owned[key] === genHash) {
        newOwned[key] = owned[key];
        continue;
      }
      if (userTouched) {
        conflicts.push({ type, name });
        if (resolution === 'keep') {
          if (owned[key] !== undefined) newOwned[key] = owned[key];
          continue;
        }
      }
      next[type] = next[type] ?? {};
      next[type][name] = data;
      newOwned[key] = genHash;
    }
  }

  // Wizard objects that are no longer generated leave — unless the user edited them
  // (orphaned) or something that stays still references them (retained). Done after the
  // generated objects are applied, so their references count too.
  const stale = new Map<string, { type: string; name: string; hash: string }>();
  for (const [key, hash] of Object.entries(owned)) {
    if (generatedKeys.has(key)) continue;
    const { type, name } = splitKey(key);
    const cur = next[type]?.[name];
    if (!cur) continue;
    if (hashObject(cur) === hash) stale.set(key, { type, name, hash });
    else orphaned.push({ type, name });
  }

  // References from everything that stays. A stale object pointed at by another stale
  // object does not count — otherwise a construction and its material would keep each
  // other alive forever.
  const referenced = new Set<string>();
  for (const [type, inst] of Object.entries(next)) {
    for (const [name, data] of Object.entries(inst)) {
      if (!stale.has(ownKey(type, name))) collectStrings(data, referenced);
    }
  }

  // Fixed point: keeping an object makes what *it* references stay as well — the
  // construction a user window points at keeps its glazing material.
  const retained: ObjectRef[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (const [key, s] of stale) {
      if (!referenced.has(s.name.toUpperCase())) continue;
      stale.delete(key);
      retained.push({ type: s.type, name: s.name });
      newOwned[key] = s.hash;
      collectStrings(next[s.type][s.name], referenced);
      changed = true;
    }
  }

  for (const { type, name } of stale.values()) {
    delete next[type][name];
    if (Object.keys(next[type]).length === 0) delete next[type];
  }
  return { next, owned: newOwned, conflicts, orphaned, retained };
}
