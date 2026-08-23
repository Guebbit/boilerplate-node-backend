/**
 * Concurrency: the wishlist endpoints.
 *
 * `wishlist/repository.ts` carries no retry budget where `cart/repository.ts` carries one, and
 * argues that from the shape of its writes rather than from the wishlist being simpler. These are
 * the cases that hold it to the argument: a claim about contention is worth exactly what contends
 * with it, which is why `cart-races.test.ts` exists for the other half of the same reasoning.
 *
 *   RW1 — the LINE. `$addToSet` settles it: a set cannot hold the same member twice, so no
 *         interleaving of saves puts one product on two lines. Goes red the day anyone swaps it
 *         for `$push` on a "the service already checks" argument.
 *
 *   RW2 — the DOCUMENT. `$addToSet` says nothing about it: N first-time saves all find no
 *         wishlist and all let `upsert` create one. It holds because the filter is an exact
 *         equality on `userId`, the unique index's own key, which mongod resolves atomically —
 *         and it is NOT a general property of upserting under a unique index. The cart's second
 *         step filters `{ userId, 'items.productId': { $ne } }`, is therefore not an exact match,
 *         and does lose; that is the difference the two repositories turn on. If this filter ever
 *         grows a condition, the losers start answering 409 — a status this contract does not
 *         declare, on the one operation that promises a repeat is not an error.
 *
 * Hence RW2 starting from an account with an EMPTY wishlist while RW1 does not: once the document
 * exists, `upsert` is never consulted and there is no document race left to run.
 */
import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factory';
import { wishlistModel } from '@modules/wishlist/model';
import { RACE_SIZE, countStatus, expectNoServerErrors, raceN } from '@tests/race';

setupTestDb();

describe('RW1 — concurrent saves of the SAME product', () => {
    it('leaves one wishlist holding one line', async () => {
        const { user, bearer } = await authenticateAs();
        const product = await createProduct();

        const results = await raceN(RACE_SIZE, () =>
            api()
                .post('/wishlist')
                .set('Authorization', bearer)
                .send({ productId: String(product._id) })
        );

        expectNoServerErrors(results);
        // Idempotence is the CONTRACT here, not a tolerated outcome: every participant is a save
        // that succeeded, because saving what is already saved is the state each one asked for.
        expect(countStatus(results, 200)).toBe(RACE_SIZE);

        expect(await wishlistModel.countDocuments({ userId: user._id })).toBe(1);
        const wishlist = await wishlistModel.findOne({ userId: user._id });
        expect(wishlist?.items).toHaveLength(1);
        expect(String(wishlist?.items[0]?.productId)).toBe(String(product._id));
    });
});

describe('RW1 — concurrent saves of DIFFERENT products', () => {
    it('keeps every line, on one wishlist', async () => {
        // The multi-product shape, for the same reason `cart-races.test.ts` carries one: a
        // single-product race cannot tell a working set-append from a broken one, because the
        // "one line" it asserts is also what a duplicate-losing implementation produces.
        const { user, bearer } = await authenticateAs();
        const products = await Promise.all(
            Array.from({ length: RACE_SIZE }, (_, index) =>
                createProduct({ title: `Raced ${String(index)}` })
            )
        );

        const results = await raceN(RACE_SIZE, (index) =>
            api()
                .post('/wishlist')
                .set('Authorization', bearer)
                .send({ productId: String(products[index]._id) })
        );

        expectNoServerErrors(results);
        expect(countStatus(results, 200)).toBe(RACE_SIZE);

        expect(await wishlistModel.countDocuments({ userId: user._id })).toBe(1);
        const wishlist = await wishlistModel.findOne({ userId: user._id });
        expect(wishlist?.items).toHaveLength(RACE_SIZE);
    });
});

describe('RW2 — the FIRST save, raced', () => {
    /*
     * The document race, and the only state it is reachable from. `authenticateAs()` creates a
     * fresh account, so there is no wishlist yet and every participant's `upsert` is a live
     * insert attempt.
     *
     * A losing upsert surfaces as E11000, which `databaseErrorInterpreter` answers 409 for —
     * below 500, so `expectNoServerErrors` would pass on a wishlist that had started rejecting
     * double-clicks. The 409 count is therefore asserted by value, the same discipline
     * `tests/support/race.ts` applies to 429.
     */
    it('answers every participant 200 and creates exactly one wishlist', async () => {
        const { user, bearer } = await authenticateAs();
        const product = await createProduct();

        expect(await wishlistModel.countDocuments({ userId: user._id })).toBe(0);

        const results = await raceN(RACE_SIZE, () =>
            api()
                .post('/wishlist')
                .set('Authorization', bearer)
                .send({ productId: String(product._id) })
        );

        expectNoServerErrors(results);
        expect(countStatus(results, 409)).toBe(0);
        expect(countStatus(results, 200)).toBe(RACE_SIZE);
        expect(await wishlistModel.countDocuments({ userId: user._id })).toBe(1);
    });
});

describe('a save and a move-to-cart on the same line', () => {
    /*
     * The two writes that touch one line from opposite ends. Whichever order they land in, the
     * outcomes that must NOT happen are the same: a second wishlist document, a duplicated line,
     * or a 5xx. The line itself may end up saved or moved — that is the race's honest result and
     * asserting either would be asserting an ordering the API never promised.
     *
     * What this deliberately does NOT assert is the CART's quantity. `wishlistMoveToCart` reads
     * "is it saved" and writes the cart before removing the line, so N concurrent moves of one
     * saved line all read "saved" and the cart is incremented N times. Making the removal the
     * claim instead would close it, and would contradict `openapi.yaml`'s move-to-cart
     * description — "the cart is written before the wishlist line is removed" — which is prose
     * three repos must be byte-identical on. It belongs with the other implementation details
     * that leaked into the shared contract; see `HANDOFF_BEOLD.md` §7.
     */
    it('never produces a second wishlist, a duplicate line, or a 5xx', async () => {
        const { user, bearer } = await authenticateAs();
        const product = await createProduct();
        await api()
            .post('/wishlist')
            .set('Authorization', bearer)
            .send({ productId: String(product._id) });

        const results = await raceN(RACE_SIZE, (index) =>
            index % 2 === 0
                ? api()
                      .post('/wishlist')
                      .set('Authorization', bearer)
                      .send({ productId: String(product._id) })
                : api()
                      .post(`/wishlist/${String(product._id)}/move-to-cart`)
                      .set('Authorization', bearer)
        );

        expectNoServerErrors(results);
        // Every participant either did its write or found the line already gone. 404 is the
        // documented answer to the second, so the two together must account for all of them.
        expect(countStatus(results, 200) + countStatus(results, 404)).toBe(RACE_SIZE);

        expect(await wishlistModel.countDocuments({ userId: user._id })).toBe(1);
        const wishlist = await wishlistModel.findOne({ userId: user._id });
        expect(wishlist?.items.length).toBeLessThanOrEqual(1);
    });
});
