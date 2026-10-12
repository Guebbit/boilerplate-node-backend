/**
 * @module
 * `reap:delivery` against a real database: a hold note older than the window goes, a younger one
 * stays, nothing else on the fulfillment order moves, and a rerun changes nothing.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { OrderStatus } from '@types';
import { fulfillmentOrderModel } from '../../model';
import { scrubHoldNotes } from '../../services/retention';
import { fulfillmentOrdersOf } from '../factories';

setupTestDb();

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days the window is set to for these tests. */
const WINDOW_DAYS = 30;

beforeEach(() => setEnvironment({ NODE_HOLD_NOTE_RETENTION_DAYS: String(WINDOW_DAYS) }));

/** Counts the customers so each gets its own address. */
let customers = 0;

/** A held fulfillment order with a note, last changed `ageDays` ago (written past Mongoose's own clock). */
const heldAged = async (ageDays: number) => {
    customers += 1;
    const user = await createUser({ email: `hold-${customers}@example.com` });
    const product = await createProduct({ price: 10 });
    const order = await createOrder(user, [toOrderItem(product, 1)], {
        status: OrderStatus.processing
    });
    const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
    const updatedAt = new Date(Date.now() - ageDays * DAY_MS);
    // `timestamps: false`: place `updatedAt` by hand instead of letting Mongoose stamp it now.
    await fulfillmentOrderModel.updateOne(
        { _id: fulfillmentOrder._id },
        {
            $set: {
                status: 'on_hold',
                holdReason: 'high_risk',
                holdNote: 'rang twice, odd voice',
                updatedAt
            }
        },
        { timestamps: false }
    );
    return { id: fulfillmentOrder._id, updatedAt };
};

/** The stored fulfillment order, read raw. */
const stored = (id: unknown) => fulfillmentOrderModel.findById(id).lean().exec();

describe('scrubHoldNotes', () => {
    it('unsets a note older than the window and leaves the rest of the fulfillment order alone', async () => {
        const old = await heldAged(WINDOW_DAYS + 1);

        const scrubbed = await scrubHoldNotes();

        const after = await stored(old.id);
        expect(scrubbed).toBe(1);
        expect(after?.holdNote).toBeUndefined();
        expect(after).toMatchObject({ status: 'on_hold', holdReason: 'high_risk' });
        expect(after?.lines).toHaveLength(1);
        // The wipe is not a change: the clock it reads does not move.
        expect(after?.updatedAt).toEqual(old.updatedAt);
    });

    it('keeps a note inside the window', async () => {
        const recent = await heldAged(WINDOW_DAYS - 1);

        const scrubbed = await scrubHoldNotes();

        expect(scrubbed).toBe(0);
        expect(await stored(recent.id).then((one) => one?.holdNote)).toBe('rang twice, odd voice');
    });

    it('changes nothing the second time, and counts only fulfillment orders that held a note', async () => {
        await heldAged(WINDOW_DAYS + 5);
        await heldAged(WINDOW_DAYS + 6);

        const first = await scrubHoldNotes();
        const second = await scrubHoldNotes();

        expect([first, second]).toEqual([2, 0]);
    });

    it('measures the window from the date it is given', async () => {
        const fresh = await heldAged(1);

        const later = new Date(Date.now() + (WINDOW_DAYS + 1) * DAY_MS);

        expect(await scrubHoldNotes(later)).toBe(1);
        expect(await stored(fresh.id).then((one) => one?.holdNote)).toBeUndefined();
    });
});
