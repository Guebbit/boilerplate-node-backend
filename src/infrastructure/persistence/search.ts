/**
 * Shared pagination/filter helpers.
 * Extracts common search logic to satisfy OCP — new filter conventions
 * require changes in one place instead of every service.
 */

export interface PaginationInput {
    // `unknown` rather than `number | string | null`: these values come straight off a request,
    // where a repeated query key arrives as an array and a JSON body can hold anything. The
    // coercion below already copes; a narrower type would only force callers to cast.
    page?: unknown;
    pageSize?: unknown;
}

export interface PaginationResult {
    page: number;
    pageSize: number;
    skip: number;
}

export interface PaginatedMeta {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
}

/** Page size used when neither the caller nor the deployment specifies one. */
const FALLBACK_PAGE_SIZE = 10;

/**
 * Upper bound for the deployment-configured page size.
 *
 * Mirrors `PageSize.maximum` in `openapi.yaml`, which `@infrastructure/http/schemas` enforces on caller
 * input. It is repeated here rather than imported because the two guard different things: a
 * caller's value is rejected with a 422 at the edge, while `NODE_SETTINGS_PAGINATION_PAGE_SIZE`
 * never passes through a request schema at all, so a typo in deployment config would otherwise
 * silently disable paging for every search.
 */
const MAX_CONFIGURED_PAGE_SIZE = 100;

/**
 * Apply pagination defaults and derive the skip.
 *
 * The single authority on what "page 1, ten per page" means. It runs on every search, so any
 * defaulting done earlier in the request path could only be overwritten here — which is why the
 * request layer leaves an unspecified page absent rather than filling it in.
 *
 * It does NOT bound the caller's own values, and deliberately so: `openapi.yaml` declares
 * `minimum: 1` / `maximum: 100`, `@infrastructure/http/schemas` enforces exactly that on every search
 * endpoint, and an out-of-range request is answered with a 422 rather than being quietly turned
 * into a different request. Clamping here as well would mean the API advertised a limit it never
 * actually applied. What remains are the structural guards — a page below 1, or a value that is
 * not a number at all, would produce a negative or `NaN` skip that Mongo cannot use.
 *
 * `NODE_SETTINGS_PAGINATION_PAGE_SIZE` makes the default deployment-tunable without touching
 * route code. It is a *default*, not a cap: an explicit `pageSize` from the caller still wins.
 */
export const normalizePagination = (input: PaginationInput = {}): PaginationResult => {
    const page = Math.max(1, Number(input.page ?? 1) || 1);
    // `|| 0` collapses '', null, NaN and 0 alike into "the caller did not ask", which is what
    // lets the fallback below take over.
    const requestedPageSize = Number(input.pageSize) || 0;
    const configuredPageSize = Math.min(
        MAX_CONFIGURED_PAGE_SIZE,
        Math.max(1, Number(process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE) || FALLBACK_PAGE_SIZE)
    );
    const pageSize = requestedPageSize > 0 ? requestedPageSize : configuredPageSize;
    return { page, pageSize, skip: (page - 1) * pageSize };
};

/**
 * Build pagination meta from total count.
 */
export const buildPaginatedMeta = (
    pagination: PaginationResult,
    totalItems: number
): PaginatedMeta => ({
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pagination.pageSize)
});

/**
 * Add a text-search $or clause to a Mongoose filter.
 * Searches across multiple fields with case-insensitive regex.
 */
/**
 * Escapes every regex metacharacter, so a user's search text is matched literally.
 *
 * Unescaped `$regex` input is a remote denial of service: MongoDB evaluates the pattern
 * server-side against every candidate document, and both search endpoints are public.
 *
 * See: docs/tools/security.md#why-search-text-is-escaped-before-it-reaches-regex
 */
export const escapeRegex = (value: string): string =>
    value.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

/**
 * C0 controls and DEL — everything a search box cannot produce and a pattern must not carry.
 *
 * A NUL is the one that actually breaks: MongoDB compiles `$regex` as a C string, so a pattern
 * containing `\u0000` is rejected by the server and surfaces as a **500 on a public endpoint**.
 * `escapeRegex` never covered it, because escaping is about metacharacters — a NUL is not one, it
 * is a byte the pattern language has no way to hold.
 *
 * The rest of the range goes with it rather than being special-cased: none of it is typeable into
 * a search box, none of it is meaningful to match on, and a rule with one exception is a rule
 * someone has to remember.
 */
// eslint-disable-next-line no-control-regex -- stripping control characters is this regex's entire purpose
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

/**
 * Turn caller text into a safe `$regex` pattern, or `undefined` when it says nothing: strip what
 * the pattern language cannot hold, then escape what it would otherwise interpret.
 *
 * `undefined` rather than an empty pattern is load-bearing — `$regex: ''` matches every document,
 * so a term that vanishes under stripping would invert the filter into "everything".
 *
 * @param value - raw text off the request
 * @returns an escaped pattern, or `undefined` if nothing searchable remains
 */
export const toSearchPattern = (value: unknown): string | undefined => {
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    const cleaned = String(value).replaceAll(CONTROL_CHARACTERS, '').trim();
    return cleaned === '' ? undefined : escapeRegex(cleaned);
};

export const addTextFilter = (
    where: Record<string, unknown>,
    text: string | undefined | null,
    fields: string[]
): void => {
    const pattern = toSearchPattern(text);
    if (pattern === undefined) return;
    where.$or = fields.map((field) => ({
        [field]: { $regex: pattern, $options: 'i' }
    }));
};

/**
 * Add a regex filter for a single field (case-insensitive).
 */
export const addRegexFilter = (
    where: Record<string, unknown>,
    field: string,
    value: string | undefined | null
): void => {
    const pattern = toSearchPattern(value);
    if (pattern === undefined) return;
    where[field] = {
        $regex: pattern,
        $options: 'i'
    };
};

/**
 * Newest first, with `_id` breaking ties.
 *
 * The tiebreaker is not cosmetic. `createdAt` is not unique — a seed, a bulk import, or two
 * concurrent creates land inside the same millisecond — and MongoDB does not guarantee any
 * particular order among documents whose sort keys are equal. Two identical queries can
 * therefore return tied documents in different orders, which was observed against the real API.
 *
 * That breaks pagination rather than merely shuffling a list: a repository's `search` issues its
 * count and its page as separate queries, so if the tie order changes between them a document can
 * be returned on page 1 AND page 2, or skipped by both. `_id` is unique and monotonic, so adding
 * it makes the sort total and the paging stable.
 */
export const DEFAULT_SORT: Record<string, 1 | -1> = { createdAt: -1, _id: -1 };
