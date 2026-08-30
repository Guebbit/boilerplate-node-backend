/**
 * Concurrency: the cart and checkout endpoints.
 *
 *   R2 — checkout had NO condition tying the cart write to the cart read. `orderConfirm` read the
 *        lines, created an order from them, then emptied the cart; two parallel
 *        `POST /cart/checkout` both read the same lines and both wrote an order, so one cart
 *        became two orders and the customer was charged twice. A double-clicked button reaches it.
 *        Closed by `clearLinesIfUnchanged` — the cart is emptied conditionally on the `__v` it was
 *        read at, so exactly one checkout matches and the loser retracts its order and answers 409.
 *
 *   R3 — the cart upsert retry was correct, documented, and completely untested.
 *        `repositories/carts.ts` carries each condition IN THE FILTER and retries a duplicate key
 *        within a three-attempt budget, and the comment explains why it converges. Nothing
 *        exercised it: the retry branch, the `attemptsLeft` bound and `isDuplicateKey` were all
 *        live mutants. Nothing is fixed here — these cases are the tests that were missing, and
 *        they are the reference the R2 fix was modelled on.
 *
 * Cases 3 and 4 look similar and are not. Both fire N concurrent adds; case 3 sends ONE product,
 * case 4 sends N different ones. Only case 4 distinguishes a working `$ne`-in-filter design from a
 * broken one — the failure mode the repository comment names is "a cart with one product on two
 * lines", which a single-product race cannot tell apart from correct behaviour.
 */
import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/fixtures';
import { cartModel } from '@modules/cart/model';
import { orderModel } from '@modules/orders/model';
import { RACE_SIZE, countStatus, expectNoServerErrors, raceN } from '@tests/race';

setupTestDb();

describe('R3 — concurrent writes of the SAME product', () => {
    /*
     * `POST /cart` and `PUT /cart/:productId` both call `cartItemSetById`, i.e. they SET the
     * quantity rather than incrementing it. `upsertLine`'s `add` mode exists and is exercised by
     * the unit suite, but no route reaches it — so the invariant here is "one cart, one line",
     * not a sum. Asserting a sum would be asserting semantics the API does not have.
     */
    it('leaves one cart holding one line, never the same product twice', async () => {
        const { user, bearer } = await authenticateAs();
        const product = await createProduct();

        const results = await raceN(RACE_SIZE, () =>
            api()
                .post('/cart')
                .set('Authorization', bearer)
                .send({ productId: String(product._id), quantity: 1 })
        );

        expectNoServerErrors(results);
        // Every participant should get an answer, not just the one that created the cart.
        expect(countStatus(results, 200) + countStatus(results, 201)).toBe(RACE_SIZE);

        // One cart document — the unique `userId` index plus the retry, working together.
        expect(await cartModel.countDocuments({ userId: user._id })).toBe(1);

        const cart = await cartModel.findOne({ userId: user._id });
        // The line, once. Two participants both concluding "absent" and both appending is the
        // failure the `$ne`-in-filter guard prevents.
        expect(cart?.items).toHaveLength(1);
        expect(cart?.items[0]?.quantity).toBe(1);
    });
});

describe('R3 — concurrent adds of DIFFERENT products', () => {
    it('keeps every line, on one cart', async () => {
        // The case that would catch a regression in the `$ne`-in-filter design. With the guard
        // removed, two adds can both conclude "absent" and both append, and the symptom is a
        // duplicated line — which only a multi-product race separates from the case above.
        const { user, bearer } = await authenticateAs();
        const products = await Promise.all(
            Array.from({ length: RACE_SIZE }, (_, index) =>
                createProduct({ title: `Racer ${index}` })
            )
        );

        const results = await raceN(RACE_SIZE, (index) =>
            api()
                .post('/cart')
                .set('Authorization', bearer)
                .send({ productId: String(products[index]._id), quantity: 1 })
        );

        expectNoServerErrors(results);
        expect(await cartModel.countDocuments({ userId: user._id })).toBe(1);

        const cart = await cartModel.findOne({ userId: user._id });
        expect(cart?.items).toHaveLength(RACE_SIZE);

        // One line per product, not N lines for one product.
        const productIds = (cart?.items ?? []).map((item) => String(item.productId));
        expect(new Set(productIds).size).toBe(RACE_SIZE);
    });
});

