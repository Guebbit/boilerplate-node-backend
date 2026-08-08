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

/**
 * Pagination/sort options shared across all repository findAll methods.
 */
export interface IFindAllOptions {
    sort?: Record<string, 1 | -1>;
    skip?: number;
    limit?: number;
}

/**
 * What a collection can be filtered by, expressed as data.
 *
 * Every entry maps an incoming **filter key** (what the API caller sends) to the **Mongo path**
 * it targets. Declaring this per repository is what keeps `$regex`, `$elemMatch`, `$gte` and
 * `Types.ObjectId` out of the service layer: a service says *what* it wants filtered, the
 * repository owns *how* that becomes a query.
 *
 * Empty, whitespace-only, `null` and `undefined` values are skipped throughout — an absent
 * filter must not narrow the result set, and `?text=` on a URL is absent, not "match empty".
 */
export interface ISearchSpec {
    /** Filter keys holding a document id. Coerced to `ObjectId` — a string never matches one. */
    objectIds?: Record<string, string>;
    /** Filter keys matched verbatim (trimmed). */
    exact?: Record<string, string>;
    /**
     * Filter keys matched as a boolean. The value is expected to BE a boolean already — every
     * search controller decodes its query string before the filters get here (`get-users.ts`
     * coerces `active`, `readInput`'s `booleans` option does the same for bodies), because a
     * GET carries `?active=false` as the string `'false'`, which is truthy. Coercing again here
     * would only hide a controller that forgot to.
     */
    booleans?: Record<string, string>;
    /** Filter keys matched case-insensitively against a single field. */
    regex?: Record<string, string>;
    /** Filter keys matched case-insensitively against any element of an array field. */
    arrayRegex?: Record<string, string>;
    /** Mongo paths searched together by the single `text` filter. */
    text?: string[];
    /** Mongo path → the two filter keys bounding it, e.g. `price: { min: 'minPrice', … }`. */
    ranges?: Record<string, { min: string; max: string }>;
}

/**
 * Raw, unvalidated filter bag as it arrives from the request layer.
 *
 * Deliberately `object` and not `Record<string, unknown>`: the generated request DTOs
 * (`SearchProductsRequest` and friends) are interfaces, and TypeScript does not give an
 * interface an implicit index signature — so the stricter type would force every caller to
 * cast. The single cast that makes the keys readable lives in `buildWhere` instead.
 */
export type TSearchFilters = object;

/**
 * A model's `_id` → `id` normalizer (`applyProductTransform` and friends).
 *
 * Needed because `.lean()` and `.aggregate()` both bypass the schema's `toJSON`, so the plain
 * objects they return still carry `_id`/`__v`. Passing it to the factory is what lets the
 * repository return already-normalized results instead of making every service remember to map.
 */
export type TTransform = (serialized: Record<string, unknown>) => Record<string, unknown>;

/** Treat empty/blank/nullish as "the caller did not filter on this". */
const isPresent = (value: unknown): boolean =>
    value !== undefined && value !== null && String(value).trim() !== '';

/**
 * Coerce an id to a BSON ObjectId.
 *
 * Throws on a malformed id, which is the safe direction: an aggregation `$match` does not cast
 * the way `find()` does, so a string id there matches nothing and reads as "no results" rather
 * than as the bad input it is.
 */
export const toObjectId = (value: unknown): Types.ObjectId => new Types.ObjectId(String(value));

/**
 * Turn a filter bag into a Mongo query object, per the collection's declared search spec.
 *
 * Repositories reach it through the bound `buildWhere` on the factory result — the order
 * repository does, to build an aggregation `$match` from the same rules.
 */
