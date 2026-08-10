import { Types } from 'mongoose';
import { setupTestDb } from '../../helpers/setup-test-db';
import { createUser } from '../../helpers/factories/users';
import { createProduct, makeProduct } from '../../helpers/factories/products';
import * as productService from '@services/products';
import { productRepository } from '@repositories/products';
import { cartRepository } from '@repositories/carts';
import type { IResponseReject } from '@core/http/response';
import type { IProductDocument } from '@models/products';

/**
 * Mock the image store, not the filesystem underneath it.
 *
 * What this service owes its collaborator is a *stored-image handle* — the `imageUrl` value — and
 * nothing about where those bytes live. Asserting on `deleteFile(publicPath + url)` instead would
 * pin the service to the filesystem backend: the test would keep passing while silently covering
 * the wrong thing the moment images move to a bucket. See `@core/adapters/image-store`.
 */
jest.mock('@core/adapters/image-store', () => ({
    imageStore: { remove: jest.fn().mockResolvedValue(true) }
}));

const { imageStore } = jest.requireMock<{ imageStore: { remove: jest.Mock } }>(
    '@core/adapters/image-store'
);

setupTestDb();

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

    /**
     * `openapi.yaml` declares `CreateProductRequest.price` with `minimum: 0`, and
     * `zodProductSchema` overrides the field for its i18n message. `.extend()` REPLACES a field,
     * so the override has to restate every constraint it wants to keep — the previous one did
     * not, and a negative price was accepted despite the contract forbidding it.
     */
    it('rejects a negative price, as the contract minimum requires', () => {
        const errors = productService.validateData({
            title: 'A Valid Product',
            price: -1,
            imageUrl: '/uploads/img.jpg',
            active: true,
            description: ''
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('accepts a price of exactly 0 — the minimum is inclusive', () => {
        const errors = productService.validateData({
            title: 'A Free Product',
            price: 0,
            imageUrl: '/uploads/img.jpg',
            active: true,
            description: ''
        });

        expect(errors).toHaveLength(0);
    });

    // These reach the validator because the controller does not coerce JSON bodies: `!!'not-a-
    // boolean'` or `coerceStringArray(42)` would turn each into a plausible value before
    // validation ran, and the endpoint would answer 201.
    it('rejects a wrong-typed active flag', () => {
        const errors = productService.validateData({
            title: 'A Valid Product',
            price: 10,
            imageUrl: '/uploads/img.jpg',
            active: 'not-a-boolean',
            description: ''
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it.each(['categories', 'tags'])('rejects a wrong-typed %s field', (field) => {
        const errors = productService.validateData({
            title: 'A Valid Product',
            price: 10,
            imageUrl: '/uploads/img.jpg',
            active: true,
            description: '',
            [field]: 42
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    // The contract says `uri-reference`, not `uri`: an uploaded image is stored as a path
    // relative to the API host, so requiring an absolute URL here would reject every upload.
    it('accepts a server-relative upload path as the imageUrl', () => {
        const errors = productService.validateData({
            title: 'A Valid Product',
            price: 10,
            imageUrl: '/uploads/1700000000-photo.jpg',
            active: true,
            description: ''
        });

        expect(errors).toHaveLength(0);
    });

    /**
     * The messages are what the API sends a client verbatim, so a wrong i18n key is a
     * user-visible bug — and the assertions above cannot see it, because a missing key makes
     * i18next return the key itself, which is still a non-empty string.
     *
     * That is exactly what had happened: `user-validation.ts` asked for `signup.user-field-*`
     * while `en.json` defined them under `login.*`, so every user whose email failed validation
     * was told "signup.user-field-email-invalid". A raw key is recognisable by shape — a dotted
     * identifier with no spaces — which is what this asserts against, so it keeps working when
     * the copy is reworded.
     */
    it('returns translated messages, never raw i18n keys', () => {
        const errors = productService.validateData({ title: 'ab', price: -5 });

        expect(errors.length).toBeGreaterThan(0);
        for (const message of errors) expect(message).not.toMatch(/^[a-z]+(?:\.[\da-z-]+)+$/);
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
        const id = (product._id as Types.ObjectId).toString();

        const found = await productService.getById(id, false);

        expect(found).not.toBeNull();
        expect(found!.title).toBe('Test Product');
        // A real Mongoose document — schema's toJSON transform normalizes it on the way out
        expect(typeof (found as unknown as { save: unknown }).save).toBe('function');
    });

    it('returns null for an inactive product when called as non-admin', async () => {
        const product = await createProduct({ active: false });
        const id = (product._id as Types.ObjectId).toString();

        const found = await productService.getById(id, false);

        expect(found).toBeNull();
    });

    it('returns an inactive product when called as admin', async () => {
        const product = await createProduct({ active: false });
        const id = (product._id as Types.ObjectId).toString();

        const found = await productService.getById(id, true);

        expect(found).not.toBeNull();
    });

    it('returns undefined when no id is provided', async () => {
        // eslint-disable-next-line unicorn/no-useless-undefined
        expect(await productService.getById(undefined)).toBeUndefined();
    });
});

describe('productService.create', () => {
    it('inserts a product and returns the Mongoose document', async () => {
        const product = await productService.create({
            title: 'New Product',
            price: 29.99,
            imageUrl: 'https://example.com/img.jpg',
            active: false,
            description: 'A brand-new product.'
        });

        expect(product._id).toBeDefined();
        expect(product.title).toBe('New Product');
        expect(await productRepository.count()).toBe(1);
    });
});

describe('productService.updateById', () => {
    it('updates title, price and description of an existing product', async () => {
        const product = await createProduct();
        const id = (product._id as Types.ObjectId).toString();

        const result = await productService.updateById(id, {
            title: 'Updated Title',
            price: 49.99,
            description: 'New description'
        });

        expect(result.success).toBe(true);
        const updated = (result as { data: IProductDocument }).data;
        expect(updated.title).toBe('Updated Title');
        expect(updated.price).toBe(49.99);
        expect(updated.description).toBe('New description');
    });

    it('changes the active flag', async () => {
        const product = await createProduct({ active: true });
        const id = (product._id as Types.ObjectId).toString();

        const result = await productService.updateById(id, { active: false });

        expect((result as { data: IProductDocument }).data.active).toBe(false);
    });

    it('updates the imageUrl and removes the old image from the store', async () => {
        const product = await createProduct({ imageUrl: '/images/old.jpg' });
        const id = (product._id as Types.ObjectId).toString();

        await productService.updateById(id, { imageUrl: '/images/new.jpg' });

        // The OLD image goes, and it goes by its stored url — the service must not construct a
        // path, because under a bucket backend there is none to construct.
        expect(imageStore.remove).toHaveBeenCalledWith('/images/old.jpg');
        expect(imageStore.remove).not.toHaveBeenCalledWith('/images/new.jpg');
    });

    /* The image is only replaced when a new one arrives; every other edit must leave it alone. */
    it('keeps the image when an update carries no imageUrl', async () => {
        const product = await createProduct({ imageUrl: '/images/keep.jpg' });
        const id = (product._id as Types.ObjectId).toString();

        const result = await productService.updateById(id, { title: 'Renamed Product' });

        expect(imageStore.remove).not.toHaveBeenCalled();
        expect((result as { data: IProductDocument }).data.imageUrl).toBe('/images/keep.jpg');
    });

    /* Re-submitting the same url is not a replacement — deleting here would delete the live image. */
    it('keeps the image when the update repeats the current imageUrl', async () => {
        const product = await createProduct({ imageUrl: '/images/same.jpg' });
        const id = (product._id as Types.ObjectId).toString();

        await productService.updateById(id, { imageUrl: '/images/same.jpg' });

        expect(imageStore.remove).not.toHaveBeenCalled();
    });

    it('reports a missing product as a 404 envelope, not as a rejection', async () => {
        /*
         * Returned, never thrown. Throwing made the one caller recognise the case by
         * string-matching `error.message === '404'` in a `.catch()`, where a genuine database
         * failure and a missing row were the same event. The user and order services already
         * reported it this way; now all three agree, which is what lets one controller shape
         * serve all of them.
         */
        const result = await productService.updateById('000000000000000000000000', { title: 'X' });

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });
});

describe('productService.update', () => {
    it('updates an existing product document directly', async () => {
        const product = await createProduct();

        const updated = await productService.update(product, {
            title: 'Direct Update',
            price: 99.99
        });

        expect(updated.title).toBe('Direct Update');
        expect(updated.price).toBe(99.99);
    });
});

describe('productService.removeById', () => {
    it('soft-deletes a product by setting deletedAt', async () => {
        const product = await createProduct({ active: true });
        const id = (product._id as Types.ObjectId).toString();

        const result = await productService.removeById(id, false);

        expect(result.success).toBe(true);
        const refreshed = await productRepository.findById(id);
        expect(refreshed!.deletedAt).toBeDefined();
    });

    it('restores a soft-deleted product when called again (toggle)', async () => {
        const product = await createProduct({ deletedAt: new Date() });
        const id = (product._id as Types.ObjectId).toString();

        await productService.removeById(id, false);

        const restored = await productRepository.findById(id);
        expect(restored!.deletedAt).toBeUndefined();
    });

    it('hard-deletes the product and removes it from all carts', async () => {
        const product = await createProduct({ active: true });
        const pid = (product._id as Types.ObjectId).toString();

        // A user adds the product to their cart
        const user = await createUser();
        const userId = (user._id as Types.ObjectId).toString();
        const cartService = await import('@services/cart');
        await cartService.cartItemSetById(userId, pid, 1);

        // Confirm the cart item was added
        expect(await cartService.cartGet(userId)).toHaveLength(1);

        const result = await productService.removeById(pid, true);

        expect(result.success).toBe(true);
        // Product must be gone from DB
        expect(await productRepository.findById(pid)).toBeNull();
        // The cart must no longer contain the product
        const cart = await cartRepository.findByUserId(userId);
        expect(cart!.items.some((item) => item.productId.toString() === pid)).toBe(false);
    });

    /* Hard delete is the only path that destroys bytes; the row is gone, so nothing else can. */
    it('removes the image from the store on a hard delete', async () => {
        const product = await createProduct({ imageUrl: '/images/doomed.jpg' });
        const id = (product._id as Types.ObjectId).toString();

        await productService.removeById(id, true);

        expect(imageStore.remove).toHaveBeenCalledWith('/images/doomed.jpg');
    });

    /**
     * A soft delete is reversible — `removeById(id, false)` on an already-deleted product restores
     * it — so deleting the image would restore a product with a broken one.
     */
    it('keeps the image on a soft delete', async () => {
        const product = await createProduct({ imageUrl: '/images/survives.jpg' });
        const id = (product._id as Types.ObjectId).toString();

        await productService.removeById(id, false);

        expect(imageStore.remove).not.toHaveBeenCalled();
    });

    it('returns a 404 rejection when the product does not exist', async () => {
        const result = await productService.removeById('000000000000000000000000', false);

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(404);
    });
});

describe('productService.remove', () => {
    it('soft-deletes a product document directly', async () => {
        const product = await createProduct({ active: true });
        const id = (product._id as Types.ObjectId).toString();

        const result = await productService.remove(product, false);

        expect(result.success).toBe(true);
        const refreshed = await productRepository.findById(id);
        expect(refreshed!.deletedAt).toBeDefined();
    });

    it('hard-deletes a product document directly', async () => {
        const product = await createProduct({ active: true });
        const pid = (product._id as Types.ObjectId).toString();

        const result = await productService.remove(product, true);

        expect(result.success).toBe(true);
        expect(await productRepository.findById(pid)).toBeNull();
    });
});
