import { Types } from 'mongoose';
import type { Model, Document, QueryFilter } from 'mongoose';
import {
    normalizePagination,
    buildPaginatedMeta,
    addTextFilter,
    addRegexFilter,
    escapeRegex,
    DEFAULT_SORT,
    type IPaginatedMeta,
    type IPaginationInput
} from './search';

/** Pagination/sort options shared across all repository `findAll` calls. */
export interface IFindAllOptions {
    sort?: Record<string, 1 | -1>;
    skip?: number;
    limit?: number;
}

/**
 * What a collection can be filtered by, expressed as data: filter key (what the caller sends)
 * → Mongo path it targets.
 *
 * Declaring this per repository is what keeps `$regex`, `$elemMatch`, `$gte` and `ObjectId` out
 * of services: a service says *what* to filter, the repository owns *how* it becomes a query.
 *
 * Empty/blank/nullish values are skipped throughout — `?text=` is an absent filter, not a
 * request to match the empty string.
 */
export interface ISearchSpec {
    /** Holds a document id. Coerced to `ObjectId` — a string never matches one. */
    objectIds?: Record<string, string>;
    /** Matched verbatim (trimmed). */
    exact?: Record<string, string>;
    /**
     * Matched as a boolean, and the value must already BE one.
     *
     * Controllers decode first (`get-users.ts` coerces `active`, `readInput`'s `booleans` does
     * the same for bodies) because `?active=false` arrives as the truthy string `'false'`.
     * Coercing again here would only hide a controller that forgot to.
     */
    booleans?: Record<string, string>;
    /** Matched case-insensitively against one field. */
    regex?: Record<string, string>;
    /** Matched case-insensitively against any element of an array field. */
    arrayRegex?: Record<string, string>;
    /** Mongo paths the single `text` filter searches together. */
    text?: string[];
    /** Mongo path → the two filter keys bounding it, e.g. `price: { min: 'minPrice', … }`. */
    ranges?: Record<string, { min: string; max: string }>;
}

/**
 * Raw, unvalidated filter bag from the request layer.
 *
 * `object` and not `Record<string, unknown>`: the generated request DTOs are interfaces, which
 * TypeScript denies an implicit index signature, so the stricter type would force every caller
 * to cast. The one cast that makes keys readable lives in `buildWhere` instead.
 */
export type TSearchFilters = object;

/**
 * A model's wire-shape serializer — `applySerialization`'s return value, exported by each model
 * as `applyProductTransform` and friends. Mostly `_id` → `id`, though `audit-logs` drops the id
 * outright; `@models/serialize` is the authority on what each collection owes.
 *
 * Needed because `.lean()` and `.aggregate()` both bypass the schema's `toJSON`, so their plain
 * objects still carry `_id`/`__v`. Passing it to the factory is what lets repositories return
 * serialized results instead of every service remembering to map.
 */
export type TTransform = (serialized: Record<string, unknown>) => Record<string, unknown>;

/** Treat empty/blank/nullish as "the caller did not filter on this". */
const isPresent = (value: unknown): boolean =>
    value !== undefined && value !== null && String(value).trim() !== '';

/**
 * Coerce an id to a BSON ObjectId.
 *
 * Throws on a malformed id, which is the safe direction: an aggregation `$match` does not cast
 * the way `find()` does, so a raw string there matches nothing and reads as "no results"
 * rather than as the bad input it is.
 */
export const toObjectId = (value: unknown): Types.ObjectId => new Types.ObjectId(String(value));

/**
 * Compile a filter bag into a Mongo query, per the collection's declared spec.
 *
 * Reached through the bound `buildWhere` on the factory result — the order repository uses it
 * to build an aggregation `$match` from the same rules.
 */
