// Set test environment BEFORE any imports so the in-memory SQLite DB is used
process.env.NODE_ENV = 'test';

import { sequelize } from '@utils/database';
import ProductRepository from '@repositories/products';
import type { IProductDocument } from '@models/products';

/**
 * Product Repository unit tests.
 * Validates every raw CRUD / query method against an in-memory SQLite database,
 * without going through the service layer.
 */
describe('Product Repository', () => {
    /**
     * The test document created during the run — kept so we can reference
     * and clean it up in subsequent tests and afterAll.
     */
    let testProduct: IProductDocument;

    /**
     * Sync the database schema before running tests.
     */
    beforeAll(async () => {
        await sequelize.sync({ force: true });
    });

    // ---------------------------------------------------------------------------
    // create
    // ---------------------------------------------------------------------------

    it('create inserts a new product document and returns it', async () => {
        testProduct = await ProductRepository.create({
            title:    'Repo Test Product',
            price:    9.99,
            imageUrl: '/images/repo-test.jpg',
            active:   false,
        });
        expect(testProduct).toBeDefined();
        expect(testProduct.title).toBe('Repo Test Product');
        expect(testProduct.price).toBe(9.99);
        expect(typeof testProduct.id).toBe('number');
        expect(testProduct.id).toBeGreaterThan(0);
    });

    // ---------------------------------------------------------------------------
    // findById
    // ---------------------------------------------------------------------------

    it('findById returns null for a non-existent id', async () => {
        const result = await ProductRepository.findById(999999);
        expect(result).toBeNull();
    });

    it('findById returns the product document for a valid id', async () => {
        const result = await ProductRepository.findById(testProduct.id);
        expect(result).not.toBeNull();
        expect(result!.title).toBe('Repo Test Product');
    });

    // ---------------------------------------------------------------------------
    // findOne
    // ---------------------------------------------------------------------------

    it('findOne returns null when no document matches the filter', async () => {
        const result = await ProductRepository.findOne({ title: 'No Such Product' });
        expect(result).toBeNull();
    });

    it('findOne returns the matching product document', async () => {
        const result = await ProductRepository.findOne({ title: 'Repo Test Product' });
        expect(result).not.toBeNull();
        expect(result!.price).toBe(9.99);
    });

    it('findOne respects additional filter fields', async () => {
        // active: true should NOT match our inactive test product
        const result = await ProductRepository.findOne({
            title:  'Repo Test Product',
            active: true,
        });
        expect(result).toBeNull();
    });

    // ---------------------------------------------------------------------------
    // findAll
    // ---------------------------------------------------------------------------

    it('findAll returns an array of documents', async () => {
        const results = await ProductRepository.findAll();
        expect(Array.isArray(results)).toBe(true);
    });

    it('findAll respects the limit option', async () => {
        const results = await ProductRepository.findAll({}, { limit: 1 });
        expect(results.length).toBeLessThanOrEqual(1);
    });

    it('findAll respects the skip option', async () => {
        const all   = await ProductRepository.findAll({ title: 'Repo Test Product' });
        const paged = await ProductRepository.findAll({ title: 'Repo Test Product' }, { skip: all.length });
        expect(paged.length).toBe(0);
    });

    it('findAll filters results by a where clause', async () => {
        const results = await ProductRepository.findAll({ title: 'Repo Test Product' });
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].title).toBe('Repo Test Product');
    });

    // ---------------------------------------------------------------------------
    // count
    // ---------------------------------------------------------------------------

    it('count returns 0 for a non-matching filter', async () => {
        const n = await ProductRepository.count({ title: 'No Such Product' });
        expect(n).toBe(0);
    });

    it('count returns the correct number of matching documents', async () => {
        const n = await ProductRepository.count({ title: 'Repo Test Product' });
        expect(n).toBe(1);
    });

    // ---------------------------------------------------------------------------
    // save
    // ---------------------------------------------------------------------------

    it('save persists field changes to the document', async () => {
        testProduct.title = 'Repo Test Product Updated';
        const saved = await ProductRepository.save(testProduct);
        expect(saved.title).toBe('Repo Test Product Updated');

        // Confirm the change is reflected in a subsequent database read
        const fetched = await ProductRepository.findById(testProduct.id);
        expect(fetched!.title).toBe('Repo Test Product Updated');
    });

    // ---------------------------------------------------------------------------
    // deleteOne
    // ---------------------------------------------------------------------------

    it('deleteOne removes the document from the database', async () => {
        const id = testProduct.id;
        await ProductRepository.deleteOne(testProduct);

        const result = await ProductRepository.findById(id);
        expect(result).toBeNull();
    });

    // ---------------------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------------------

    /**
     * Ensure no leftover test document remains, then close the connection.
     * (The deleteOne test already removes it; this is a safety net.)
     */
    afterAll(async () => {
        await ProductRepository.findOne({ title: 'Repo Test Product Updated' })
            .then(product => (product ? ProductRepository.deleteOne(product) : undefined));
        await sequelize.close();
    });
});
