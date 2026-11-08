/**
 * @module
 * `POST /orders/{id}/timeline/notes` with an `Idempotency-Key`: a retry after a lost answer
 * replays the first entry, so staff never see the same note twice. A new key still writes.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { sendTwice } from '@tests/replay';
import { createProduct } from '@modules/products/tests/factories';
import { OrderStatus } from '@types';
import { createOrder, toOrderItem, timelineOf } from '../factories';

setupTestDb();

/** Staff leave `text` on the order under `key`. */
const leave = (orderId: string, bearer: string, key: string, text: string) =>
    api()
        .post(`/orders/${orderId}/timeline/notes`)
        .set('Authorization', bearer)
        .set('Idempotency-Key', key)
        .send({ text });

/** How many staff-note rows the order's timeline holds. */
const noteCount = (orderId: string): Promise<number> =>
    timelineOf(orderId, 'note_added').then((rows) => rows.length);

/** A paid order, and a staff bearer. */
const seed = async () => {
    const { user } = await authenticateAs('user');
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)], { status: OrderStatus.paid });
    const { bearer } = await authenticateAsRole('admin');
    return { orderId: String(order._id), bearer };
};

describe('POST /orders/{id}/timeline/notes with an Idempotency-Key', () => {
    it('writes one note and replays its answer to a retry', async () => {
        const { orderId, bearer } = await seed();

        const { first, retry } = await sendTwice(() =>
            leave(orderId, bearer, 'note-key-1', 'Called')
        );

        expect(first.status).toBe(201);
        expect(retry.status).toBe(201);
        expect(retry.headers['idempotent-replayed']).toBe('true');
        expect(retry.body).toEqual(first.body);
        expect(await noteCount(orderId)).toBe(1);
    });

    it('writes another note for a new key: two clicks make two', async () => {
        const { orderId, bearer } = await seed();

        await sendTwice(() => leave(orderId, bearer, 'note-key-1', 'Called'));
        await leave(orderId, bearer, 'note-key-2', 'Called');

        expect(await noteCount(orderId)).toBe(2);
    });
});