const buildWhere = (filters: TSearchFilters, spec: ISearchSpec): Record<string, unknown> => {
    // The one cast, confined here — see `TSearchFilters`.
    const bag = filters as Record<string, unknown>;
    const where: Record<string, unknown> = {};

    for (const [key, path] of Object.entries(spec.objectIds ?? {}))
        if (isPresent(bag[key])) where[path] = toObjectId(String(bag[key]).trim());

    for (const [key, path] of Object.entries(spec.exact ?? {}))
        if (isPresent(bag[key])) where[path] = String(bag[key]).trim();

    // Type check, not `isPresent`: `false` is a filter, and the value is pre-decoded by now.
    for (const [key, path] of Object.entries(spec.booleans ?? {}))
        if (typeof bag[key] === 'boolean') where[path] = bag[key];

    // Both regex helpers escape the input — an unescaped `$regex` is a public ReDoS.
    for (const [key, path] of Object.entries(spec.regex ?? {}))
        addRegexFilter(where, path, bag[key] as string | undefined);

    for (const [key, path] of Object.entries(spec.arrayRegex ?? {}))
        if (isPresent(bag[key]))
            where[path] = {
                $elemMatch: {
                    $regex: escapeRegex(String(bag[key]).trim()),
                    $options: 'i'
                }
            };

    if (spec.text && spec.text.length > 0)
        addTextFilter(where, bag.text as string | undefined, spec.text);

    // Each bound is optional and independent: one-sided ranges are normal.
    for (const [path, bounds] of Object.entries(spec.ranges ?? {})) {
        const range: Record<string, number> = {};
        const min = Number(bag[bounds.min]);
        const max = Number(bag[bounds.max]);
        // `NaN` checked separately: a non-numeric bound is dropped, not sent to Mongo.
        if (isPresent(bag[bounds.min]) && !Number.isNaN(min)) range.$gte = min;
        if (isPresent(bag[bounds.max]) && !Number.isNaN(max)) range.$lte = max;
        if (Object.keys(range).length > 0) where[path] = range;
    }

    return where;
};

/** A page of already-normalized results plus its pagination meta. */
export interface IPaginatedResult<TDocument> {
    items: TDocument[];
    meta: IPaginatedMeta;
}

export interface IBaseRepositoryOptions {
    /** The model's wire-shape serializer, applied by `normalize` — and so by `search`. */
    transform: TTransform;
    /** What `search()` accepts. Omit for collections that are never searched. */
    searchable?: ISearchSpec;
}

/**
 * The factory's return type, written out rather than inferred.
 *
 * Mongoose's `Query` generics are large enough that TypeScript refuses to serialize the
 * inferred shape at an export boundary (TS7056) once it is spread into a repository object.
 * Naming the contract fixes that, and doubles as the one place to read what a repository can do.
 */
export interface IBaseRepository<TDocument extends Document> {
    /**
     * Fetch one document by `_id`, as a hydrated document.
     *
     * Resolves a Promise rather than handing back Mongoose's Query builder: a Query escaping
     * the repository lets any caller chain `.select()`/`.lean()` onto it, which is the layering
     * leak this factory exists to close. Need a plain object? See `findByIdRaw`.
     */
    findById: (id: string) => Promise<TDocument | null>;
    /** Fetch the first document matching a filter, as a hydrated document. */
    findOne: (where: QueryFilter<TDocument>) => Promise<TDocument | null>;
    /**
     * Fetch one document as a plain, **untransformed** object.
     *
     * For embedding a snapshot in another document: the stored copy must keep its `_id`, so
     * this deliberately skips `normalize`. So does `findAll`; `search` is the only read that
     * returns serialized output.
     */
    findByIdRaw: (id: string) => Promise<TDocument | null>;
    /** Fetch a filtered, sorted, paginated list as lean objects — **not** normalized. */
    findAll: (where?: QueryFilter<TDocument>, options?: IFindAllOptions) => Promise<TDocument[]>;
    /** Count the documents matching a filter. */
    count: (where?: QueryFilter<TDocument>) => Promise<number>;
    /** Insert a new document. */
    create: (data: Partial<TDocument>) => Promise<TDocument>;
    /** Persist in-memory changes to an already-fetched document. */
    save: (document: TDocument) => Promise<TDocument>;
    /** Remove a single document. */
    deleteOne: (document: TDocument) => Promise<void>;
    /** Filter → count → page → normalize, per the declared search spec. */
    search: (
        filters?: TSearchFilters,
        scope?: Record<string, unknown>,
        sort?: Record<string, 1 | -1>
    ) => Promise<IPaginatedResult<TDocument>>;
    /** Apply the model's transform to lean/aggregate output. */
    normalize: (items: unknown[]) => TDocument[];
    /** Build a Mongo filter from a filter bag, per the declared search spec. */
    buildWhere: (filters: TSearchFilters) => Record<string, unknown>;
}

/**
 * Creates the standard CRUD operations for a Mongoose model.
 *
 * Beyond plain CRUD this owns the three pieces of Mongo knowledge a service must not carry: id
 * coercion, the lean→normalized mapping, and turning a filter bag into a query.
 */
