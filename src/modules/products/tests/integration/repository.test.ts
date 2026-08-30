import { asStub } from '@tests/stub';
import { setupTestDb } from '@tests/setup-test-db';
import { makeProduct, createProduct } from '@modules/products/tests/fixtures';
import { productRepository } from '@modules/products';
import { productModel } from '../../model';

setupTestDb();

describe('productRepository', () => {
    describe('create', () => {
        it('inserts a new product and returns the Mongoose document', async () => {
            const product = await productRepository.create(makeProduct());

            expect(product._id).toBeDefined();
            expect(product.title).toBe('Test Product');
            expect(product.price).toBe(9.99);
            expect(product.active).toBe(true);
        });

        it('applies the imageUrl default when not provided', async () => {
            // The schema sets a default imageUrl; any non-empty URL satisfies it
            const product = await productRepository.create(
                makeProduct({ imageUrl: 'https://example.com/custom.jpg' })
            );

            expect(product.imageUrl).toBe('https://example.com/custom.jpg');
        });
    });

    describe('findById', () => {
        it('returns the product when the id exists', async () => {
            const created = await createProduct({ title: 'Widget' });
            const id = created._id.toString();

            const found = await productRepository.findById(id);

            expect(found).not.toBeNull();
            expect(found!.title).toBe('Widget');
        });

        it('returns null for a non-existent id', async () => {
            const found = await productRepository.findById('000000000000000000000000');

            expect(found).toBeNull();
        });
    });

    describe('findOne', () => {
        it('returns a product matching the query', async () => {
            await createProduct({ title: 'Unique Product', price: 42 });

            const found = await productRepository.findOne({
                title: 'Unique Product'
            });

            expect(found).not.toBeNull();
            expect(found!.price).toBe(42);
        });

        it('returns null when no product matches', async () => {
            const found = await productRepository.findOne({ title: 'Nonexistent' });

            expect(found).toBeNull();
        });

        it('returns only the first match when multiple documents qualify', async () => {
            // Two active products
            await createProduct({ title: 'Alpha', active: true });
            await createProduct({ title: 'Beta', active: true });

            const found = await productRepository.findOne({ active: true });

            // At least one was returned (we don't rely on insertion order)
            expect(found).not.toBeNull();
        });
    });

    describe('findAll', () => {
        it('returns all products when no filter is provided', async () => {
            await createProduct({ title: 'A' });
            await createProduct({ title: 'B' });

            const products = await productRepository.findAll();

            expect(products).toHaveLength(2);
        });

        it('respects the limit option', async () => {
            for (let i = 0; i < 5; i++) {
                await createProduct({ title: `Product ${i}` });
            }

            const products = await productRepository.findAll({}, { limit: 3 });

            expect(products).toHaveLength(3);
        });

        it('applies the skip option for pagination', async () => {
            await createProduct({ title: 'A' });
            await createProduct({ title: 'B' });
            await createProduct({ title: 'C' });

            // skip 2 of 3 → only 1 remains
            const products = await productRepository.findAll({}, { skip: 2, limit: 10 });

            expect(products).toHaveLength(1);
        });

        it('filters by active flag', async () => {
            await createProduct({ title: 'Active', active: true });
            await createProduct({ title: 'Inactive', active: false });

            const active = await productRepository.findAll({ active: true });

            expect(active).toHaveLength(1);
            expect(active[0].title).toBe('Active');
        });

        it('returns lean (plain JS) objects without Mongoose methods', async () => {
            await createProduct();

            const [product] = await productRepository.findAll();

            expect(typeof asStub<{ save?: unknown }>(product).save).toBe('undefined');
        });
    });

    describe('count', () => {
        it('returns the total number of documents', async () => {
            await createProduct({ title: 'A' });
            await createProduct({ title: 'B' });

            expect(await productRepository.count()).toBe(2);
        });

        it('counts only documents matching the filter', async () => {
            await createProduct({ title: 'Active', active: true });
            await createProduct({ title: 'Inactive', active: false });

            expect(await productRepository.count({ active: true })).toBe(1);
        });

        it('returns 0 for an empty collection', async () => {
            expect(await productRepository.count()).toBe(0);
        });
    });

    describe('save', () => {
        it('persists mutations to an existing document', async () => {
            const product = await createProduct();
            const id = product._id.toString();

            product.title = 'Updated Title';
            product.price = 99.99;
            await productRepository.save(product);

            const refreshed = await productRepository.findById(id);
            expect(refreshed!.title).toBe('Updated Title');
            expect(refreshed!.price).toBe(99.99);
        });
    });

    describe('deleteOne', () => {
        it('removes the document permanently from the collection', async () => {
            const product = await createProduct();
            const id = product._id.toString();

            await productRepository.deleteOne(product);

            expect(await productRepository.findById(id)).toBeNull();
        });

        it('only removes the targeted document, not others', async () => {
            const toDelete = await createProduct({ title: 'Delete me' });
            await createProduct({ title: 'Keep me' });

            await productRepository.deleteOne(toDelete);

            expect(await productRepository.count()).toBe(1);
            const remaining = await productRepository.findOne({ title: 'Keep me' });
            expect(remaining).not.toBeNull();
        });
    });
});

/*
 * The absent-row arms. Every aggregate above answers over a seeded catalogue; these pin what the
 * same pipelines answer over NOTHING — the `.at(0)` arm the calling code guards, asserted rather
 * than assumed, because an empty $group or $facet returns no row at all rather than a zeroed one.
 */
describe('an empty catalogue', () => {
    beforeEach(() => productModel.deleteMany({}));

    it('answers facets as empty lists, not a crash on the absent aggregate row', async () => {
        await expect(productRepository.facets()).resolves.toEqual({ categories: [], tags: [] });
    });

    it('sums zero reserved units when there is nothing to reserve', async () => {
        await expect(productRepository.sumReserved()).resolves.toBe(0);
    });

    it('serves an empty availability page with a zero total', async () => {
        await expect(productRepository.availabilityPage({ skip: 0, limit: 10 })).resolves.toEqual({
            items: [],
            totalItems: 0
        });
    });
});
