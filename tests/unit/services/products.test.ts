/**
 * ProductService – Integration tests
 *
 * Why deleteFile is mocked
 * ------------------------
 * ProductService.update() and ProductService.remove() delete image files from
 * the filesystem when a new image is provided or when a product is hard-deleted.
 * In tests we do not have real image files on disk, so we mock deleteFile to:
 *   1. Prevent spurious filesystem errors from cluttering test output.
 *   2. Verify that the service *calls* delete at the right moment (if needed).
 *
 * All other dependencies (repositories, user service) use the real in-memory
 * MongoDB — no other mocks are applied.
 *
 * jest.mock() calls are automatically hoisted to the top of the file by Jest,
 * so they take effect before any module is imported.
 */

import { Types } from 'mongoose';
import { connect, disconnect, clearAll } from '../../helpers/database';
import { createUser } from '../../helpers/factories/users';
import { createProduct, makeProduct } from '../../helpers/factories/products';
import * as ProductService from '@services/products';
import * as ProductRepository from '@repositories/products';
import * as UserRepository from '@repositories/users';
import type { IResponseSuccess, IResponseReject } from '@utils/response';
import type { IProductDocument } from '@models/products';

// Mock the filesystem helper so tests never touch the real disk.
// The mock is hoisted before imports by Jest's module system.
jest.mock('@utils/filesystem-helpers', () => ({
    deleteFile: jest.fn().mockResolvedValue(true),
    fileToBase64: jest.fn().mockResolvedValue(''),
}));

// ─── Lifecycle ───────────────────────────────────────────────────────────────

beforeAll(connect);
afterAll(disconnect);
beforeEach(clearAll);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const asSuccess = <T>(r: IResponseSuccess<T> | IResponseReject) =>
    r as IResponseSuccess<T>;

const asReject = (r: IResponseSuccess<unknown> | IResponseReject) =>
    r as IResponseReject;

// ─── validateData ─────────────────────────────────────────────────────────────

