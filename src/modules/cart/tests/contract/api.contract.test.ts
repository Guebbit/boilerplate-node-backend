/**
 * @module
 * Contract tests for /cart. Every route requires authentication and answers the same
 * `CartResponseEnvelope` — six endpoints sharing one shape is the easiest place for
 * serialization drift to hide. The cart is built through the API, not a fixture builder:
 * `CartResponse` is a computed view, not a serialization of the document, so a hand-written
 * fixture would assert a shape the app never produces. Behavioural rules belong to the service
 * suites; these assertions exist to make sure each contract branch is reached.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { withEnvironment, withoutEnvironment } from '@tests/environment';
import { giveAddress } from '@modules/addresses/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { MISSING_ID } from '@tests/ids';

setupTestDb();

/**
 * Logs a user in and puts one product in their cart, returning both. The account keeps one
 * address, since every checkout order carries a billing address.
 */
const authenticateWithCart = async (quantity = 2) => {
    const { bearer, user } = await authenticateAs('user');
    await giveAddress(user.id);
    const product = await createProduct();
    const response = await api()
        .post('/cart')
        .set('Authorization', bearer)
        .send({ productId: String(product._id), quantity });

    if (response.status !== 201)
        throw new Error(
            `cart setup failed: POST /cart returned ${response.status} — ${JSON.stringify(response.body)}`
        );

    return { bearer, product };
};

describe('GET /cart', () => {
    it('matches the contract for an empty cart', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().get('/cart').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
    });

    it('matches the contract for a cart holding items', async () => {
        const { bearer } = await authenticateWithCart();
        const response = await api().get('/cart').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(1);
    });
});

describe('POST /cart', () => {
    it('matches the contract when adding an item', async () => {
        const { bearer } = await authenticateAs('user');
        const product = await createProduct();
        const response = await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 3 });

        expect(response.status).toBe(201);
        expect(response.headers.location).toBe(`/cart/${String(product._id)}`);
        expect(response.body.data.summary.totalQuantity).toBe(3);
    });

    // "Add to cart" GROWS a line already there (Shopify, commercetools) — the same button
    // pressed twice makes two — and answers 200, because nothing was created.
    it('grows an existing line, answering 200 with no Location', async () => {
        const { bearer, product } = await authenticateWithCart(2);

        const response = await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 3 });

        expect(response.status).toBe(200);
        expect(response.headers.location).toBeUndefined();
        expect(response.body.data.summary.totalQuantity).toBe(5);
    });

    it('422s an add that would push a line past the per-line ceiling', async () => {
        const { bearer, product } = await authenticateWithCart(999);

        const response = await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 1 });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].code).toBe('CART_QUANTITY_LIMIT');
    });

    it('matches the error contract for a product that does not exist', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: MISSING_ID, quantity: 1 });

        expect(response.status).toBe(404);
    });

    it('matches the error contract for a product outside the public catalogue', async () => {
        // A real row with a well-formed id, which is what separates this from the case above:
        // the 404 is the SCOPE refusing it, not the id matching nothing.
        const { bearer } = await authenticateAs('user');
        const hidden = await createProduct({ active: false });
        const response = await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(hidden._id), quantity: 1 });

        expect(response.status).toBe(404);
    });
});

/**
 * Staff and administrators do not shop: `cart.self.update` is held by the shopper roles only, so
 * the basket answers 403 to a role that is not one — and a shopper, verified or not, still uses it.
 */
describe('POST /cart — who may shop', () => {
    it.each(['manager', 'warehouse', 'support', 'editor', 'moderator', 'admin'])(
        'refuses a %s with a 403',
        async (role) => {
            const { bearer } = await authenticateAsRole(role);
            const product = await createProduct();

            const response = await api()
                .post('/cart')
                .set('Authorization', bearer)
                .send({ productId: String(product._id), quantity: 1 });

            expect(response.status).toBe(403);
            expect(response.body.errors[0].code).toBe('FORBIDDEN');
        }
    );

    it.each(['customer', 'unverified'])('lets a %s add to the basket', async (role) => {
        const { bearer } = await authenticateAsRole(role);
        const product = await createProduct();

        const response = await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 1 });

        expect(response.status).toBe(201);
    });
});

