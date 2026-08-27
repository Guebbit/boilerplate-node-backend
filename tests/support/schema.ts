/**
 * Reading a Mongoose schema's contract back out of the schema object.
 *
 * ── WHY A SCHEMA NEEDS ASSERTING AT ALL ─────────────────────────────────────────────────────────
 * A `model.ts` is a declaration, and the things it declares fail quietly and expensively:
 *
 *   - `required: true` dropped from a field — documents start persisting without it, and nothing
 *     errors until something downstream reads `undefined` from a row written weeks earlier;
 *   - `_id: false` lost on a subdocument — every embedded item silently grows an ObjectId, which
 *     changes what is stored, what is serialized, and how much;
 *   - an index deleted, renamed or given the wrong direction — the query still returns the right
 *     answer, just by collection scan, so it surfaces as a production latency incident rather
 *     than as a test failure;
 *   - `timestamps: true` removed — `createdAt` stops being written, and every "recent first" sort
 *     in the app quietly orders by nothing.
 *
 * Integration tests exercise these schemas heavily, but through documents: they assert what a
 * saved row LOOKS like, which is satisfied by any schema that happens to accept the fixture. None
 * of the four failures above changes the shape of a valid document, so none of them is visible
 * from that angle — which is why they survive as mutants.
 *
 * ── WHY IT NEEDS NO DATABASE ────────────────────────────────────────────────────────────────────
 * All of it is on the schema object already. `path()` carries `isRequired`, defaults and enums;
 * `indexes()` returns the declared index list as `[keys, options]` pairs before any of them is
 * built; `options` carries `timestamps` and `_id`. Reading it directly makes these unit tests, so
 * they run in milliseconds and belong with the module rather than in the integration tier.
 */
/**
 * ── WHY THESE TAKE A STRUCTURAL TYPE RATHER THAN `Schema` ───────────────────────────────────────
 * `Schema` carries eleven generic parameters, and a concretely-typed one — `new
 * Schema<ProductDocument, ProductModel, ProductMethods>` — is not assignable to a `Schema` written
 * with different arguments: TypeScript compares the inferred `obj` property structurally and walks
 * into `ObjectId`'s own members looking for an index signature. It is the same class of problem
 * that made `BaseRepository` a hand-written type (TS7056), reached from the other side.
 *
 * Introspection needs four members and no generics at all, so that is what these ask for. Any
 * Mongoose schema satisfies it, whatever it was parameterised with.
 */
export interface IntrospectableSchema {
    path(name: string): unknown;
    // Loose on purpose: Mongoose's own `indexes()` and `options` types are parameterised too, and
    // pinning them here would reintroduce exactly the assignability problem described above. The
    // narrowing happens once, inside each reader below, where the shape is actually known.
    indexes(): unknown[][];
    paths: object;
    options: object;
}

/** Minimal shape of what `Schema.prototype.path()` hands back, for the parts asserted here. */
interface SchemaPath {
    instance?: string;
    isRequired?: boolean;
    options?: { default?: unknown; ref?: string; enum?: unknown } & Record<string, unknown>;
    enumValues?: string[];
    schema?: IntrospectableSchema;
    defaultValue?: unknown;
}

/**
 * The name Mongo will hold an index under.
 *
 * An index declared with `schema.index(keys, { name })` states its own; one declared as
 * `unique: true` on a PATH states none, and Mongoose derives `field_direction`, joined by `_`, at
 * build time. Deriving the same name here rather than reporting it as unnamed keeps a test
 * asserting the name the database will actually use — which is the name a migration or a
 * `dropIndex` has to say, and the whole reason declared names are worth pinning.
 */
const indexName = (keys: Record<string, number | string>, options: unknown): string => {
    const declared = (options as { name?: string } | undefined)?.name;
    if (declared !== undefined) return declared;

    return Object.entries(keys)
        .map(([field, direction]) => `${field}_${String(direction)}`)
        .join('_');
};

/** Every declared path, including the ones Mongoose adds (`_id`, `__v`, timestamps). */
export const pathNames = (schema: IntrospectableSchema): string[] =>
    Object.keys(schema.paths).toSorted();

/** `indexes()` narrowed to the `[keys, options]` pairs Mongoose actually returns. */
const declaredIndexes = (
    schema: IntrospectableSchema
): [Record<string, number | string>, Record<string, unknown> | undefined][] =>
    schema.indexes() as [Record<string, number | string>, Record<string, unknown> | undefined][];

/**
 * The paths carrying `required: true`, sorted.
 *
 * Stated as a SET in tests rather than field by field: "these and no others" is the assertion that
 * fails when a `required` is added as well as when one is removed, and adding one is the change
 * that starts rejecting writes a client used to be allowed to make.
 */
export const requiredPaths = (schema: IntrospectableSchema): string[] =>
    pathNames(schema).filter((name) => (schema.path(name) as SchemaPath | undefined)?.isRequired);

