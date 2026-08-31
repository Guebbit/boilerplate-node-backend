/**
 * @module
 * Shared pagination/filter helpers.
 * Extracts common search logic to satisfy OCP — new filter conventions
 * require changes in one place instead of every service.
 */

import { environmentNumber } from '@infrastructure/runtime/environment';

/** Raw page/size as they arrive off a request, before {@link normalizePagination} coerces them. */
export interface PaginationInput {
    // `unknown` rather than `number | string | null`: these values come straight off a request,
    // where a repeated query key arrives as an array and a JSON body can hold anything. The
    // coercion below already copes; a narrower type would only force callers to cast.
    page?: unknown;
    pageSize?: unknown;
}

/** {@link normalizePagination}'s output: defaulted, numeric, and with the derived Mongo `skip`. */
export interface PaginationResult {
    page: number;
    pageSize: number;
    skip: number;
}

/** What {@link buildPaginatedMeta} returns alongside a page of results. */
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
 * Mirrors `PageSize.maximum` in `openapi.yaml` but is repeated rather than imported: a caller's
 * value is rejected with a 422 at the edge, while this env var never passes through a request
 * schema, so a typo here would otherwise silently disable paging for every search.
 */
const MAX_CONFIGURED_PAGE_SIZE = 100;

/**
 * Apply pagination defaults and derive the skip.
 *
 * The single authority on what "page 1, ten per page" means; it does NOT bound the caller's own
 * out-of-range values — `@infrastructure/http/schemas` already rejects those with a 422 per
 * `openapi.yaml`, and clamping here too would mean the API advertised a limit it never enforced.
 * Only the structural guards remain (a page below 1, or a non-number, would produce a negative or
 * `NaN` skip). `NODE_SETTINGS_PAGINATION_PAGE_SIZE` is a *default*, not a cap — an explicit
 * `pageSize` from the caller still wins.
 */
export const normalizePagination = (input: PaginationInput = {}): PaginationResult => {
    const page = Math.max(1, Number(input.page ?? 1) || 1);
    // `|| 0` collapses '', null, NaN and 0 alike into "the caller did not ask", which is what
    // lets the fallback below take over.
    const requestedPageSize = Number(input.pageSize) || 0;
    const configuredPageSize = Math.min(
        MAX_CONFIGURED_PAGE_SIZE,
        environmentNumber('NODE_SETTINGS_PAGINATION_PAGE_SIZE', FALLBACK_PAGE_SIZE, 1)
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
 * A NUL is the one that actually breaks: MongoDB compiles `$regex` as a C string, so `\u0000`
 * in a pattern is rejected server-side and surfaces as a **500 on a public endpoint**.
 * `escapeRegex` doesn't cover it — escaping is about metacharacters, and a NUL isn't one.
 * The rest of the C0/DEL range goes with it: none of it is typeable into a search box or
 * meaningful to match on, and a rule with one exception is a rule someone forgets.
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

/**
 * Add a text-search $or clause to a Mongoose filter.
 * Searches across multiple fields with case-insensitive regex.
 */
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
 * Not cosmetic: `createdAt` isn't unique (concurrent creates can land in the same millisecond),
 * and MongoDB doesn't order tied documents consistently between queries. Since `search()` issues
 * its count and its page as separate queries, an unstable tie order can return a document on both
 * pages or neither. `_id` is unique and monotonic, so adding it makes paging stable.
 */
export const DEFAULT_SORT: Record<string, 1 | -1> = { createdAt: -1, _id: -1 };
