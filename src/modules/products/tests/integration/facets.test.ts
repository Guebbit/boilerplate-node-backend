/**
 * `productRepository.facets` — the storefront's filter chips.
 *
 * One property matters: counts follow PUBLIC visibility. A category held only by hidden or
 * soft-deleted products must not appear at all, because a chip that finds nothing is worse
 * than no chip — and this is exactly the class of drift a green listing cannot show.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/fixtures';
import { productRepository } from '@modules/products';

setupTestDb();

describe('facets', () => {
    it('counts categories and tags across the public catalogue', async () => {
        await createProduct({ categories: ['pets'], tags: ['cute'] });
        await createProduct({ categories: ['pets', 'food'], tags: ['cute', 'noisy'] });

        const { categories, tags } = await productRepository.facets();

        expect(categories).toEqual([
            { name: 'pets', count: 2 },
            { name: 'food', count: 1 }
        ]);
        expect(tags).toEqual([
            { name: 'cute', count: 2 },
            { name: 'noisy', count: 1 }
        ]);
    });

    it('does not count what the storefront cannot see', async () => {
        await createProduct({ categories: ['visible'], tags: [] });
        await createProduct({ categories: ['hidden'], tags: [], active: false });
        await createProduct({ categories: ['gone'], tags: [], deletedAt: new Date() });

        const { categories } = await productRepository.facets();

        expect(categories).toEqual([{ name: 'visible', count: 1 }]);
    });

    it('sorts by count descending, then name — a stable order the chips can trust', async () => {
        await createProduct({ categories: ['b-common', 'a-rare'], tags: [] });
        await createProduct({ categories: ['b-common', 'c-rare'], tags: [] });

        const { categories } = await productRepository.facets();

        expect(categories.map(({ name }) => name)).toEqual(['b-common', 'a-rare', 'c-rare']);
    });

    it('an empty catalogue answers empty lists, not an error', async () => {
        const { categories, tags } = await productRepository.facets();

        expect(categories).toEqual([]);
        expect(tags).toEqual([]);
    });
});