/**
 * The declared indexes as `name: field±1, field±1`, sorted.
 *
 * The direction is kept because it is load-bearing on a compound index — `{ userId: 1, createdAt:
 * -1 }` serves "this user's orders, newest first" from the index, and the same index with
 * `createdAt: 1` makes that query sort in memory. The NAME is kept because it is what a migration
 * and a `dropIndex` refer to; renaming one silently leaves the old index in place in production
 * and builds a second copy of it.
 */
export const indexSpecs = (schema: IntrospectableSchema): string[] =>
    declaredIndexes(schema)
        .map(([keys, options]) => {
            const fields = Object.entries(keys)
                .map(
                    ([field, direction]) => `${field}${direction === 1 ? '+1' : String(direction)}`
                )
                .join(', ');
            return `${indexName(keys, options)}: ${fields}`;
        })
        .toSorted();

/** Index options that change behaviour rather than naming — uniqueness, sparseness, TTL. */
export const indexBehaviour = (
    schema: IntrospectableSchema
): Record<string, Record<string, unknown>> =>
    Object.fromEntries(
        declaredIndexes(schema).map(([keys, options]) => {
            const { name: _declared, ...rest } = options ?? {};
            return [indexName(keys, options), rest];
        })
    );

/**
 * Every index's behavioural options, rendered as `name: key=value, …` and sorted.
 *
 * The string form exists so a test can state the whole set — "these indexes, with exactly these
 * options" — without writing an object literal whose keys are index names. Index names are neither
 * camelCase nor snake_case (`orders_userId_createdAt`, `userId_1`), so as object keys they trip
 * the project's naming-convention rule, and a per-line disable in a dozen suites would be worse
 * than rendering them here once.
 *
 * `(none)` rather than an empty string for an index with no options, so "declared plain" reads
 * differently from a rendering bug.
 */
export const indexOptionSpecs = (schema: IntrospectableSchema): string[] =>
    declaredIndexes(schema)
        .map(([keys, options]) => {
            const { name: _declared, ...rest } = options ?? {};
            const rendered = Object.entries(rest)
                .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
                .toSorted()
                .join(', ');
            return `${indexName(keys, options)}: ${rendered || '(none)'}`;
        })
        .toSorted();

/**
 * The raw `options` object a path was declared with — `min`, `max`, `lowercase`, `trim`,
 * `excludeIndexes`, and anything else Mongoose does not promote to a named accessor.
 *
 * Exposed as one reader rather than left to each test to cast its way into, because the
 * alternative spelling — `(schema.path('quantity') as unknown as { options: { min?: number } })`
 * — is the double cast the project's `no-restricted-syntax` rule bans on sight, and it would
 * appear once per assertion.
 */
export const pathOptions = (schema: IntrospectableSchema, path: string): Record<string, unknown> =>
    ((schema.path(path) as SchemaPath | undefined)?.options ?? {}) as Record<string, unknown>;

/** The `default:` declared on a path, or `undefined`. Functions are called, as Mongoose calls them. */
export const defaultOf = (schema: IntrospectableSchema, path: string): unknown => {
    const declared = (schema.path(path) as SchemaPath | undefined)?.options?.default;
    return typeof declared === 'function' ? (declared as () => unknown)() : declared;
};

/** The enum a string path is restricted to, or `undefined` when it is unrestricted. */
export const enumOf = (schema: IntrospectableSchema, path: string): string[] | undefined =>
    (schema.path(path) as SchemaPath | undefined)?.enumValues;

/**
 * The schema of an embedded array or subdocument path.
 *
 * `items: [orderItemSchema]` and `shippingAddress: new Schema({...})` both hang a nested schema
 * off the path; this is where `_id: false` and the nested `required` flags live.
 */
export const subSchema = (schema: IntrospectableSchema, path: string): IntrospectableSchema => {
    const nested = (schema.path(path) as SchemaPath | undefined)?.schema;

    if (nested === undefined)
        throw new Error(
            `Path "${path}" carries no nested schema. Paths with one: ${pathNames(schema)
                .filter((name) => (schema.path(name) as SchemaPath | undefined)?.schema)
                .join(', ')}`
        );

    return nested;
};

/** A schema's own options — `timestamps`, `_id`, `collection`, and the rest. */
export const optionsOf = (schema: IntrospectableSchema): Record<string, unknown> =>
    // A necessary widening, not a cosmetic one: the interface declares `object` so a concretely
    // parameterised `Schema` stays assignable to it (see the header), and `object` carries no
    // index signature to read `timestamps` or `_id` through.
    schema.options as Record<string, unknown>;

/** Whether a path stores a reference, and to which model. */
export const refOf = (schema: IntrospectableSchema, path: string): string | undefined =>
    (schema.path(path) as SchemaPath | undefined)?.options?.ref;

/** The Mongoose type name of a path — `String`, `Number`, `ObjectId`, `Array`, `Embedded`. */
export const typeOf = (schema: IntrospectableSchema, path: string): string | undefined =>
    (schema.path(path) as SchemaPath | undefined)?.instance;