describe('DELETE /cart', () => {
    it('matches the contract when removing one product through the body, leaving the rest', async () => {
        // Two lines, so "removed that one" and "cleared everything" produce different lengths —
        // `authenticateWithCart` alone seeds one line, which can't tell the two apart.
        const { bearer, product } = await authenticateWithCart();
        const second = await createProduct();
        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(second._id), quantity: 1 });

        const response = await api()
            .delete('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id) });

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(1);
    });

    it('matches the error contract for a missing body', async () => {
        // `x-alias-of: removeCartItem` — the required `productId` is what makes this route a
        // single-item remove rather than the clear-all `DELETE /cart/all` now is.
        const { bearer } = await authenticateWithCart();
        const response = await api().delete('/cart').set('Authorization', bearer);

        expect(response.status).toBe(422);
    });

    it('matches the error contract for a product that is not in the cart', async () => {
        const { bearer } = await authenticateWithCart();
        const response = await api()
            .delete('/cart')
            .set('Authorization', bearer)
            .send({ productId: MISSING_ID });

        expect(response.status).toBe(404);
    });
});

describe('DELETE /cart/all', () => {
    it('matches the contract when clearing the whole cart', async () => {
        const { bearer } = await authenticateWithCart();
        const response = await api().delete('/cart/all').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
    });
});

describe('PUT /cart/{productId}', () => {
    it('matches the contract when setting a quantity', async () => {
        const { bearer, product } = await authenticateWithCart();
        const response = await api()
            .put(`/cart/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ quantity: 5 });

        expect(response.status).toBe(200);
        expect(response.body.data.summary.totalQuantity).toBe(5);
    });

    // RFC 9110 §9.3.4: a PUT that creates the resource answers 201. The cart line's URI is the
    // caller's own by construction, so this is the one PUT allowed to create.
    it('creates a missing line with 201 and its Location', async () => {
        const { bearer } = await authenticateAs('user');
        const product = await createProduct();

        const response = await api()
            .put(`/cart/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ quantity: 4 });

        expect(response.status).toBe(201);
        expect(response.headers.location).toBe(`/cart/${String(product._id)}`);
        expect(response.body.data.summary.totalQuantity).toBe(4);
    });

    it('sets rather than adds: repeating the same PUT leaves the same cart', async () => {
        const { bearer, product } = await authenticateWithCart(2);
        const send = () =>
            api()
                .put(`/cart/${String(product._id)}`)
                .set('Authorization', bearer)
                .send({ quantity: 5 });

        const first = await send();
        const second = await send();

        expect(second.status).toBe(200);
        expect(second.body.data.summary.totalQuantity).toBe(first.body.data.summary.totalQuantity);
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer, product } = await authenticateWithCart();
        const response = await api()
            .put(`/cart/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ quantity: 0 });

        expect(response.status).toBe(422);
    });

    it('matches the error contract for a product that does not exist', async () => {
        // The declared 404 on this operation is only reachable because the gate lives in
        // `cartItemSetById`: nothing in the route itself asks the catalogue anything.
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .put(`/cart/${MISSING_ID}`)
            .set('Authorization', bearer)
            .send({ quantity: 1 });

        expect(response.status).toBe(404);
    });

    it('matches the error contract for a product outside the public catalogue', async () => {
        const { bearer } = await authenticateAs('user');
        const hidden = await createProduct({ active: false });
        const response = await api()
            .put(`/cart/${String(hidden._id)}`)
            .set('Authorization', bearer)
            .send({ quantity: 1 });

        expect(response.status).toBe(404);
    });
});

describe('PUT /cart/shipping-method', () => {
    it('matches the contract when choosing a method that fits the basket', async () => {
        const { bearer } = await authenticateWithCart();
        const response = await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'standard' });

        expect(response.status).toBe(200);
        expect(response.body.data.shipping.selected).toBe('standard');
        expect(response.body.data.summary.shippingCost).toBeGreaterThanOrEqual(0);
    });

    it('matches the contract when clearing the choice with null', async () => {
        const { bearer } = await authenticateWithCart();
        await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'standard' });

        const response = await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: null });

        expect(response.status).toBe(200);
        expect(response.body.data.shipping.selected).toBeNull();
    });

    it('matches the error contract for an unknown method', async () => {
        const { bearer } = await authenticateWithCart();
        const response = await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'teleport' });

        expect(response.status).toBe(404);
    });

    it('matches the error contract for a digital-only basket', async () => {
        const { bearer } = await authenticateAs('user');
        const digital = await createProduct({ requiresShipping: false });
        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(digital._id), quantity: 1 });

        const response = await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'standard' });

        expect(response.status).toBe(409);
    });

    it("matches the error contract for a basket outside the method's weight range", async () => {
        const { bearer } = await authenticateAs('user');
        // express's ceiling is 5000g.
        const heavy = await createProduct({ weight: 6000, requiresShipping: true });
        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(heavy._id), quantity: 1 });

        const response = await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'express' });

        expect(response.status).toBe(409);
    });

    it('matches the error contract for a malformed body', async () => {
        const { bearer } = await authenticateWithCart();
        const response = await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({});

        expect(response.status).toBe(422);
    });
});

describe('DELETE /cart/{productId}', () => {
    it('matches the contract when removing an item', async () => {
        const { bearer, product } = await authenticateWithCart();
        const response = await api()
            .delete(`/cart/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
    });

    it('matches the error contract for a malformed product id', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().delete('/cart/not-an-id').set('Authorization', bearer);

        // A path id: the same 404 a product that is not in the cart gets.
        expect(response.status).toBe(404);
    });
});

