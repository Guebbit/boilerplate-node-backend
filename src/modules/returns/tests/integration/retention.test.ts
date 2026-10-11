/**
 * @module
 * `reap:returns` against a real database: text older than the window goes, younger text stays,
 * nothing else on the return moves, and a rerun changes nothing.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { OrderStatus } from '@types';
import { returnModel } from '../../model';
import { returnRepository } from '../../repository';
import { scrubReturnText } from '../../services/retention';

setupTestDb();

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days the window is set to for these tests. */
const WINDOW_DAYS = 30;

beforeEach(() => setEnvironment({ NODE_RETURN_TEXT_RETENTION_DAYS: String(WINDOW_DAYS) }));

/** Counts the customers so each gets its own address. */
let customers = 0;

/** A return holding both texts, last changed `ageDays` ago (written past Mongoose's own clock). */
const returnAged = async (ageDays: number) => {
    customers += 1;
    const user = await createUser({ email: `reaper-${customers}@example.com` });
    const product = await createProduct({ title: 'Shirt', price: 30 });
    const order = await createOrder(user, [toOrderItem(product, 1)], {
        status: OrderStatus.delivered
    });
    const created = await returnModel.create({
        orderId: order._id,
        orderNumber: order.orderNumber ?? 'N-1',
        currency: 'EUR',
        status: 'declined',
        reason: 'defective',
        note: 'call me on 555-0100',
        declineReason: 'Looks worn',
        decidedAt: new Date('2026-01-02T00:00:00.000Z'),
        lines: [{ productId: product._id, quantity: 1, title: 'Shirt', unitPrice: 30 }],
        returnPostage: 'consumer'
    });
    const updatedAt = new Date(Date.now() - ageDays * DAY_MS);
    // `timestamps: false`: place `updatedAt` by hand instead of letting Mongoose stamp it now.
    await returnModel.updateOne(
        { _id: created._id },
        { $set: { updatedAt } },
        { timestamps: false }
    );
    return { id: String(created._id), updatedAt };
};

/** The stored return, read raw. */
const stored = (id: string) => returnModel.findById(id).lean().exec();

describe('scrubReturnText', () => {
    it('unsets both texts on a return past the window, and leaves everything else alone', async () => {
        const { id, updatedAt } = await returnAged(WINDOW_DAYS + 1);

        const scrubbed = await scrubReturnText();

        const row = await stored(id);
        expect(scrubbed).toBe(1);
        expect(row).not.toHaveProperty('note');
        expect(row).not.toHaveProperty('declineReason');
        expect(row).toMatchObject({
            status: 'declined',
            reason: 'defective',
            currency: 'EUR',
            lines: [expect.objectContaining({ quantity: 1, unitPrice: 30 })]
        });
        expect(row?.decidedAt).toEqual(new Date('2026-01-02T00:00:00.000Z'));
        expect(row?.updatedAt).toEqual(updatedAt);
    });

    it('keeps the text of a return still inside the window', async () => {
        const { id } = await returnAged(WINDOW_DAYS - 1);

        const scrubbed = await scrubReturnText();

        expect(scrubbed).toBe(0);
        expect(await stored(id)).toMatchObject({
            note: 'call me on 555-0100',
            declineReason: 'Looks worn'
        });
    });

    it('wipes a return holding only one of the two texts', async () => {
        const { id } = await returnAged(WINDOW_DAYS + 1);
        await returnModel.updateOne({ _id: id }, { $unset: { note: 1 } }, { timestamps: false });

        expect(await scrubReturnText()).toBe(1);
        expect(await stored(id)).not.toHaveProperty('declineReason');
    });

    it('wipes a return holding only a note', async () => {
        const { id } = await returnAged(WINDOW_DAYS + 1);
        await returnModel.updateOne(
            { _id: id },
            { $unset: { declineReason: 1 } },
            { timestamps: false }
        );

        expect(await scrubReturnText()).toBe(1);
        expect(await stored(id)).not.toHaveProperty('note');
    });

    it('changes nothing on a rerun', async () => {
        await returnAged(WINDOW_DAYS + 1);
        await scrubReturnText();

        expect(await scrubReturnText()).toBe(0);
    });

    it('honours the cutoff handed to the repository', async () => {
        const { id } = await returnAged(5);

        expect(await returnRepository.scrubFreeTextBefore(new Date(Date.now() - 10 * DAY_MS))).toBe(
            0
        );
        expect(await returnRepository.scrubFreeTextBefore(new Date())).toBe(1);
        expect(await stored(id)).not.toHaveProperty('note');
    });
});
