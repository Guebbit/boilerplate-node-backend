import { connect, disconnect, clearAll } from '../../helpers/database';
import { createUser } from '../../helpers/factories/users';
import { createProduct, makeProduct } from '../../helpers/factories/products';
import * as productService from '@services/products';
import * as productRepository from '@repositories/products';
import * as userRepository from '@repositories/users';
import type { IResponseSuccess, IResponseReject } from '@utils/response';
import type { IUserDocument } from '@models/users';

// Mock the filesystem helper so tests never touch the real disk.
jest.mock('@utils/helpers-filesystem', () => ({
    deleteFile: jest.fn().mockResolvedValue(true),
    fileToBase64: jest.fn().mockResolvedValue('')
}));

beforeAll(connect);
afterAll(disconnect);
beforeEach(clearAll);

describe('productService.validateData', () => {
    it('returns an empty array for valid product data', () => {
        const errors = productService.validateData({
            title: 'A Valid Product', // >= 5 chars
            price: 19.99,
            imageUrl: 'https://example.com/product.jpg',
            active: true,
            description: 'Some description'
        });

        expect(errors).toHaveLength(0);
    });

    it('returns errors when the title is too short', () => {
        const errors = productService.validateData({
            title: 'Abc', // < 5 chars
            price: 9.99,
            imageUrl: 'https://example.com/img.jpg',
            active: true,
            description: ''
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('returns an error when the title is missing', () => {
        // price and imageUrl are valid so the only failure is the title
        const errors = productService.validateData({
            title: '',
            price: 9.99,
            imageUrl: 'https://example.com/img.jpg',
            active: true,
            description: ''
        });

        expect(errors.length).toBeGreaterThan(0);
    });
});

describe('productService.search', () => {
    it('returns only active products for non-admin callers', async () => {
        await createProduct({ title: 'Active Product', active: true });
        await createProduct({ title: 'Inactive Product', active: false });

        const result = await productService.search({}, false);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Active Product');
    });

    it('returns all products (including inactive) for admin callers', async () => {
        await createProduct({ title: 'Active', active: true });
        await createProduct({ title: 'Inactive', active: false });

        const result = await productService.search({}, true);

        expect(result.items).toHaveLength(2);
    });

    it('filters by text (searches title and description)', async () => {
        await createProduct({
            title: 'Fancy Widget',
            description: 'A shiny product',
            active: true
        });
        await createProduct({
            title: 'Plain Box',
            description: 'Nothing special',
            active: true
        });

        const result = await productService.search({ text: 'Fancy' }, false);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Fancy Widget');
    });

    it('filters by minimum price', async () => {
        await createProduct({ title: 'Cheap', price: 5, active: true });
        await createProduct({ title: 'Expensive', price: 100, active: true });

        const result = await productService.search({ minPrice: 50 }, false);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Expensive');
    });

    it('filters by maximum price', async () => {
        await createProduct({ title: 'Cheap', price: 5, active: true });
        await createProduct({ title: 'Expensive', price: 100, active: true });

        const result = await productService.search({ maxPrice: 10 }, false);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Cheap');
    });

    it('paginates results correctly', async () => {
        for (let i = 0; i < 5; i++) {
            await createProduct({ title: `Product ${i}`, active: true });
        }

        const page1 = await productService.search({ page: 1, pageSize: 3 });
        const page2 = await productService.search({ page: 2, pageSize: 3 });

        expect(page1.items).toHaveLength(3);
        expect(page2.items).toHaveLength(2);
        expect(page1.meta.totalPages).toBe(2);
        expect(page1.meta.totalItems).toBe(5);
    });

    it('returns empty results when the collection is empty', async () => {
        const result = await productService.search({});

        expect(result.items).toHaveLength(0);
        expect(result.meta.totalItems).toBe(0);
    });

    it('excludes soft-deleted products for non-admin callers', async () => {
        await createProduct({ title: 'Visible', active: true });
        await createProduct({
            title: 'Deleted',
            active: true,
            deletedAt: new Date()
        });

        const result = await productService.search({}, false);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Visible');
    });
});

describe('productService.getById', () => {
    it('returns a lean product object for an active product (non-admin)', async () => {
        const product = await createProduct({ active: true });
        const id = product.id.toString();

        const found = await productService.getById(id, false);

        expect(found).not.toBeNull();
        expect(found!.title).toBe('Test Product');
        // Lean object — no instance save() method
        expect(typeof (found as unknown as { save?: unknown }).save).toBe('undefined');
    });

    it('returns null for an inactive product when called as non-admin', async () => {
        const product = await createProduct({ active: false });
        const id = product.id.toString();

        const found = await productService.getById(id, false);

        expect(found).toBeNull();
    });

    it('returns an inactive product when called as admin', async () => {
        const product = await createProduct({ active: false });
        const id = product.id.toString();

        const found = await productService.getById(id, true);

        expect(found).not.toBeNull();
    });

    it('returns undefined when no id is provided', async () => {
        // eslint-disable-next-line unicorn/no-useless-undefined
        expect(await productService.getById(undefined)).toBeUndefined();
    });
});

describe('productService.create', () => {
    it('inserts a product and returns the persisted record', async () => {
        const product = await productService.create({
            title: 'New Product',
            price: 29.99,
            imageUrl: 'https://example.com/img.jpg',
            active: false,
            description: 'A brand-new product.'
        });

        expect(product.id).toBeDefined();
        expect(product.title).toBe('New Product');
        expect(await productRepository.count()).toBe(1);
    });
});

describe('productService.update', () => {
    it('updates title, price and description of an existing product', async () => {
        const product = await createProduct();
        const id = product.id.toString();

        const updated = await productService.update(id, {
            title: 'Updated Title',
            price: 49.99,
            description: 'New description'
        });

        expect(updated.title).toBe('Updated Title');
        expect(updated.price).toBe(49.99);
        expect(updated.description).toBe('New description');
    });

    it('changes the active flag', async () => {
        const product = await createProduct({ active: true });
        const id = product.id.toString();

        const updated = await productService.update(id, { active: false });

        expect(updated.active).toBe(false);
    });

    it('updates the imageUrl and triggers deleteFile for the old image', async () => {
        const { deleteFile } = jest.requireMock<{ deleteFile: jest.Mock }>(
            '@utils/helpers-filesystem'
        );

        const product = await createProduct({ imageUrl: '/images/old.jpg' });
        const id = product.id.toString();

        await productService.update(id, { imageUrl: '/images/new.jpg' });

        // The service should delete the OLD image after saving the new one
        expect(deleteFile).toHaveBeenCalledWith(expect.stringContaining('old.jpg'));
    });

    it('throws when the product does not exist', async () => {
        await expect(
            productService.update('000000000000000000000000', { title: 'X' })
        ).rejects.toThrow();
    });
});

describe('productService.remove', () => {
    it('soft-deletes a product by setting deletedAt', async () => {
        const product = await createProduct({ active: true });
        const id = product.id.toString();

        const result = await productService.remove(id, false);

        expect(result.success).toBe(true);
        const refreshed = await productRepository.findById(id);
        expect(refreshed!.deletedAt).toBeDefined();
    });

    it('restores a soft-deleted product when called again (toggle)', async () => {
        const product = await createProduct({ deletedAt: new Date() });
        const id = product.id.toString();

        await productService.remove(id, false);

        const restored = await productRepository.findById(id);
        expect(restored!.deletedAt).toBeUndefined();
    });

    it('hard-deletes the product and removes it from all user carts', async () => {
        const product = await createProduct({ active: true });
        const pid = product.id.toString();

        // A user adds the product to their cart
        const user = await createUser();
        const userId = user.id.toString();
        // eslint-disable-next-line unicorn/no-await-expression-member
        const addResult = await (await import('@services/users')).cartItemSetById(user, pid, 1);

        // Confirm the cart item was added
        expect((addResult as IResponseSuccess<IUserDocument>).data!.cart.items).toHaveLength(1);

        const result = await productService.remove(pid, true);

        expect(result.success).toBe(true);
        // Product must be gone from DB
        expect(await productRepository.findById(pid)).toBeNull();
        // User's cart must no longer contain the product
        const refreshedUser = await userRepository.findById(userId);
        if (refreshedUser) {
            expect(refreshedUser.cart.items.some((i) => i.product.toString() === pid)).toBe(false);
        }
    });

    it('returns a 404 rejection when the product does not exist', async () => {
        const result = await productService.remove('000000000000000000000000', false);

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(404);
    });
});
