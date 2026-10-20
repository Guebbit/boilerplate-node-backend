/**
 * @module
 * The release-date preview against the real save: for each case, the count the preview gives is
 * the emails the move then actually writes, counted in distinct orders. The same rule on both sides
 * is the point, so a table of cases is the test.
 *
 * Real Mongo and a real outbox, the mailer mocked at its queue.
 *
 * See: docs/modules/delivery.md#preorders-and-a-moved-date
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { productService } from '@modules/products';
import { fulfillmentOrdersOf, paidPreorderOrder } from '@modules/delivery/tests/factories';
import { deliveryService } from '@modules/delivery/services';
import deliveryModule from '@modules/delivery/module';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { markDomainEventsWired, resetDomainEvents } from '@kernel/events';
import { MISSING_ID } from '@tests/ids';
import { fulfillmentOrderModel } from '@modules/delivery/model';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    deliveryModule.subscribe();
    markDomainEventsWired();
});

afterEach(() => {
    resetDomainEvents();
    jest.clearAllMocks();
});

const DAY = 86_400_000;

/** A date `days` from now. */
const inDays = (days: number): Date => new Date(Date.now() + days * DAY);

/** What an admin does: change the product's release date, and let the outbox carry the news. */
const moveDate = async (productId: string, to: Date | null) => {
    await productService.updateById(
        productId,
        { releaseDate: to === null ? null : to.toISOString() },
        testCallerContext
    );
    await settleOutboxNudges();
};

/** The `delayed` events written so far. */
const delayedEvents = () =>
    outboxEventModel
        .find({ name: 'fulfillment_order.delayed' })
        .sort({ _id: 1 })
        .lean()
        .exec()
        .then((rows) => rows.map(({ payload }) => payload as { orderId: string }));

/** The count the written events add up to, in distinct orders. */
const countOf = (before: number) =>
    delayedEvents().then((all) => ({
        notify: new Set(all.slice(before).map(({ orderId }) => orderId)).size
    }));

/** What the preview says moving `productId` to `to` would do. */
const preview = (productId: string, to: Date | null) =>
    deliveryService.previewDateImpact(productId, 'preorder', to ?? undefined).then((result) => {
        if (!result.success) throw new Error('the preview was refused');
        return result.data;
    });

/** One order of `dates.length` preorder lines, one product each, with its fulfillment order made. */
const preorder = async (...dates: Date[]) => {
    const placed = await paidPreorderOrder(
        dates.map((releaseDate) => ({ quantity: 1, releaseDate }))
    );
    await fulfillmentOrdersOf(placed.orderId);
    return placed;
};

/** The release date the product holds now, or `null` once cleared. */
const currentDate = (productId: string) =>
    productService.findByIdRaw(productId).then((product) => product?.releaseDate ?? null);

describe('the preview matches what the save then does', () => {
    it.each([
        ['a later date', [30], undefined, 40, { notify: 1 }],
        ['a long slip', [30], undefined, 75, { notify: 1 }],
        ['a second slip, however small', [30], 35, 37, { notify: 1 }],
        ['an earlier date', [30], undefined, 10, { notify: 0 }],
        ['a cleared date', [30], undefined, null, { notify: 1 }],
        ['a cleared date, cleared again', [30], null, null, { notify: 0 }],
        ['the date it already has', [30], undefined, 'same', { notify: 0 }],
        ['the latest of a group moving later', [30, 32], undefined, 60, { notify: 1 }],
        ['one of a group moving earlier', [30, 32], undefined, 10, { notify: 0 }]
    ] as const)('%s', async (_name, initial, firstMove, to, expected) => {
        const { productIds } = await preorder(...initial.map((days) => inDays(days)));
        const productId = productIds[0];
        if (firstMove !== undefined)
            await moveDate(productId, firstMove === null ? null : inDays(firstMove));
        const before = await delayedEvents().then((events) => events.length);
        const target =
            to === 'same' ? await currentDate(productId) : to === null ? null : inDays(to);

        const previewed = await preview(productId, target);
        expect(await delayedEvents()).toHaveLength(before);

        await moveDate(productId, target);
        expect(previewed).toEqual(expected);
        expect(await countOf(before)).toEqual(previewed);
    });
});

describe('the preview', () => {
    it('answers a 404 for a product that does not exist', async () => {
        const result = await deliveryService.previewDateImpact(MISSING_ID, 'preorder', inDays(10));

        expect(result).toMatchObject({ success: false, status: 404 });
    });

    it('counts an order with several fulfillment orders to tell once', async () => {
        const { orderId, productIds } = await preorder(inDays(30));
        // A second group of the same order waiting on the same product: the same move tells both,
        // and the order counts once.
        const [first] = await fulfillmentOrdersOf(orderId);
        await fulfillmentOrderModel.create({
            ...first.toObject(),
            _id: undefined,
            number: first.number + 1
        });

        const previewed = await preview(productIds[0], inDays(40));

        expect(previewed).toEqual({ notify: 1 });
    });

    it('asks nothing: no question count, no deadline', async () => {
        const { productIds } = await preorder(inDays(30));

        const previewed = await preview(productIds[0], null);

        expect(previewed).toEqual({ notify: 1 });
        expect(previewed).not.toHaveProperty('ask');
        expect(previewed).not.toHaveProperty('answerBy');
    });
});
