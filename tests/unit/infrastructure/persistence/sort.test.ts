/**
 * The `sort` grammar's two halves: `splitSortParameter` reads what a transport delivers (JSON:API
 * CSV, repeated keys, a body array), `resolveSort` turns tokens into a Mongo sort through a
 * per-collection whitelist. See docs/api/sorting.md.
 */
import { resolveSort, splitSortParameter } from '@infrastructure/persistence/search';

const sortable = { price: 'price', title: 'titleColumn', createdAt: 'createdAt' };

describe('splitSortParameter', () => {
    it.each([
        ['a JSON:API CSV', '-price,title', ['-price', 'title']],
        ['a repeated key', ['-price', 'title'], ['-price', 'title']],
        ['CSV inside an array', ['-price,title'], ['-price', 'title']],
        ['whitespace around a token', ' -price , title ', ['-price', 'title']],
        ['a single token', 'price', ['price']]
    ])('reads %s', (_label, input, expected) => {
        expect(splitSortParameter(input)).toEqual(expected);
    });

    it.each([[undefined], [''], [' '], [',']])('reads %j as "no sort"', (input) => {
        expect(splitSortParameter(input)).toBeUndefined();
    });
});

describe('splitSortParameter — foreign values', () => {
    it('keeps an empty array, so the contract schema refuses it instead of reading it as "no sort"', () => {
        expect(splitSortParameter([])).toEqual([]);
    });

    it('keeps a non-string entry, so the contract schema can refuse it', () => {
        expect(splitSortParameter(['price', 7, null])).toEqual(['price', 7, null]);
    });
});

describe('resolveSort', () => {
    it('ignores a non-string entry rather than throwing on it', () => {
        expect(resolveSort(['price', 7], sortable)).toEqual({ price: 1, _id: -1 });
    });

    it('maps wire fields to columns, ascending by default and descending with "-"', () => {
        expect(resolveSort('-price,title', sortable)).toEqual({
            price: -1,
            titleColumn: 1,
            _id: -1
        });
    });

    it('keeps the caller order, because earlier entries rank first', () => {
        expect(Object.keys(resolveSort('title,-price', sortable) ?? {})).toEqual([
            'titleColumn',
            'price',
            '_id'
        ]);
    });

    it('always closes the order on _id so paging stays stable', () => {
        expect(resolveSort('price', sortable)).toHaveProperty('_id');
    });

    it('lets the first mention of a field win', () => {
        expect(resolveSort('price,-price', sortable)).toEqual({ price: 1, _id: -1 });
    });

    it('drops a field outside the whitelist instead of sorting by it', () => {
        expect(resolveSort('passwordHash,price', sortable)).toEqual({ price: 1, _id: -1 });
    });

    it('does not resolve a token through the prototype', () => {
        expect(resolveSort('constructor,__proto__,-toString', sortable)).toBeUndefined();
    });

    it('answers undefined when nothing survives, so the caller falls back to the default', () => {
        expect(resolveSort(undefined, sortable)).toBeUndefined();
        expect(resolveSort('nope', sortable)).toBeUndefined();
        expect(resolveSort('price')).toBeUndefined();
    });
});
