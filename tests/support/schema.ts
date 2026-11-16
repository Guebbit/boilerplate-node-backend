/**
 * Reading a Mongoose schema's contract back out of the schema object.
 *
 * Why assert a schema: a `model.ts` is a declaration that fails quietly and expensively:
 *   - `required: true` dropped: documents persist without the field, and nothing errors until
 *     something reads `undefined` from a row written weeks earlier;
 *   - `_id: false` lost on a subdocument: every embedded item grows an ObjectId, changing what is
 *     stored, serialized and how much;
 *   - an index deleted, renamed or given the wrong direction: the query still answers, by
 *     collection scan, surfacing as a production latency incident;
 *   - `timestamps: true` removed: `createdAt` stops being written and every "recent first" sort
 *     orders by nothing.
 * Integration tests assert what a saved row LOOKS like, which any schema accepting the fixture
 * satisfies. None of the four changes a valid document's shape, so none is visible there: they
 * survive as mutants.
 *
 * No database: it is all on the schema object. `path()` carries `isRequired`, defaults and enums;
 * `indexes()` returns `[keys, options]` pairs before any is built; `options` carries `timestamps`
 * and `_id`. So these are unit tests, in milliseconds, and belong with the module.
 */
/**
 * ── WHY THESE TAKE A STRUCTURAL TYPE RATHER THAN `Schema` ───────────────────────────────────────
 * `Schema` carries eleven generic parameters, and a concretely-typed one — `new
 * Schema<ProductDocument, ProductModel, unknown>` — is not assignable to a `Schema` written
 * with different arguments: TypeScript compares the inferred `obj` property structurally and walks
 * into `ObjectId`'s own members looking for an index signature. It is the same class of problem
 * that made `Repository` a hand-written type (TS7056), reached from the other side.
 *
 * Introspection needs four members and no generics at all, so that is what these ask for. Any
 * Mongoose schema satisfies it, whatever it was parameterised with.
 */
export interface IntrospectableSchema {
    path(name: string): unknown;
    /**
     * Loose on purpose: Mongoose's own `indexes()` and `options` types are parameterised too, and
     * pinning them here would reintroduce exactly the assignability problem described above. The
     * narrowing happens once, inside each reader below, where the shape is actually known.
     */
    indexes(): unknown[][];
    /** The schema's paths, keyed by path name. */
    paths: object;
    /** The options the schema was created with (`timestamps`, `toJSON`, ...). */
    options: object;
}

/** Minimal shape of what `Schema.prototype.path()` hands back, for the parts asserted here. */
interface SchemaPath {
    /** Mongoose's type name for the path (`String`, `ObjectId`, ...). */
    instance?: string;
    /** Whether the path is declared required. */
    isRequired?: boolean;
    /** The options passed when the path was declared. */
    options?: { default?: unknown; ref?: string; enum?: unknown } & Record<string, unknown>;
    /** The allowed values of an enum string path. */
    enumValues?: string[];
    /** The sub-schema of an embedded document path. */
    schema?: IntrospectableSchema;
    /** The default a new document gets for this path. */
    defaultValue?: unknown;
}

/**
 * The name Mongo will hold an index under.
 *
 * An index declared with `schema.index(keys, { name })` states its own; one declared as
 * `unique: true` on a PATH states none, and Mongoose derives `field_direction`, joined by `_`, at
 * build time. Deriving the same name here rather than reporting it as unnamed keeps a test
 * asserting the name the database will actually use — which is the name `db:sync` and a manual
 * `dropIndex` both have to say, and the whole reason declared names are worth pinning.
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
 * that turns an existing client's write into a rejection.
 */
export const requiredPaths = (schema: IntrospectableSchema): string[] =>
    pathNames(schema).filter((name) => (schema.path(name) as SchemaPath | undefined)?.isRequired);

/**
 * The declared indexes as `name: field±1, field±1`, sorted.
 *
 * The direction is kept because it is load-bearing on a compound index — `{ userId: 1, createdAt:
 * -1 }` serves "this user's orders, newest first" from the index, and the same index with
 * `createdAt: 1` makes that query sort in memory. The NAME is kept because it is what `db:sync`
 * and a manual `dropIndex` refer to; renaming one leaves the old index in place until the next
 * sync drops it, and until then production carries two copies.
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
    (schema.path(path) as SchemaPath | undefined)?.options ?? {};

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
 * @throws {Error} when the path carries no nested schema
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
    /**
     * A necessary widening, not a cosmetic one: the interface declares `object` so a concretely
     * parameterised `Schema` stays assignable to it (see the header), and `object` carries no
     * index signature to read `timestamps` or `_id` through.
     */
    schema.options as Record<string, unknown>;

/** Whether a path stores a reference, and to which model. */
export const refOf = (schema: IntrospectableSchema, path: string): string | undefined =>
    (schema.path(path) as SchemaPath | undefined)?.options?.ref;

/** The Mongoose type name of a path — `String`, `Number`, `ObjectId`, `Array`, `Embedded`. */
export const typeOf = (schema: IntrospectableSchema, path: string): string | undefined =>
    (schema.path(path) as SchemaPath | undefined)?.instance;

/**
 * Whether a path's own validators refuse a value — what a `min` used to be read back as, for a
 * path (money) whose type has no `min` and so carries a validator instead.
 */
export const refuses = (schema: IntrospectableSchema, path: string, value: unknown): boolean => {
    const schemaType = schema.path(path) as
        | {
              cast?: (candidate: unknown) => unknown;
              doValidateSync?: (candidate: unknown) => unknown;
          }
        | undefined;
    // Cast first, as a write would: `required` is checked on the stored type, not the number.
    return Boolean(schemaType?.doValidateSync?.(schemaType.cast?.(value)));
};