export function createBaseRepository<TDocument extends Document>(
    mongooseModel: Model<TDocument>,
    options: IBaseRepositoryOptions
): IBaseRepository<TDocument> {
    const { transform, searchable = {} } = options;

    /**
     * Normalize a batch of lean/aggregate results.
     *
     * The double cast is unavoidable and confined to this one line: `.lean()` returns plain
     * objects, the transform rewrites their keys, the app types the outcome as the document.
     * One copy, so there is one place to get it wrong.
     */
    const normalize = (items: unknown[]): TDocument[] =>
        (items as Record<string, unknown>[]).map((item) =>
            transform(item)
        ) as unknown as TDocument[];

    /** Hydrated — callers may mutate and `save()` the result. */
    const findById = (id: string): Promise<TDocument | null> => mongooseModel.findById(id).exec();

    /** Hydrated — callers may mutate and `save()` the result. */
    const findOne = (where: QueryFilter<TDocument>): Promise<TDocument | null> =>
        mongooseModel.findOne(where).exec();

    /** Lean and untransformed, so the `_id` survives — for embedded snapshots. */
    const findByIdRaw = (id: string): Promise<TDocument | null> =>
        mongooseModel.findById(id).lean().exec() as unknown as Promise<TDocument | null>;

    /**
     * Filtered, sorted, paginated list.
     *
     * The cast is the `.lean()` lie made explicit: these are plain objects typed as hydrated
     * documents, and they are NOT normalized — `search()` is the path that also normalizes.
     */
    const findAll = (
        where: QueryFilter<TDocument> = {},
        { sort = { createdAt: -1 as const }, skip = 0, limit = 10 }: IFindAllOptions = {}
    ): Promise<TDocument[]> =>
        mongooseModel
            .find({ ...where })
            .lean()
            // eslint-disable-next-line unicorn/no-array-sort
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .exec() as unknown as Promise<TDocument[]>;

    /** Count the documents matching a filter. */
    const count = (where: QueryFilter<TDocument> = {}): Promise<number> =>
        mongooseModel.countDocuments(where);

    /** Insert a new document. */
    const create = (data: Partial<TDocument>): Promise<TDocument> => mongooseModel.create(data);

    /** Persist in-memory changes to an already-fetched document. */
    const save = (document: TDocument): Promise<TDocument> => document.save();

    /** Remove a single document. */
    const deleteOne = (document: TDocument): Promise<void> =>
        document.deleteOne().then(() => {
            // explicit void return
        });

    /**
     * Filter → count → page → normalize, in one call.
     *
     * `async` is load-bearing, not style. The two lines below run synchronously before any
     * promise exists, and `buildWhere` can throw: `toObjectId` hands a client string to
     * `new Types.ObjectId(...)`, which rejects anything but 24 hex chars. Without `async` that
     * throw escapes the function, the caller's `.then().catch()` is never even built, and
     * Express answers 500 — `POST /products/search` with `{"id": ""}` was an unauthenticated
     * 500 (found by `tests/fuzz/endpoints.fuzz.test.ts`). A signature saying `Promise<T>` must
     * reject, never throw synchronously.
     */
    const search = async (
        filters: TSearchFilters = {},
        scope: Record<string, unknown> = {},
        // Total sort by default: `count` and `findAll` are separate queries, so a tie can put
        // one document on two pages — see `DEFAULT_SORT`.
        sort: Record<string, 1 | -1> = DEFAULT_SORT
    ): Promise<IPaginatedResult<TDocument>> => {
        const pagination = normalizePagination(filters as IPaginationInput);
        // `scope` merged last and wins: it is the caller's authorization boundary (own rows,
        // publicly visible rows), which no client-supplied filter may widen.
        const where = { ...buildWhere(filters, searchable), ...scope } as QueryFilter<TDocument>;

        return count(where).then((totalItems) =>
            findAll(where, { sort, skip: pagination.skip, limit: pagination.pageSize }).then(
                (items) => ({
                    items: normalize(items),
                    meta: buildPaginatedMeta(pagination, totalItems)
                })
            )
        );
    };

    return {
        findById,
        findOne,
        findByIdRaw,
        findAll,
        count,
        create,
        save,
        deleteOne,
        search,
        normalize,
        // Bound to this collection's spec, so callers pass filters only.
        buildWhere: (filters: TSearchFilters) => buildWhere(filters, searchable)
    };
}
