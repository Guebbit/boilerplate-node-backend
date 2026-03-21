import 'dotenv/config';
import mongoose from 'mongoose';
import * as ProductService from '../../src/services/products';

/**
 * Product Service unit tests.
 * Validates the service layer (search, getById, validateData, create/update/remove).
 *
 * Requires a running MongoDB instance (NODE_DB_URI env var).
 */
describe('Product Service', () => {
    /**
     * Tracks the id of any product created during the test run so we can clean up.
     */
    let testProductId = '';

    /**
     * Connect to the database before running tests
     */
    beforeAll(async () => {
        return mongoose.connect(process.env.NODE_DB_URI ?? '');
    });

    // ---------------------------------------------------------------------------
    // validateData
    // ---------------------------------------------------------------------------

    it('validateData rejects an empty title', () => {
        const errors = ProductService.validateData({
            title: '',
            price: 10,
            imageUrl: '/images/test.jpg',
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    it('validateData rejects a title shorter than 5 characters', () => {
        const errors = ProductService.validateData({
            title: 'Hi',
            price: 10,
            imageUrl: '/images/test.jpg',
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    it('validateData accepts valid product data', () => {
        const errors = ProductService.validateData({
            title: 'Valid Product Title',
            price: 10,
            imageUrl: '/images/test.jpg',
        });
        expect(errors).toHaveLength(0);
    });

    // ---------------------------------------------------------------------------
    // search
    // ---------------------------------------------------------------------------

    it('search returns a paginated result object', async () => {
        const result = await ProductService.search({ page: 1, pageSize: 5 });
        expect(result).toHaveProperty('items');
        expect(result).toHaveProperty('meta');
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.meta.page).toBe(1);
        expect(result.meta.pageSize).toBe(5);
    });

    it('search clamps pageSize to max 100', async () => {
        const result = await ProductService.search({ page: 1, pageSize: 9999 });
        expect(result.meta.pageSize).toBe(100);
    });

    it('search without admin flag excludes inactive products', async () => {
        // Create an inactive product
        const inactive = await ProductService.create({
            title: 'Inactive Test Product',
            price: 1,
            imageUrl: '/images/inactive.jpg',
            active: false,
        });
        testProductId = inactive.id as string;

        const { items } = await ProductService.search(
            { text: 'Inactive Test Product' },
            false,
        );
        const found = items.some((p) => p.id === testProductId);
        expect(found).toBe(false);
    });

    it('search with admin flag includes inactive products', async () => {
        const { items } = await ProductService.search(
            { text: 'Inactive Test Product' },
            true,
        );
        const found = items.some((p) => p.id === testProductId);
        expect(found).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // getById
    // ---------------------------------------------------------------------------

    it('getById returns null for a non-existent id', async () => {
        const product = await ProductService.getById('000000000000000000000000', true);
        expect(product).toBeNull();
    });

    it('getById returns undefined for a falsy id', async () => {
        const product = await ProductService.getById(undefined, false);
        expect(product).toBeUndefined();
    });

    it('getById returns the product for an admin', async () => {
        const product = await ProductService.getById(testProductId, true);
        expect(product).not.toBeNull();
        expect(product!.id).toBe(testProductId);
    });

    it('getById returns null for non-admin when product is inactive', async () => {
        const product = await ProductService.getById(testProductId, false);
        expect(product).toBeNull();
    });

    // ---------------------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------------------

    /**
     * Remove the test product and disconnect from the database
     */
    afterAll(async () => {
        if (testProductId)
            await ProductService.remove(testProductId, true);
        return mongoose.disconnect();
    });
});
