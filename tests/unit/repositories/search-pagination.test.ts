/**
 * `normalizePagination` is the single authority on page DEFAULTS.
 *
 * It runs on every search, after the request layer has passed the caller's raw values through
 * untouched — so what it decides here is what the query gets. Anything that defaulted earlier
 * would be overwritten, which is why nothing does.
 *
 * It is deliberately not the authority on BOUNDS. `openapi.yaml` declares `minimum: 1` /
 * `maximum: 100`, `@core/http/schemas` enforces that on every search endpoint, and an
 * out-of-range request is answered with a 422 rather than quietly turned into a different
 * request. Clamping here as well would mean advertising a limit that was never applied.
 */
import { normalizePagination } from '@repositories/search';

describe('normalizePagination', () => {
    const originalPageSize = process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE;

    afterEach(() => {
        if (originalPageSize === undefined) delete process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE;
        else process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE = originalPageSize;
    });

    it('coerces string parameters to numbers and derives skip', () => {
        expect(normalizePagination({ page: '3', pageSize: '25' })).toEqual({
            page: 3,
            pageSize: 25,
            skip: 50
        });
    });

    it('defaults to page 1 with ten per page when nothing was asked for', () => {
        delete process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE;

        expect(normalizePagination()).toEqual({ page: 1, pageSize: 10, skip: 0 });
    });

    it('treats empty and zero values as absent rather than as 0', () => {
        delete process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE;

        expect(normalizePagination({ page: '', pageSize: 0 })).toEqual({
            page: 1,
            pageSize: 10,
            skip: 0
        });
    });

    // A structural guard, not a policy: a negative page would produce a negative `skip`, which
    // is not a query Mongo can run. The 422 for `?page=0` is issued at the edge.
    it('floors a page below 1 at the first page', () => {
        expect(normalizePagination({ page: -5 }).page).toBe(1);
    });

    // The contract's 1-100 range is enforced by @core/http/schemas, which answers 422. Silently
    // rewriting an out-of-range request here would make that 422 unreachable and the declared
    // maximum a fiction.
    it('does not cap a page size the caller asked for', () => {
        expect(normalizePagination({ pageSize: 5000 }).pageSize).toBe(5000);
    });

    // The env value is the one number that never passes through a request schema, so it keeps
    // its bound: a typo in deployment config must not hand every search the whole collection.
    it('still bounds the env page size, which no schema validates', () => {
        process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE = '5000';

        expect(normalizePagination().pageSize).toBe(100);
    });

    it('falls back to the env page size when the caller gives none', () => {
        process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE = '15';

        expect(normalizePagination({ page: 1 }).pageSize).toBe(15);
    });

    it('prefers an explicit page size over the env fallback', () => {
        process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE = '15';

        expect(normalizePagination({ pageSize: 50 }).pageSize).toBe(50);
    });

    // A typo in deployment config must not silently disable paging.
    it('ignores a non-numeric env page size', () => {
        process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE = 'not-a-number';

        expect(normalizePagination().pageSize).toBe(10);
    });
});