describe('GET /cart/summary', () => {
    it('matches the contract for an empty cart', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().get('/cart/summary').set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('matches the contract for a cart holding items', async () => {
        const { bearer } = await authenticateWithCart();
        const response = await api().get('/cart/summary').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.itemsCount).toBe(1);
    });

    // `currency` is now required on the summary, empty cart included — the automatic
    // contract check already enforces this; asserted directly too, since a required-but-empty
    // string would still satisfy the schema.
    it('always carries the shop currency, even on an empty cart', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().get('/cart/summary').set('Authorization', bearer);

        expect(response.body.data.currency).toBe('EUR');
    });
});

describe('POST /cart/checkout', () => {
    it('matches the contract when the cart becomes an order', async () => {
        const { bearer } = await authenticateWithCart();
        await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'pickup' });
        const response = await api().post('/cart/checkout').set('Authorization', bearer).send({});

        // `data` is the created order itself, as `POST /orders` answers it — not a
        // wrapper — and `Location` names it.
        expect(response.status).toBe(201);
        expect(response.body.data.items).toHaveLength(1);
        expect(response.body.data.order).toBeUndefined();
        expect(response.headers.location).toBe(`/orders/${String(response.body.data.id)}`);
    });

    /*
     * Before the checkout route carried `idempotencyKey`, a retry after a lost response saw
     * the (by-then-empty) cart and answered `CART_EMPTY` instead of the order the first attempt
     * actually placed — the buyer's own cart write cost them the order. The stock read pins the
     * other half: a replayed request must not reserve the basket a second time.
     */
    it('replays the same order for a checkout retried with the same Idempotency-Key', async () => {
        const { bearer, product } = await authenticateWithCart(2);
        await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'pickup' });

        const before = await api().get(`/products/${String(product._id)}`);
        const requestBody = {};

        const first = await api()
            .post('/cart/checkout')
            .set('Authorization', bearer)
            .set('Idempotency-Key', 'checkout-replay-key-1')
            .send(requestBody);
        expect(first.status).toBe(201);

        // Without `idempotencyKey`, this second call would hit the now-empty cart and answer
        // `CART_EMPTY` instead of replaying — see this test's own docblock.
        const second = await api()
            .post('/cart/checkout')
            .set('Authorization', bearer)
            .set('Idempotency-Key', 'checkout-replay-key-1')
            .send(requestBody);

        expect(second.status).toBe(201);
        expect(second.headers['idempotent-replay']).toBe('true');
        expect(second.body).toEqual(first.body);

        // One order, not two.
        const orders = await api().get('/orders').set('Authorization', bearer);
        expect(orders.body.data.items).toHaveLength(1);

        // The basket's stock was reserved once, not twice, by the replay.
        const after = await api().get(`/products/${String(product._id)}`);
        expect(after.body.data.available).toBe(before.body.data.available - 2);
    });

    /*
     * The controller cast `request.body` instead of parsing it against the contract, so
     * `notes` — a field the contract has always declared — never reached the order.
     */
    it('wires notes through to the order', async () => {
        const { bearer } = await authenticateWithCart();
        await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'pickup' });
        const response = await api()
            .post('/cart/checkout')
            .set('Authorization', bearer)
            .send({ notes: 'Leave with the concierge' });

        expect(response.status).toBe(201);
        expect(response.body.data.notes).toBe('Leave with the concierge');
    });

    it('matches the error contract for an unrecognised payment method value', async () => {
        const { bearer } = await authenticateWithCart();
        const response = await api()
            .post('/cart/checkout')
            .set('Authorization', bearer)
            .send({ paymentMethod: 'crypto' });

        expect(response.status).toBe(422);
    });

    // `pickup.requiresAddress` is false — it ships to nobody, so naming an address for it is a
    // client error, not a lookup that might resolve.
    it('matches the error contract for an addressId sent with a method that needs none', async () => {
        const { bearer } = await authenticateWithCart();
        const address = await api().post('/account/addresses').set('Authorization', bearer).send({
            fullName: 'Ada Lovelace',
            street: 'Via Roma 1',
            city: 'Modena',
            zip: '41121',
            country: 'IT'
        });
        const addressId = address.body.data.id as string;

        await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'pickup' });
        const response = await api()
            .post('/cart/checkout')
            .set('Authorization', bearer)
            .send({ addressId });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('CART_ADDRESS_NOT_APPLICABLE');
    });

    // `NODE_SHIP_TO_COUNTRIES` defaults to the shop's own country alone (`IT` in tests) — a
    // courier method resolving to an address outside it is refused before anything is written.
    it('matches the error contract for an address outside the configured ship-to list', async () => {
        const { bearer } = await authenticateWithCart();
        const address = await api().post('/account/addresses').set('Authorization', bearer).send({
            fullName: 'Ada Lovelace',
            street: '1 Kings Road',
            city: 'London',
            zip: 'SW1A 1AA',
            country: 'GB'
        });
        const addressId = address.body.data.id as string;

        await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'standard' });
        const response = await api()
            .post('/cart/checkout')
            .set('Authorization', bearer)
            .send({ addressId });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].code).toBe('CART_SHIP_TO_COUNTRY_NOT_SUPPORTED');
    });

    it('a pickup method needing no address is never blocked by the shopper own country', async () => {
        const { bearer } = await authenticateWithCart();
        // The caller's default address is outside the ship-to list — irrelevant to pickup, which
        // resolves no shipping address at all, and to billing, which the list does not bind.
        await api().post('/account/addresses').set('Authorization', bearer).send({
            fullName: 'Ada Lovelace',
            street: '1 Kings Road',
            city: 'London',
            zip: 'SW1A 1AA',
            country: 'GB',
            default: true
        });

        await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'pickup' });
        const response = await api().post('/cart/checkout').set('Authorization', bearer).send({});

        expect(response.status).toBe(201);
    });

    // The order answers both addresses: billing on every checkout order, shipping only when a
    // line ships to an address.
    it('answers a billingAddress on a pickup order and no shippingAddress', async () => {
        const { bearer } = await authenticateWithCart();
        await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'pickup' });
        const response = await api().post('/cart/checkout').set('Authorization', bearer).send({});

        expect(response.status).toBe(201);
        expect(response.body.data.billingAddress).toMatchObject({ street: 'Via Roma 1' });
        expect(response.body.data.shippingAddress).toBeUndefined();
    });

    it('bills the address named by billingAddressId and ships to the default', async () => {
        const { bearer } = await authenticateWithCart();
        const office = await api().post('/account/addresses').set('Authorization', bearer).send({
            fullName: 'Ada Lovelace',
            street: 'Via Milano 2',
            city: 'Modena',
            zip: '41122',
            country: 'IT'
        });
        await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'standard' });
        const response = await api()
            .post('/cart/checkout')
            .set('Authorization', bearer)
            .send({ billingAddressId: office.body.data.id as string });

        expect(response.status).toBe(201);
        expect(response.body.data.shippingAddress.street).toBe('Via Roma 1');
        expect(response.body.data.billingAddress.street).toBe('Via Milano 2');
    });

    it('matches the error contract for a checkout with no billing address to use', async () => {
        const { bearer } = await authenticateAs('user');
        const digital = await createProduct({ requiresShipping: false });
        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(digital._id), quantity: 1 });
        const response = await api().post('/cart/checkout').set('Authorization', bearer).send({});

        expect(response.status).toBe(422);
        expect(response.body.errors[0].code).toBe('CART_BILLING_ADDRESS_REQUIRED');
    });

    it('empties the cart on success', async () => {
        const { bearer } = await authenticateWithCart();
        await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'pickup' });
        await api().post('/cart/checkout').set('Authorization', bearer).send({});
        const response = await api().get('/cart').set('Authorization', bearer);

        expect(response.body.data.items).toHaveLength(0);
    });

    // 409, not 422: an empty cart is a state conflict, not a malformed request. The spec did not
    // declare it until this suite was written — the implementation has answered 409 all along.
    it('matches the error contract for an empty cart', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().post('/cart/checkout').set('Authorization', bearer);

        expect(response.status).toBe(409);
    });

    it('matches the error contract when a line exceeds the shelf', async () => {
        const { bearer } = await authenticateAs('user');
        const scarce = await createProduct({ onHand: 1 });
        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(scarce._id), quantity: 2 });

        const response = await api().post('/cart/checkout').set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('CART_INSUFFICIENT_STOCK');
        /*
         * The refusal has to be actionable over the wire, not just in the service: which line and
         * what is actually left. `ErrorItem.details` is `additionalProperties: true`, so this
         * rides the existing contract rather than widening it.
         */
        expect(response.body.errors[0].details.lines).toEqual([
            {
                productId: String(scarce._id),
                title: expect.any(String),
                requested: 2,
                available: 1
            }
        ]);
    });

    it('matches the error contract for an unoffered payment method', () =>
        // Explicitly unset: `tests/support/setup-environment.ts` configures transfer for the whole worker, so
        // "this deployment offers no transfer" is a state this case has to create.
        withoutEnvironment(
            ['NODE_BANK_TRANSFER_BENEFICIARY', 'NODE_BANK_TRANSFER_IBAN'],
            async () => {
                const { bearer } = await authenticateWithCart();

                const response = await api()
                    .post('/cart/checkout')
                    .set('Authorization', bearer)
                    .send({ paymentMethod: 'bank_transfer' });

                expect(response.status).toBe(409);
                expect(response.body.errors[0].code).toBe('CART_PAYMENT_METHOD_NOT_AVAILABLE');
            }
        ));

    it('matches the contract for a bank_transfer checkout, transferInstructions included', () =>
        withEnvironment('NODE_BANK_TRANSFER_BENEFICIARY', 'Guebbit Shop', () =>
            withEnvironment('NODE_BANK_TRANSFER_IBAN', 'DE89370400440532013000', async () => {
                const { bearer } = await authenticateWithCart();

                await api()
                    .put('/cart/shipping-method')
                    .set('Authorization', bearer)
                    .send({ shippingMethodId: 'pickup' });
                const response = await api()
                    .post('/cart/checkout')
                    .set('Authorization', bearer)
                    .send({ paymentMethod: 'bank_transfer' });

                expect(response.status).toBe(201);
                expect(response.body.data.paymentMethod).toBe('bank_transfer');
                expect(response.body.data.payBy).toEqual(expect.any(String));
                expect(response.body.data.transferInstructions).toEqual({
                    beneficiary: 'Guebbit Shop',
                    // Grouped into 4s for display — see `bankTransferIbanFriendly`.
                    iban: 'DE89 3704 0044 0532 0130 00',
                    // The exact RF code is `buildReference`'s own concern
                    // (`orders/tests/unit/transfer-reference.test.ts`) — this pins its shape, no
                    // longer the order's own id.
                    reference: expect.stringMatching(/^RF\d{2}[\dA-Z]{19}$/)
                });
            })
        ));
});

