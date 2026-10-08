/**
 * The repository half of the `sort` grammar: `resolveSort` turns the contract-validated token
 * array into a Mongo sort through a per-collection whitelist. The transport half (CSV in a query,
 * one token per body item) is `parseFormCsvList`, tested in `request.test.ts`. See
 * docs/api/sorting.md.
 */
import { resolveSort, sortOf } from '@infrastructure/persistence/search';

const sortable = { price: 'price', title: 'titleColumn', createdAt: 'createdAt' };

describe('resolveSort', () => {
    it('ignores a non-string entry rather than throwing on it', () => {
        expect(resolveSort(['price', 7], sortable)).toEqual({ price: 1, _id: -1 });
    });

    it('maps wire fields to columns, ascending by default and descending with "-"', () => {
        expect(resolveSort(['-price', 'title'], sortable)).toEqual({
            price: -1,
            titleColumn: 1,
            _id: -1
        });
    });

    it('keeps the caller order, because earlier entries rank first', () => {
        expect(Object.keys(resolveSort(['title', '-price'], sortable) ?? {})).toEqual([
            'titleColumn',
            'price',
            '_id'
        ]);
    });

    it('always closes the order on _id so paging stays stable', () => {
        expect(resolveSort(['price'], sortable)).toHaveProperty('_id');
    });

    it('lets the first mention of a field win', () => {
        expect(resolveSort(['price', '-price'], sortable)).toEqual({ price: 1, _id: -1 });
    });

    it('drops a field outside the whitelist instead of sorting by it', () => {
        expect(resolveSort(['passwordHash', 'price'], sortable)).toEqual({ price: 1, _id: -1 });
    });

    it('does not resolve a token through the prototype', () => {
        expect(resolveSort(['constructor', '__proto__', '-toString'], sortable)).toBeUndefined();
    });

    it("treats a bare string as no sort: splitting a CSV is the transport's job, not the repository's", () => {
        expect(resolveSort('-price,title', sortable)).toBeUndefined();
    });

    it('answers undefined when nothing survives, so the caller falls back to the default', () => {
        expect(resolveSort(undefined, sortable)).toBeUndefined();
        expect(resolveSort(['nope'], sortable)).toBeUndefined();
        expect(resolveSort(['price'])).toBeUndefined();
    });
});

describe('sortOf', () => {
    it('reads the `sort` key off a filter bag, through the whitelist', () => {
        expect(sortOf({ sort: ['-price'], title: 'x' }, sortable)).toEqual({ price: -1, _id: -1 });
    });

    it('answers undefined when the bag carries no sort', () => {
        expect(sortOf({ title: 'x' }, sortable)).toBeUndefined();
    });
});