const buildWhere = (filters: TSearchFilters, spec: ISearchSpec): Record<string, unknown> => {
    const bag = filters as Record<string, unknown>;
    const where: Record<string, unknown> = {};

    for (const [key, path] of Object.entries(spec.objectIds ?? {}))
        if (isPresent(bag[key])) where[path] = toObjectId(String(bag[key]).trim());

    for (const [key, path] of Object.entries(spec.exact ?? {}))
        if (isPresent(bag[key])) where[path] = String(bag[key]).trim();

    for (const [key, path] of Object.entries(spec.booleans ?? {}))
        if (typeof bag[key] === 'boolean') where[path] = bag[key];

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

    for (const [path, bounds] of Object.entries(spec.ranges ?? {})) {
        const range: Record<string, number> = {};
        const min = Number(bag[bounds.min]);
        const max = Number(bag[bounds.max]);
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
    /** The model's `_id` → `id` normalizer, applied to every lean read. */
    transform: TTransform;
    /** What `search()` accepts. Omit for collections that are never searched. */
    searchable?: ISearchSpec;
}

/**
 * The factory's return type, written out rather than inferred.
 *
 * Mongoose's `Query` generics are large enough that TypeScript refuses to serialize the inferred
 * shape at an export boundary (TS7056) once it is spread into a repository object. Naming the
 * contract here fixes that, and doubles as the one place to read what every repository can do.
 */
export interface IBaseRepository<TDocument extends Document> {
    /**
     * Fetch a single document by its MongoDB _id.
     *
     * Resolves a Promise rather than handing back Mongoose's Query builder. That is deliberate:
     * a Query escaping the repository lets any caller chain `.select()`, `.sort()` or `.lean()`
     * onto it, which is the same layering leak this factory exists to close. Callers that need
     * a plain object ask for one — see `findByIdRaw`.
     */
    findById: (id: string) => Promise<TDocument | null>;
    /** Fetch the first document matching the given filter. */
    findOne: (where: QueryFilter<TDocument>) => Promise<TDocument | null>;
    /**
     * Fetch one document as a plain, **untransformed** object.
     *
     * For embedding a snapshot in another document: the stored copy must keep its `_id`, so this
     * deliberately skips the `_id` → `id` normalization every other read applies.
     */
    findByIdRaw: (id: string) => Promise<TDocument | null>;
    /** Fetch a filtered, sorted, paginated list as plain JS objects (lean). */
    findAll: (where?: QueryFilter<TDocument>, options?: IFindAllOptions) => Promise<TDocument[]>;
    /** Count how many documents match the given filter. */
    count: (where?: QueryFilter<TDocument>) => Promise<number>;
    /** Insert a new document into the collection. */
    create: (data: Partial<TDocument>) => Promise<TDocument>;
    /** Persist in-memory changes made to an already-fetched document. */
    save: (document: TDocument) => Promise<TDocument>;
    /** Remove a single document from the collection. */
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
     * The double cast is unavoidable and deliberately confined to this one line: `.lean()`
     * returns plain objects, the transform rewrites their keys, and the rest of the app types
     * the outcome as the document. One copy, so there is one place to get it wrong.
     */
    const normalize = (items: unknown[]): TDocument[] =>
        (items as Record<string, unknown>[]).map((item) =>
            transform(item)
        ) as unknown as TDocument[];

    /** Fetch a single document by its MongoDB _id. */
    const findById = (id: string): Promise<TDocument | null> => mongooseModel.findById(id).exec();

    /** Fetch the first document matching the given filter. */
    const findOne = (where: QueryFilter<TDocument>): Promise<TDocument | null> =>
        mongooseModel.findOne(where).exec();

    /** Fetch one document as a plain, untransformed object — for embedded snapshots. */
    const findByIdRaw = (id: string): Promise<TDocument | null> =>
        mongooseModel.findById(id).lean().exec() as unknown as Promise<TDocument | null>;

    /**
     * Fetch a filtered, sorted, paginated list as plain JS objects (lean).
     *
     * The cast is the `.lean()` lie, made explicit: these are plain objects, not hydrated
     * documents, and the rest of the app types them as the latter. `search()` is the path that
     * also normalizes them; this one returns them raw.
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

    /** Count how many documents match the given filter. */
    const count = (where: QueryFilter<TDocument> = {}): Promise<number> =>
        mongooseModel.countDocuments(where);

    /** Insert a new document into the collection. */
    const create = (data: Partial<TDocument>): Promise<TDocument> => mongooseModel.create(data);

    /** Persist in-memory changes made to an already-fetched document. */
    const save = (document: TDocument): Promise<TDocument> => document.save();

    /** Remove a single document from the collection. */
    const deleteOne = (document: TDocument): Promise<void> =>
        document.deleteOne().then(() => {
            // explicit void return
        });

    /**
     * Filter → count → page → normalize, in one call.
     *
     * `scope` is merged last and wins: it carries the caller's authorization boundary (a
     * non-admin's own rows, the public's visible rows), which no client-supplied filter may
     * widen.
     *
     * `count` and `findAll` are separate queries, so the sort has to be total or a tied
     * document can appear on two pages — see `DEFAULT_SORT`.
     */
    const search = (
        filters: TSearchFilters = {},
        scope: Record<string, unknown> = {},
        sort: Record<string, 1 | -1> = DEFAULT_SORT
    ): Promise<IPaginatedResult<TDocument>> => {
        const pagination = normalizePagination(filters as IPaginationInput);
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
        buildWhere: (filters: TSearchFilters) => buildWhere(filters, searchable)
    };
}
