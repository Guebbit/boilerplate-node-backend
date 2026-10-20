/**
 * @module
 * The index names a schema has given up. `db:sync` only ever ADDS indexes, so a name nobody
 * declares any more would stay forever; declaring it here, next to the schema, is how the sync
 * learns it is safe to drop. See `docs/tools/mongodb-mongoose.md`.
 */

/**
 * Retired names per schema. Keyed by the schema object itself, so a module declares them in its
 * own `model.ts` with no extra field on the model type and no cast on the reading side.
 */
const retired = new WeakMap<object, readonly string[]>();

/**
 * Mark index names as given up by a schema, so `db:sync` drops them where they still exist.
 *
 * @param schema - the schema that used to declare them (called once, in the module's `model.ts`)
 * @param names - the stored index names, as `db.collection.getIndexes()` prints them
 * @returns the same schema, so it chains at the end of a schema definition
 */
export const retireIndexes = <T extends object>(schema: T, ...names: string[]): T => {
    retired.set(schema, [...(retired.get(schema) ?? []), ...names]);
    return schema;
};

/**
 * The index names a schema has given up.
 *
 * @param schema - the schema to read
 * @returns the retired names, empty when the schema retired none
 */
export const retiredIndexesOf = (schema: object): readonly string[] => retired.get(schema) ?? [];
