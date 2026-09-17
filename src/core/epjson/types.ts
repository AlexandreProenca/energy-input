/** Field data of a single epJSON object instance. */
export type EpObject = Record<string, unknown>;

/** Instances of one object type, keyed by object name. */
export type EpInstances = Record<string, EpObject>;

/** A whole epJSON document: object type → name → fields. */
export type EpJsonDocument = Record<string, EpInstances>;

/** A partial document produced by a generator; merged into a document. */
export type EpJsonFragment = EpJsonDocument;

export interface ObjectRef {
  type: string;
  name: string;
}
