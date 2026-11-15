/**
 * @module
 * The cart's line cap (`NODE_CART_MAX_LINES`): `GET /cart` is never paginated, so the number of
 * lines is bounded where a line is written. A NEW product is refused once the cart is full, a
 * line already held is never refused, and a merge or reorder reports `cart_full` per line instead
 * of failing. The cap is in the write's own filter, so it holds under concurrency too.
 *
 * @see docs/modules/cart.md#configuration
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { withEnvironmentOverrides } from '@tests/environment';
import { testCallerContext } from '@tests/callers';
import { asReject } from '@tests/response';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { cartService } from '../../services';
import { CART_MERGE_REFUSED } from '../../events';

setupTestDb();

/** The cap in these cases: small, so a case does not write a hundred lines. */
const CAP = 3;

/** Run `body` with the cap at {@link CAP}. */
const withCap = (body: () => Promise<void>) =>
    withEnvironmentOverrides({ NODE_CART_MAX_LINES: String(CAP) }, body);

/** Product ids, freshly created, in order. */
const products = (count: number) =>
    Promise.all(Array.from({ length: count }, () => createProduct())).then((made) => made);

/** The caller adds one of `productId`. */
const add = (bearer: string, productId: string) =>
    api().post('/cart/items').set('Authorization', bearer).send({ productId, quantity: 1 });

/** The product ids the caller's cart holds, read back through `GET /cart`. */
const heldIds = (bearer: string): Promise<string[]> =>
    api()
        .get('/cart')
        .set('Authorization', bearer)
        .then((response) =>
            // supertest bodies are untyped; the contract says `items` carry a `productId`.
            (response.body.items as { productId: string }[]).map(({ productId }) => productId)
        );

describe('POST /cart/items at the cap', () => {
    it('refuses a new product with a 409 and writes nothing', () =>
        withCap(async () => {
            const { bearer } = await authenticateAs('user');
            const made = await products(CAP + 1);
            for (const product of made.slice(0, CAP)) await add(bearer, String(product._id));

            const refused = await add(bearer, String(made[CAP]._id));

            expect(refused.status).toBe(409);
            expect(refused.body.errors[0].code).toBe('CART_LINE_LIMIT_REACHED');
            await expect(heldIds(bearer)).resolves.toHaveLength(CAP);
        }));

    it('still grows a line the full cart already holds', () =>
        withCap(async () => {
            const { bearer } = await authenticateAs('user');
            const made = await products(CAP);
            for (const product of made) await add(bearer, String(product._id));

            const grown = await add(bearer, String(made[0]._id));

            expect(grown.status).toBe(200);
        }));

    it('lets a new product in once a line is removed', () =>
        withCap(async () => {
            const { bearer } = await authenticateAs('user');
            const made = await products(CAP + 1);
            for (const product of made.slice(0, CAP)) await add(bearer, String(product._id));
            await api()
                .delete(`/cart/items/${String(made[0]._id)}`)
                .set('Authorization', bearer);

            const added = await add(bearer, String(made[CAP]._id));

            expect(added.status).toBe(200);
        }));

    it('never lets a burst of adds past the cap', () =>
        withCap(async () => {
            const { bearer } = await authenticateAs('user');
            const made = await products(8);

            await Promise.all(made.map((product) => add(bearer, String(product._id))));

            await expect(heldIds(bearer)).resolves.toHaveLength(CAP);
        }));
});

describe('setting a quantity through the service at the cap', () => {
    it('refuses a product the full cart does not hold, and answers 409', () =>
        withCap(async () => {
            const { user } = await authenticateAs('user');
            const made = await products(CAP + 1);
            for (const product of made.slice(0, CAP))
                await cartService.addItemById(user.id, String(product._id), 1);

            const refused = await cartService.setItemById(user.id, String(made[CAP]._id), 2);

            expect(asReject(refused).status).toBe(409);
            expect(asReject(refused).errors[0].code).toBe('CART_LINE_LIMIT_REACHED');
        }));
});