describe('POST /cart/reorder/{orderId}', () => {
    it("refills the cart from the caller's own order, quantities included", async () => {
        const { bearer, user } = await authenticateAs('user');
        const keyboard = await createProduct({ title: 'Keyboard' });
        const mouse = await createProduct({ title: 'Mouse' });
        const order = await createOrder(user, [toOrderItem(keyboard, 2), toOrderItem(mouse, 1)]);

        const response = await api()
            .post(`/cart/reorder/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        // Ids, not counts: the cart must hold exactly the order's products.
        const items: { productId: string; quantity: number }[] = response.body.data.items;
        expect(items.map(({ productId }) => productId).toSorted()).toEqual(
            [String(keyboard._id), String(mouse._id)].toSorted()
        );
        expect(response.body.data.summary.totalQuantity).toBe(3);
    });

    it('adds on top of what the cart already holds', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const seeded = await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 2 });
        expect(seeded.status).toBe(201);

        // The same product arrives again via a reorder of an old order holding 3 of it.
        const order = await createOrder(user, [toOrderItem(product, 3)]);

        const response = await api()
            .post(`/cart/reorder/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.summary.totalQuantity).toBe(5);
    });

    it('skips products that have left the public catalogue and lands the rest', async () => {
        const { bearer, user } = await authenticateAs('user');
        const alive = await createProduct({ title: 'Alive' });
        const retired = await createProduct({ title: 'Retired', active: false });
        const order = await createOrder(user, [toOrderItem(alive, 1), toOrderItem(retired, 4)]);

        const response = await api()
            .post(`/cart/reorder/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        const items: { productId: string }[] = response.body.data.items;
        expect(items.map(({ productId }) => productId)).toEqual([String(alive._id)]);
    });

    it('answers 409 when nothing on the order is still available', async () => {
        const { bearer, user } = await authenticateAs('user');
        const retired = await createProduct({ title: 'Retired', active: false });
        const order = await createOrder(user, [toOrderItem(retired, 1)]);

        const response = await api()
            .post(`/cart/reorder/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('REORDER_UNAVAILABLE');
    });

    it("answers 404 for another user's order — no existence leak", async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'admin' });
        const product = await createProduct();
        const order = await createOrder(owner, [toOrderItem(product, 1)]);
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post(`/cart/reorder/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('matches the error contract for a malformed order id', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().post('/cart/reorder/not-an-id').set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});