describe('ProductService.validateData', () => {
    it('returns an empty array for valid product data', () => {
        const errors = ProductService.validateData({
            title: 'A Valid Product',   // >= 5 chars
            price: 19.99,
            imageUrl: 'https://example.com/product.jpg',
            active: true,
            description: 'Some description',
        });

        expect(errors).toHaveLength(0);
    });

    it('returns errors when the title is too short', () => {
        const errors = ProductService.validateData({
            title: 'Abc',   // < 5 chars
            price: 9.99,
            imageUrl: 'https://example.com/img.jpg',
            active: true,
            description: '',
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('returns an error when the title is missing', () => {
        // price and imageUrl are valid so the only failure is the title
        const errors = ProductService.validateData({
            title: '',
            price: 9.99,
            imageUrl: 'https://example.com/img.jpg',
            active: true,
            description: '',
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('returns an error when imageUrl is empty', () => {
        const errors = ProductService.validateData({
            title: 'Valid Title',
            price: 9.99,
            imageUrl: '',
            active: true,
            description: '',
        });

        expect(errors.length).toBeGreaterThan(0);
    });
});

// ─── search ───────────────────────────────────────────────────────────────────

describe('ProductService.search', () => {
    it('returns only active products for non-admin callers', async () => {
        await createProduct({ title: 'Active Product', active: true });
        await createProduct({ title: 'Inactive Product', active: false });

        const result = await ProductService.search({}, false);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Active Product');
    });

    it('returns all products (including inactive) for admin callers', async () => {
        await createProduct({ title: 'Active', active: true });
        await createProduct({ title: 'Inactive', active: false });

        const result = await ProductService.search({}, true);

        expect(result.items).toHaveLength(2);
    });

    it('filters by text (searches title and description)', async () => {
        await createProduct({ title: 'Fancy Widget', description: 'A shiny product', active: true });
        await createProduct({ title: 'Plain Box', description: 'Nothing special', active: true });

        const result = await ProductService.search({ text: 'Fancy' }, false);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Fancy Widget');
    });

    it('filters by minimum price', async () => {
        await createProduct({ title: 'Cheap', price: 5, active: true });
        await createProduct({ title: 'Expensive', price: 100, active: true });

        const result = await ProductService.search({ minPrice: 50 }, false);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Expensive');
    });

    it('filters by maximum price', async () => {
        await createProduct({ title: 'Cheap', price: 5, active: true });
        await createProduct({ title: 'Expensive', price: 100, active: true });

        const result = await ProductService.search({ maxPrice: 10 }, false);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Cheap');
    });

    it('paginates results correctly', async () => {
        for (let i = 0; i < 5; i++) {
            await createProduct({ title: `Product ${i}`, active: true });
        }

        const page1 = await ProductService.search({ page: 1, pageSize: 3 });
        const page2 = await ProductService.search({ page: 2, pageSize: 3 });

        expect(page1.items).toHaveLength(3);
        expect(page2.items).toHaveLength(2);
        expect(page1.meta.totalPages).toBe(2);
        expect(page1.meta.totalItems).toBe(5);
    });

    it('returns empty results when the collection is empty', async () => {
        const result = await ProductService.search({});

        expect(result.items).toHaveLength(0);
        expect(result.meta.totalItems).toBe(0);
    });

    it('excludes soft-deleted products for non-admin callers', async () => {
        await createProduct({ title: 'Visible', active: true });
        await createProduct({ title: 'Deleted', active: true, deletedAt: new Date() });

        const result = await ProductService.search({}, false);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Visible');
    });
});

// ─── getById ──────────────────────────────────────────────────────────────────

describe('ProductService.getById', () => {
    it('returns a lean product object for an active product (non-admin)', async () => {
        const product = await createProduct({ active: true });
        const id      = (product._id as Types.ObjectId).toString();

        const found = await ProductService.getById(id, false);

        expect(found).not.toBeNull();
        expect(found!.title).toBe('Test Product');
        // Lean object — no Mongoose save() method
        expect(typeof (found as unknown as { save?: unknown }).save).toBe('undefined');
    });

    it('returns null for an inactive product when called as non-admin', async () => {
        const product = await createProduct({ active: false });
        const id      = (product._id as Types.ObjectId).toString();

        const found = await ProductService.getById(id, false);

        expect(found).toBeNull();
    });

    it('returns an inactive product when called as admin', async () => {
        const product = await createProduct({ active: false });
        const id      = (product._id as Types.ObjectId).toString();

        const found = await ProductService.getById(id, true);

        expect(found).not.toBeNull();
    });

    it('returns undefined when no id is provided', async () => {
        expect(await ProductService.getById(undefined)).toBeUndefined();
    });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('ProductService.create', () => {
    it('inserts a product and returns the Mongoose document', async () => {
        const product = await ProductService.create({
            title: 'New Product',
            price: 29.99,
            imageUrl: 'https://example.com/img.jpg',
            active: false,
            description: 'A brand-new product.',
        });

        expect(product._id).toBeDefined();
        expect(product.title).toBe('New Product');
        expect(await ProductRepository.count()).toBe(1);
    });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('ProductService.update', () => {
    it('updates title, price and description of an existing product', async () => {
        const product = await createProduct();
        const id      = (product._id as Types.ObjectId).toString();

        const updated = await ProductService.update(id, {
            title: 'Updated Title',
            price: 49.99,
            description: 'New description',
        });

        expect(updated.title).toBe('Updated Title');
        expect(updated.price).toBe(49.99);
        expect(updated.description).toBe('New description');
    });

    it('changes the active flag', async () => {
        const product = await createProduct({ active: true });
        const id      = (product._id as Types.ObjectId).toString();

        const updated = await ProductService.update(id, { active: false });

        expect(updated.active).toBe(false);
    });

    it('updates the imageUrl and triggers deleteFile for the old image', async () => {
        const { deleteFile } = jest.requireMock<{ deleteFile: jest.Mock }>('@utils/filesystem-helpers');

        const product = await createProduct({ imageUrl: '/images/old.jpg' });
        const id      = (product._id as Types.ObjectId).toString();

        await ProductService.update(id, {}, '/images/new.jpg');

        // The service should delete the OLD image after saving the new one
        expect(deleteFile).toHaveBeenCalledWith(expect.stringContaining('old.jpg'));
    });

    it('throws when the product does not exist', async () => {
        await expect(
            ProductService.update('000000000000000000000000', { title: 'X' }),
        ).rejects.toThrow();
    });
});

// ─── remove ───────────────────────────────────────────────────────────────────

describe('ProductService.remove', () => {
    it('soft-deletes a product by setting deletedAt', async () => {
        const product = await createProduct({ active: true });
        const id      = (product._id as Types.ObjectId).toString();

        const result = await ProductService.remove(id, false);

        expect(result.success).toBe(true);
        const refreshed = await ProductRepository.findById(id);
        expect(refreshed!.deletedAt).toBeDefined();
    });

    it('restores a soft-deleted product when called again (toggle)', async () => {
        const product = await createProduct({ deletedAt: new Date() });
        const id      = (product._id as Types.ObjectId).toString();

        await ProductService.remove(id, false);

        const restored = await ProductRepository.findById(id);
        expect(restored!.deletedAt).toBeUndefined();
    });

    it('hard-deletes the product and removes it from all user carts', async () => {
        const product = await createProduct({ active: true });
        const pid     = (product._id as Types.ObjectId).toString();

        // A user has the product in their cart
        const user = await createUser();
        await UserRepository.findById((user._id as Types.ObjectId).toString()).then(async (u) => {
            if (u) await ProductService.update(pid, {}); // just ensuring product exists
        });

        const addResult = await (await import('@services/users')).cartItemSetById(user, pid, 1);
        const userId = (asSuccess<IProductDocument>(addResult as unknown as IResponseSuccess<IProductDocument> | IResponseReject).data!._id as Types.ObjectId).toString();

        const result = await ProductService.remove(pid, true);

        expect(result.success).toBe(true);
        // Product must be gone from DB
        expect(await ProductRepository.findById(pid)).toBeNull();
        // User's cart must no longer contain the product
        const refreshedUser = await UserRepository.findById(userId);
        if (refreshedUser) {
            expect(
                refreshedUser.cart.items.some(i => i.product.toString() === pid),
            ).toBe(false);
        }
    });

    it('returns a 404 rejection when the product does not exist', async () => {
        const result = await ProductService.remove('000000000000000000000000', false);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(404);
    });
});
