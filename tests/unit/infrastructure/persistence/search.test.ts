/**
 * `readAll` — the shared pager every `personalData.collect` export goes through instead of a
 * per-module page-size cap that silently truncated past it. See `search.ts`'s own docblock and
 * `CLEANUP_0917_1_ACCESS_USERS.md`'s D3 for why a short page is the loop's only stop condition.
 */
import { readAll } from '@infrastructure/persistence/search';

describe('readAll', () => {
    it('returns everything from a single short page without a second call', async () => {
        const fetchPage = jest.fn().mockResolvedValue([1, 2, 3]);

        const items = await readAll(fetchPage, 10);

        expect(items).toEqual([1, 2, 3]);
        expect(fetchPage).toHaveBeenCalledTimes(1);
        expect(fetchPage).toHaveBeenCalledWith(1);
    });

    it('keeps paging while a page comes back full, and stops on the first short one', async () => {
        const pages = [
            [1, 2],
            [3, 4],
            [5]
        ];
        const fetchPage = jest.fn((page: number) => Promise.resolve(pages[page - 1]));

        const items = await readAll(fetchPage, 2);

        expect(items).toEqual([1, 2, 3, 4, 5]);
        expect(fetchPage).toHaveBeenCalledTimes(3);
        expect(fetchPage.mock.calls.map(([page]) => page)).toEqual([1, 2, 3]);
    });

    it('stops after one call when a full-looking last page is itself empty', async () => {
        const fetchPage = jest.fn().mockResolvedValue([]);

        const items = await readAll(fetchPage, 5);

        expect(items).toEqual([]);
        expect(fetchPage).toHaveBeenCalledTimes(1);
    });

    it('treats an exact multiple of pageSize as needing one more, empty, page to confirm the end', async () => {
        const pages = [
            [1, 2],
            []
        ];
        const fetchPage = jest.fn((page: number) => Promise.resolve(pages[page - 1]));

        const items = await readAll(fetchPage, 2);

        expect(items).toEqual([1, 2]);
        expect(fetchPage).toHaveBeenCalledTimes(2);
    });
});
