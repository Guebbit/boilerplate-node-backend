/**
 * @module
 * A product write and its translation rows commit together or not at all, and the event the write
 * announces rides the transactional outbox. Real Mongo; the translation port is a double whose
 * `write` can be made to fail, standing in for a locales store that dies mid-write.
 * See docs/tools/outbox.md.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs, testCallerContext } from '@tests/callers';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { registerTranslationPort } from '@kernel/translation';
import { createProduct, readProduct } from '@modules/products/tests/factories';
import { productRepository } from '../../repository';
import { productService } from '../../services';
import type { ResponseSuccess } from '@infrastructure/http/response';
import type { ProductDocument } from '../../model';

setupTestDb();

/** `en` is the fallback locale in every environment this suite runs in. */
const FALLBACK = 'en';

/** What the port's `write` does; swapped per test. */
let write: jest.Mock;

beforeEach(() => {
    write = jest.fn(() => Promise.resolve());
    registerTranslationPort({
        resolve: () => Promise.resolve(new Map()),
        removeAll: () => Promise.resolve(0),
        search: () => Promise.resolve([]),
        plan: () =>
            Promise.resolve({
                fallbackLocale: FALLBACK,
                planned: [{ locale: FALLBACK, kind: 'upsert', fields: {} }]
            }),
        write: (...args) => write(...args) as Promise<void>,
        readAll: () => Promise.resolve(new Map())
    });
});

afterEach(() => {
    registerTranslationPort(undefined);
});

/** The outbox rows of one event name. */
const rowsNamed = (name: string) => outboxEventModel.find({ name }).lean();

describe('productService.create is one transaction', () => {
    it('leaves no product and no event when the translation write fails', async () => {
        write.mockRejectedValueOnce(new Error('translation store down'));

        await expect(
            productService.create(
                productService.zodProductCreateSchema.parse({
                    price: 12,
                    translations: { [FALLBACK]: { title: 'Standing Desk' } }
                }),
                testCallerContext
            )
        ).rejects.toThrow('translation store down');

        expect(await productRepository.count({})).toBe(0);
        expect(await rowsNamed('product.created')).toHaveLength(0);
    });

    it('commits the product, its translations and the event together', async () => {
        const result = (await productService.create(
            productService.zodProductCreateSchema.parse({
                price: 12,
                translations: { [FALLBACK]: { title: 'Standing Desk' } }
            }),
            callerContextAs('admin')
        )) as ResponseSuccess<ProductDocument>;

        await settleOutboxNudges();

        expect(write).toHaveBeenCalledTimes(1);
        expect(await productRepository.count({})).toBe(1);
        const rows = await rowsNamed('product.created');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            aggregateId: String(result.data._id),
            payload: { productId: String(result.data._id) }
        });
    });
});

describe('productService.create after its commit', () => {
    it('still answers the created product when the re-read that follows fails', async () => {
        jest.spyOn(productRepository, 'findById').mockRejectedValueOnce(
            new Error('read replica down')
        );

        const result = (await productService.create(
            productService.zodProductCreateSchema.parse({
                price: 12,
                translations: { [FALLBACK]: { title: 'Standing Desk' } }
            }),
            callerContextAs('admin')
        )) as ResponseSuccess<ProductDocument>;

        // The row is durable; only the nicety of re-reading it back failed, and is not the buyer's
        // (or the admin's) problem: the document the transaction wrote is the answer.
        expect(result.success).toBe(true);
        expect(await productRepository.count({})).toBe(1);
        jest.restoreAllMocks();
    });
});

describe('productService.updateById is one transaction', () => {
    it('keeps the old row when the translation write fails', async () => {
        const product = await createProduct({ title: 'Standing Desk', price: 10, active: true });
        write.mockRejectedValueOnce(new Error('translation store down'));

        await expect(
            productService.updateById(
                String(product._id),
                {
                    price: 99,
                    active: false,
                    translations: { [FALLBACK]: { title: 'Standing Desk' } }
                },
                testCallerContext
            )
        ).rejects.toThrow('translation store down');

        const stored = await readProduct(String(product._id));
        expect(stored).toMatchObject({ price: 10, active: true });
    });
});
