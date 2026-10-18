/**
 * @module
 * The release-date preview against the real save: for each case, the counts the preview gives are
 * the notices and questions the move then actually writes, counted in distinct orders. The same
 * rule on both sides is the point, so a table of cases is the test.
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
        .then((rows) =>
            rows.map(({ payload }) => payload as { orderId: string; needsAnswer: boolean })
        );

/** The counts the written events add up to, in distinct orders; an order asked and told is asked. */
const countsOf = async (before: number) => {
    const all = await delayedEvents();
    const events = all.slice(before);
    const asked = new Set(
        events.filter(({ needsAnswer }) => needsAnswer).map(({ orderId }) => orderId)
    );
    const told = new Set(
        events.filter(({ needsAnswer }) => !needsAnswer).map(({ orderId }) => orderId)
    );
    return { notify: [...told].filter((id) => !asked.has(id)).length, ask: asked.size };
};

/** What the preview says moving `productId` to `to` would do. */
const preview = (productId: string, to: Date | null) =>
    deliveryService.previewDateImpact(productId, 'preorder', to ?? undefined).then((result) => {
        if (!result.success) throw new Error('the preview was refused');
        const { notify, ask } = result.data;
        return { notify, ask };
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
        ['a first slip within 28 days', [30], undefined, 40, { notify: 1, ask: 0 }],
        ['a first slip past 28 days', [30], undefined, 75, { notify: 0, ask: 1 }],
        ['a second slip, however small', [30], 35, 37, { notify: 0, ask: 1 }],
        ['an earlier date', [30], undefined, 10, { notify: 0, ask: 0 }],
        ['a cleared date', [30], undefined, null, { notify: 0, ask: 1 }],
        ['a cleared date, cleared again', [30], null, null, { notify: 0, ask: 0 }],
        ['the date it already has', [30], undefined, 'same', { notify: 0, ask: 0 }],
        ['the latest of a group moving later', [30, 32], undefined, 60, { notify: 0, ask: 1 }],
        ['one of a group moving earlier', [30, 32], undefined, 10, { notify: 0, ask: 0 }]
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
        expect(await countsOf(before)).toEqual(previewed);
    });
});

describe('the preview', () => {
    it('answers a 404 for a product that does not exist', async () => {
        const result = await deliveryService.previewDateImpact(MISSING_ID, 'preorder', inDays(10));

        expect(result).toMatchObject({ success: false, status: 404 });
    });

    it('counts an order with a notice AND a question once, under ask', async () => {
        const { orderId, productIds } = await preorder(inDays(30));
        // A second group of the same order waiting on the same product, already slipped once: the
        // same move is a notice for the first group and a question for this one.
        const [first] = await fulfillmentOrdersOf(orderId);
        await fulfillmentOrderModel.create({
            ...first.toObject(),
            _id: undefined,
            number: first.number + 1,
            slips: 1
        });

        const previewed = await preview(productIds[0], inDays(40));

        expect(previewed).toEqual({ notify: 0, ask: 1 });
    });

    it('names the deadline a question would carry', async () => {
        const { productIds } = await preorder(inDays(30));
        const now = new Date('2026-12-01T00:00:00Z');

        const result = await deliveryService.previewDateImpact(
            productIds[0],
            'preorder',
            undefined,
            now
        );

        expect(result).toMatchObject({
            success: true,
            data: { answerBy: '2026-12-31T00:00:00.000Z' }
        });
    });
});
