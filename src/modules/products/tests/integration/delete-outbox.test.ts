/**
 * @module
 * `product.deleted` travels through the transactional outbox on both delete paths: the row exists
 * exactly when the delete committed, and a failing consumer is retried by the relay instead of
 * being logged and forgotten.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { markDomainEventsWired, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { outboxEventModel, relayOutbox, settleOutboxNudges } from '@kernel/outbox';
import { productRepository } from '../../repository';
import { productService } from '../../services';
import { PRODUCT_DELETED } from '../../events';

setupTestDb();

afterEach(() => {
    jest.restoreAllMocks();
});

/** The `product.deleted` rows, in any state. */
const rows = () => outboxEventModel.find({ name: PRODUCT_DELETED }).lean().exec();

describe('product.deleted through the outbox', () => {
    const deleted = jest.fn();

    beforeEach(() => {
        resetDomainEvents();
        // The relay only dispatches in a process where modules have subscribed.
        markDomainEventsWired();
        deleted.mockReset();
        onDomainEvent(PRODUCT_DELETED, deleted);
    });

    it.each([false, true])(
        'writes one row keyed on the product (hardDelete: %s) and delivers it',
        async (hardDelete) => {
            const product = await createProduct({ title: 'Blue mug' });
            const id = String(product._id);

            await productService.removeById(id, hardDelete);
            await settleOutboxNudges();

            const written = await rows();
            expect(written).toHaveLength(1);
            expect(written[0]).toMatchObject({ aggregateId: id, status: 'published' });
            expect(deleted).toHaveBeenCalledTimes(1);
            expect(deleted).toHaveBeenCalledWith(
                { productId: id, hardDelete, titles: { en: 'Blue mug' } },
                expect.objectContaining({ eventId: String(written[0]?._id) })
            );
        }
    );

    it.each([false, true])(
        'leaves no row and the product in place when the write fails (hardDelete: %s)',
        async (hardDelete) => {
            const product = await createProduct();
            const id = String(product._id);
            jest.spyOn(productRepository, hardDelete ? 'deleteOne' : 'save').mockRejectedValue(
                new Error('db blip')
            );

            await expect(productService.removeById(id, hardDelete)).rejects.toThrow('db blip');
            jest.restoreAllMocks();

            expect(await rows()).toHaveLength(0);
            expect(await productRepository.findById(id)).not.toBeNull();
        }
    );

    it('a throwing consumer leaves the row pending, and the relay retry delivers it', async () => {
        const product = await createProduct();
        deleted.mockRejectedValueOnce(new Error('cart blip'));

        await productService.removeById(String(product._id), false);
        await settleOutboxNudges();

        expect(await rows()).toMatchObject([{ status: 'pending', attempts: 1 }]);

        await outboxEventModel.updateMany({}, { $set: { nextAttemptAt: new Date(0) } }).exec();
        expect(await relayOutbox()).toMatchObject({ published: 1 });
        expect(deleted).toHaveBeenCalledTimes(2);
    });

    it('announces nothing for a soft delete repeated on a deleted product', async () => {
        const product = await createProduct();
        await productService.removeById(String(product._id), false);
        await settleOutboxNudges();

        await productService.removeById(String(product._id), false);
        await settleOutboxNudges();

        expect(await rows()).toHaveLength(1);
    });
});
