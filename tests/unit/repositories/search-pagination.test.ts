/**
 * `normalizePagination` is the single authority on page defaults and bounds.
 *
 * It runs on every search, after the request layer has passed the caller's raw values through
 * untouched — so what it decides here is what the query gets. Anything that defaulted earlier
 * would be overwritten, which is why nothing does.
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

    it('clamps a page below 1 up to the first page', () => {
        expect(normalizePagination({ page: -5 }).page).toBe(1);
    });

    // Bounded so a caller cannot ask for the whole collection in one request.
    it('caps the page size at 100', () => {
        expect(normalizePagination({ pageSize: 5000 }).pageSize).toBe(100);
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