describe('merge into a full cart', () => {
    const announced = jest.fn();

    beforeEach(() => {
        resetDomainEvents();
        announced.mockReset();
        onDomainEvent(CART_MERGE_REFUSED, announced);
    });

    it('answers cart_full for a new product, adds it nowhere and leaves the inbox notice', () =>
        withCap(async () => {
            const { user } = await authenticateAs('user');
            const made = await products(CAP + 1);
            for (const product of made.slice(0, CAP))
                await cartService.addItemById(user.id, String(product._id), 1);
            const extra = made[CAP];

            const { lines } = await cartService.merge(
                user.id,
                [{ productId: String(extra._id), quantity: 2 }],
                testCallerContext
            );

            expect(lines).toMatchObject([
                { productId: String(extra._id), requested: 2, resulting: 0, reason: 'cart_full' }
            ]);
            expect(await cartService.get(user.id)).toHaveLength(CAP);
            expect(announced).toHaveBeenCalledWith(
                {
                    userId: user.id,
                    lines: [expect.objectContaining({ productId: String(extra._id), requested: 2 })]
                },
                expect.anything()
            );
        }));

    it('sums a product the full cart already holds, with no refusal', () =>
        withCap(async () => {
            const { user } = await authenticateAs('user');
            const made = await products(CAP);
            for (const product of made)
                await cartService.addItemById(user.id, String(product._id), 1);

            const { lines } = await cartService.merge(
                user.id,
                [{ productId: String(made[0]._id), quantity: 2 }],
                testCallerContext
            );

            expect(lines).toMatchObject([{ resulting: 3, reason: 'summed' }]);
            expect(announced).not.toHaveBeenCalled();
        }));

    it('fills the room that is left and reports cart_full for the rest, in request order', () =>
        withCap(async () => {
            const { user } = await authenticateAs('user');
            const made = await products(CAP + 2);
            await cartService.addItemById(user.id, String(made[0]._id), 1);

            const { lines } = await cartService.merge(
                user.id,
                made.slice(1).map((product) => ({ productId: String(product._id), quantity: 1 })),
                testCallerContext
            );

            expect(lines.map(({ reason }) => reason)).toEqual([
                undefined,
                undefined,
                'cart_full',
                'cart_full'
            ]);
            expect(await cartService.get(user.id)).toHaveLength(CAP);
        }));
});

/** The caller reorders `orderId`. */
const reorder = (bearer: string, orderId: string) =>
    api().post('/cart/reorder').set('Authorization', bearer).send({ orderId });

describe('POST /cart/reorder into a full cart', () => {
    it('answers 409 CART_LINE_LIMIT_REACHED when no line of the order fits', () =>
        withCap(async () => {
            const { bearer, user } = await authenticateAs('user');
            const made = await products(CAP + 1);
            for (const product of made.slice(0, CAP)) await add(bearer, String(product._id));
            const order = await createOrder(user, [toOrderItem(made[CAP], 1)]);

            const refused = await reorder(bearer, String(order._id));

            expect(refused.status).toBe(409);
            expect(refused.body.errors[0].code).toBe('CART_LINE_LIMIT_REACHED');
        }));

    it('answers 200 with cart_full on the lines that do not fit when some do', () =>
        withCap(async () => {
            const { bearer, user } = await authenticateAs('user');
            const made = await products(CAP + 1);
            for (const product of made.slice(0, CAP - 1)) await add(bearer, String(product._id));
            const order = await createOrder(user, [
                toOrderItem(made[CAP - 1], 1),
                toOrderItem(made[CAP], 1)
            ]);

            const answer = await reorder(bearer, String(order._id));

            expect(answer.status).toBe(200);
            expect(
                (answer.body.lines as { reason?: string }[]).map(({ reason }) => reason)
            ).toEqual([undefined, 'cart_full']);
        }));
});
