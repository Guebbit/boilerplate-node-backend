/**
 * @module
 * What `product.deleted` carries: the product's names by locale, read BEFORE a hard delete drops
 * the translation rows. A message that outlives the product (`notifications`) can only quote what
 * travelled with the event, so a title missing here is a title nobody can ever show.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import * as translation from '@kernel/translation';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { productService } from '../../services';
import { PRODUCT_DELETED } from '../../events';

setupTestDb();

/*
 * The translation port's two calls are recording wrappers around the real ones, not spies:
 * `jest.spyOn` cannot redefine the non-configurable property a CommonJS namespace import exposes
 * under the swc transform the mutation runs use.
 */
jest.mock('@kernel/translation', () => {
    const actual = jest.requireActual<typeof import('@kernel/translation')>('@kernel/translation');
    return {
        __esModule: true,
        ...actual,
        readAllTranslations: jest.fn(actual.readAllTranslations),
        removeTranslations: jest.fn(actual.removeTranslations)
    };
});

// A stub left on the port by one case would answer the next one's reads: put the real ones back.
afterEach(() => {
    const actual = jest.requireActual<typeof import('@kernel/translation')>('@kernel/translation');
    jest.mocked(translation.readAllTranslations)
        .mockReset()
        .mockImplementation(actual.readAllTranslations);
    jest.mocked(translation.removeTranslations)
        .mockReset()
        .mockImplementation(actual.removeTranslations);
});

describe('product.deleted titles', () => {
    const deleted = jest.fn();

    beforeEach(() => {
        resetDomainEvents();
        deleted.mockReset();
        onDomainEvent(PRODUCT_DELETED, deleted);
    });

    it('carries the fallback-language title of a hard-deleted product', async () => {
        const product = await createProduct({ title: 'Blue mug' });

        await productService.removeById(String(product._id), true);

        expect(deleted).toHaveBeenCalledWith(
            { productId: String(product._id), hardDelete: true, titles: { en: 'Blue mug' } },
            expect.anything()
        );
    });

    it('carries the title of a soft-deleted product too', async () => {
        const product = await createProduct({ title: 'Blue mug' });

        await productService.removeById(String(product._id), false);

        expect(deleted).toHaveBeenCalledWith(
            { productId: String(product._id), hardDelete: false, titles: { en: 'Blue mug' } },
            expect.anything()
        );
    });

    it('reads every language BEFORE the translations are removed', async () => {
        const product = await createProduct({ title: 'Blue mug' });
        const order: string[] = [];
        jest.mocked(translation.readAllTranslations).mockImplementation(() => {
            order.push('read');
            return Promise.resolve(
                new Map([
                    ['en', { title: 'Blue mug' }],
                    ['it', { title: 'Tazza blu' }]
                ])
            );
        });
        jest.mocked(translation.removeTranslations).mockImplementation(() => {
            order.push('remove');
            return Promise.resolve(2);
        });

        await productService.removeById(String(product._id), true);

        expect(order).toEqual(['read', 'remove']);
        expect(deleted).toHaveBeenCalledWith(
            expect.objectContaining({ titles: { en: 'Blue mug', it: 'Tazza blu' } }),
            expect.anything()
        );
    });

    it('does not emit for a soft delete repeated on an already-deleted product', async () => {
        const product = await createProduct({ title: 'Blue mug' });
        await productService.removeById(String(product._id), false);
        deleted.mockClear();

        await productService.removeById(String(product._id), false);

        expect(deleted).not.toHaveBeenCalled();
    });
});

describe('productService.titlesById', () => {
    it('answers the names of a product that still exists, soft-deleted included', async () => {
        const product = await createProduct({ title: 'Blue mug' });
        await productService.removeById(String(product._id), false);

        await expect(productService.titlesById(String(product._id))).resolves.toEqual({
            en: 'Blue mug'
        });
    });

    it('answers an empty map for a product that is gone', async () => {
        const product = await createProduct();
        await productService.removeById(String(product._id), true);

        await expect(productService.titlesById(String(product._id))).resolves.toEqual({});
    });

    it('lets a translated title win over the product column for its own language', async () => {
        const product = await createProduct({ title: 'Column title' });
        jest.mocked(translation.readAllTranslations).mockResolvedValueOnce(
            new Map([['en', { title: 'Translated title' }]])
        );

        await expect(productService.titlesById(String(product._id))).resolves.toEqual({
            en: 'Translated title'
        });
    });
});
