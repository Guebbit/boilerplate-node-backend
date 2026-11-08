/**
 * @module
 * `POST /cart/items` and `POST /cart/reorder` with an `Idempotency-Key`: a retry after a lost
 * answer replays the first one and the line grows once; a deliberate second click is a new key
 * and still adds (the "two clicks make two" promise of the contract).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { sendTwice } from '@tests/replay';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';

setupTestDb();

/** The caller adds one of `productId` under `key`. */
const add = (bearer: string, productId: string, key: string) =>
    api()
        .post('/cart/items')
        .set('Authorization', bearer)
        .set('Idempotency-Key', key)
        .send({ productId, quantity: 1 });

/** The caller reorders `orderId` under `key`. */
const reorder = (bearer: string, orderId: string, key: string) =>
    api()
        .post('/cart/reorder')
        .set('Authorization', bearer)
        .set('Idempotency-Key', key)
        .send({ orderId });

/** What the cart holds of the product, read back through `GET /cart`. */
const heldOf = (bearer: string, productId: string): Promise<number> =>
    api()
        .get('/cart')
        .set('Authorization', bearer)
        .then(
            (response) =>
                // supertest bodies are untyped; the contract says `items` is this shape.
                (response.body.items as { productId: string; quantity: number }[]).find(
                    (item) => item.productId === productId
                )?.quantity ?? 0
        );

describe('POST /cart/items with an Idempotency-Key', () => {
    it('adds the line once and replays the first answer to a retry', async () => {
        const { bearer } = await authenticateAs('user');
        const productId = await createProduct().then((product) => String(product._id));

        const { first, retry } = await sendTwice(() => add(bearer, productId, 'add-key-1'));

        expect(first.status).toBe(200);
        expect(retry.status).toBe(200);
        expect(retry.headers['idempotent-replayed']).toBe('true');
        expect(retry.body).toEqual(first.body);
        await expect(heldOf(bearer, productId)).resolves.toBe(1);
    });

    it('grows the line again for a new key: two clicks make two', async () => {
        const { bearer } = await authenticateAs('user');
        const productId = await createProduct().then((product) => String(product._id));

        await sendTwice(() => add(bearer, productId, 'add-key-1'));
        await add(bearer, productId, 'add-key-2');

        await expect(heldOf(bearer, productId)).resolves.toBe(2);
    });
});

describe('POST /cart/reorder with an Idempotency-Key', () => {
    it('adds the order once and replays the first answer to a retry', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 2)]);

        const { first, retry } = await sendTwice(() =>
            reorder(bearer, String(order._id), 'reorder-key-1')
        );

        expect(first.status).toBe(200);
        expect(retry.status).toBe(200);
        expect(retry.headers['idempotent-replayed']).toBe('true');
        await expect(heldOf(bearer, String(product._id))).resolves.toBe(2);
    });

    it('adds the order again for a new key', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 2)]);

        await sendTwice(() => reorder(bearer, String(order._id), 'reorder-key-1'));
        await reorder(bearer, String(order._id), 'reorder-key-2');

        await expect(heldOf(bearer, String(product._id))).resolves.toBe(4);
    });
});
