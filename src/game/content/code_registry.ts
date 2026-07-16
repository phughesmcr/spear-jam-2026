/**
 * ECS components store numbers, so every content domain needs a stable mapping between its string
 * ids and small numeric codes. `createCodeRegistry` builds that mapping once from a single ordered
 * list of ids: each id owns the code of its 1-based position, so codes stay stable as long as ids
 * are only appended. This replaces the hand-rolled, per-domain "two parallel records kept in sync by
 * hand" pattern and gives every domain the same validation and consistent error messages.
 */
export type CodeRegistry<T extends string> = {
  /** The registered ids in code order; index `i` owns code `i + 1`. */
  readonly ids: readonly T[];
  /** Type guard: is `value` one of the registered ids? */
  has(value: string): value is T;
  /** Encode an id to its stable numeric code. Throws if the id is not registered. */
  encode(id: T): number;
  /** Decode a numeric code back to its id. Throws if the code is not registered. */
  decode(code: number): T;
  /** Narrow an untrusted string to a registered id, or throw a `context`-prefixed error. */
  assert(value: string, context: string): T;
};

export function createCodeRegistry<T extends string>(label: string, ids: readonly T[]): CodeRegistry<T> {
  const snapshot = Object.freeze([...ids]);
  const codeById = new Map<T, number>(snapshot.map((id, index) => [id, index + 1]));
  return {
    ids: snapshot,
    has(value: string): value is T {
      return codeById.has(value as T);
    },
    encode(id: T): number {
      const code = codeById.get(id);
      if (code === undefined) throw new Error(`Unknown ${label} "${id}".`);
      return code;
    },
    decode(code: number): T {
      const id = snapshot[code - 1];
      if (id === undefined) throw new Error(`Unknown ${label} code: ${code}`);
      return id;
    },
    assert(value: string, context: string): T {
      if (codeById.has(value as T)) return value as T;
      throw new Error(`${context}: Unknown ${label} "${value}".`);
    },
  };
}