describe('R3 — concurrent quantity writes to the same line', () => {
    it('settles on a value some ordering produces, never on a lost cart', async () => {
        // `set` mode, so the writes genuinely conflict rather than accumulate. The invariant is
        // not "which one won" — that is the database's business — but that the result is one of
        // the values actually sent, rather than a merge artefact or a second cart.
        const { user, bearer } = await authenticateAs();
        const product = await createProduct();

        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 1 });

        const quantities = Array.from({ length: RACE_SIZE }, (_, index) => index + 2);
        const results = await raceN(RACE_SIZE, (index) =>
            api()
                .put(`/cart/${String(product._id)}`)
                .set('Authorization', bearer)
                .send({ quantity: quantities[index] })
        );

        expectNoServerErrors(results);
        expect(await cartModel.countDocuments({ userId: user._id })).toBe(1);

        const cart = await cartModel.findOne({ userId: user._id });
        expect(cart?.items).toHaveLength(1);
        expect(quantities).toContain(cart?.items[0]?.quantity);
    });
});

describe('R2 — concurrent checkouts of one cart', () => {
    it('produces exactly one order, not one per request', async () => {
        // The bug this closes charges the customer twice.
        const { user, bearer } = await authenticateAs();
        const product = await createProduct();

        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 2 });

        const results = await raceN(RACE_SIZE, () =>
            api().post('/cart/checkout').set('Authorization', bearer)
        );

        expectNoServerErrors(results);
        expect(await orderModel.countDocuments({ userId: user._id })).toBe(1);
    });

    it('answers one success and rejects the rest with 409', async () => {
        const { bearer } = await authenticateAs();
        const product = await createProduct();

        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 2 });

        const results = await raceN(RACE_SIZE, () =>
            api().post('/cart/checkout').set('Authorization', bearer)
        );

        const successes = countStatus(results, 200) + countStatus(results, 201);
        expect(successes).toBe(1);
        expect(countStatus(results, 409)).toBe(RACE_SIZE - 1);
    });

    it('empties the cart exactly once', async () => {
        const { user, bearer } = await authenticateAs();
        const product = await createProduct();

        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 2 });

        await raceN(RACE_SIZE, () => api().post('/cart/checkout').set('Authorization', bearer));

        const cart = await cartModel.findOne({ userId: user._id });
        expect(cart?.items).toHaveLength(0);
    });

    it('leaves no order behind for a request that lost the race', async () => {
        // The loser has already written an order by the time the conditional cart write fails,
        // so it retracts it. Without that compensation the invariant above would still read
        // "one cart emptied" while the collection quietly held N orders.
        const { user, bearer } = await authenticateAs();
        const product = await createProduct({ price: 10 });

        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 3 });

        await raceN(RACE_SIZE, () => api().post('/cart/checkout').set('Authorization', bearer));

        const orders = await orderModel.find({ userId: user._id });
        expect(orders).toHaveLength(1);
        // And the surviving order is the whole cart, not a fragment of it.
        expect(orders[0]?.items[0]?.quantity).toBe(3);
    });

    it('still checks out normally when nothing is competing', async () => {
        // The conditional write must not make the ordinary, uncontended checkout fail.
        const { bearer } = await authenticateAs();
        const product = await createProduct();

        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 1 });

        const response = await api().post('/cart/checkout').set('Authorization', bearer);

        expect(response.status).toBeLessThan(300);
    });
});

describe('account deletion racing a cart write', () => {
    it('leaves no orphaned cart and no 5xx', async () => {
        // A cart is its own document keyed by `userId`, reachable only through the account, so a
        // cart that outlives its user is a row nothing can ever read or clean up.
        const { user, bearer } = await authenticateAs();
        const product = await createProduct();

        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 1 });

        const results = await raceN(4, (index) =>
            index === 0
                ? api().delete('/account').set('Authorization', bearer)
                : api()
                      .post('/cart')
                      .set('Authorization', bearer)
                      .send({ productId: String(product._id), quantity: 1 })
        );

        expectNoServerErrors(results);

        // Whatever the interleaving, a cart may only exist while its owner does.
        const carts = await cartModel.find({ userId: user._id });
        if (carts.length > 0) {
            const { userModel } = await import('@modules/users/model');
            expect(await userModel.countDocuments({ _id: user._id })).toBe(1);
        }
    });
});
