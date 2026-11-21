/**
 * @module
 * `product.terms_changed` through the outbox: sent in the edit's own transaction when a setting
 * that decides availability moved (and on a restore), never for an edit that left them alone.
 * `inventory` listens and deletes the product's cached availability.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import { createProduct } from '@modules/products/tests/factories';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { productService } from '../../services';
import { PRODUCT_TERMS_CHANGED } from '../../events';

setupTestDb();

/** The `product.terms_changed` rows written so far, as aggregate ids. */
const announced = () =>
    outboxEventModel
        .find({ name: PRODUCT_TERMS_CHANGED })
        .lean()
        .exec()
        .then((rows) => rows.map((row) => row.aggregateId));

describe('product.terms_changed on an update', () => {
    it.each([
        ['active', { active: false }],
        ['purchasable', { purchasable: false }],
        ['allowBackorder', { allowBackorder: true }],
        ['releaseDate', { releaseDate: '2999-01-05' }],
        ['restockDate', { restockDate: '2999-01-05' }]
    ])('is sent when %s moves', async (_field, change) => {
        const product = await createProduct();

        await productService.updateById(String(product._id), change, callerContextAs('admin'));
        await settleOutboxNudges();

        expect(await announced()).toEqual([String(product._id)]);
    });

    it('is not sent for an edit that leaves them alone', async () => {
        const product = await createProduct();

        await productService.updateById(
            String(product._id),
            { price: '4.50', tags: ['sale'] },
            callerContextAs('admin')
        );
        await settleOutboxNudges();

        expect(await announced()).toEqual([]);
    });

    it('is not sent when a setting is written with the value it already has', async () => {
        const product = await createProduct({ active: true, purchasable: true });

        await productService.updateById(
            String(product._id),
            { active: true, purchasable: true },
            callerContextAs('admin')
        );
        await settleOutboxNudges();

        expect(await announced()).toEqual([]);
    });
});

describe('product.terms_changed on a restore', () => {
    it('is sent, because the product can be ordered again', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await productService.removeById(id, false);

        await productService.restoreById(id);
        await settleOutboxNudges();

        expect(await announced()).toEqual([id]);
    });
});
