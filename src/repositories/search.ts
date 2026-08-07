/**
 * Shared pagination/filter helpers.
 * Extracts common search logic to satisfy OCP — new filter conventions
 * require changes in one place instead of every service.
 */

export interface IPaginationInput {
    // `unknown` rather than `number | string | null`: these values come straight off a request,
    // where a repeated query key arrives as an array and a JSON body can hold anything. The
    // coercion below already copes; a narrower type would only force callers to cast.
    page?: unknown;
    pageSize?: unknown;
}

export interface IPaginationResult {
    page: number;
    pageSize: number;
    skip: number;
}

export interface IPaginatedMeta {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
}

/** Page size used when neither the caller nor the deployment specifies one. */
const FALLBACK_PAGE_SIZE = 10;

/**
 * Normalize pagination parameters with safe defaults and bounds.
 *
 * The single authority on what "page 1, ten per page, at most a hundred" means. It runs on every
 * search, so any defaulting done earlier in the request path could only be overwritten here —
 * which is why the request layer passes the caller's raw values straight through.
 *
 * `NODE_SETTINGS_PAGINATION_PAGE_SIZE` makes the default deployment-tunable without touching
 * route code. It is a *default*, not a cap: an explicit `pageSize` from the caller still wins,
 * bounded by the same 1-100 range as everything else.
 */
export const normalizePagination = (input: IPaginationInput = {}): IPaginationResult => {
    const page = Math.max(1, Number(input.page ?? 1) || 1);
    const requestedPageSize = input.pageSize ?? process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE;
    const pageSize = Math.min(
        100,
        Math.max(1, Number(requestedPageSize ?? FALLBACK_PAGE_SIZE) || FALLBACK_PAGE_SIZE)
    );
    return { page, pageSize, skip: (page - 1) * pageSize };
};

/**
 * Build pagination meta from total count.
 */
export const buildPaginatedMeta = (
    pagination: IPaginationResult,
    totalItems: number
): IPaginatedMeta => ({
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
 * `$regex` with unescaped input is a remote denial of service, not a correctness nit. MongoDB
 * evaluates the pattern server-side against every candidate document, and a catastrophic
 * backtracking pattern costs seconds of CPU per document from a handful of characters —
 * `(a+)+$` against a 31-character subject takes ~45s in one engine. `POST /products/search` and
 * `GET /products?text=` are public, so that is an unauthenticated request pinning a core.
 *
 * It is also what a search box means. Unescaped, `.` matches every character, `^` anchors, and a
 * lone `(` is a syntax error the driver raises as a 500 — so a user searching for "1.5" or
 * "50% (off)" gets wrong results or an error rather than the products they were looking for.
 *
 * Literal matching gives up regex search as a feature. Nothing in this API offered it: these
 * helpers back "type words into a box", and a query language for anonymous callers is not a
 * thing to expose accidentally.
 */
export const escapeRegex = (value: string): string =>
    value.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

export const addTextFilter = (
    where: Record<string, unknown>,
    text: string | undefined | null,
    fields: string[]
): void => {
    if (!text || String(text).trim() === '') return;
    const trimmed = String(text).trim();
    where.$or = fields.map((field) => ({
        [field]: { $regex: escapeRegex(trimmed), $options: 'i' }
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
    if (!value || String(value).trim() === '') return;
    where[field] = {
        $regex: escapeRegex(String(value).trim()),
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
