/**
 * @module
 * The checkout names the total the buyer was shown (`expectedTotal`), and refuses to charge any
 * other: a price, a shipping cost or the basket itself can move between the cart screen and the
 * press of "Place order", and a price change does not bump the cart's own version.
 *
 * What is asserted is the invariant: a refused checkout leaves nothing behind (no order, no held
 * stock, the cart as it was), and the refusal carries both totals so the screen can show the new one.
 */

import { api, authenticateAs } from '@tests/http';
import { checkoutAs, shownTotal } from '@tests/checkout-as';
import { setupTestDb } from '@tests/setup-test-db';
import { giveAddress } from '@modules/addresses/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { countOrders } from '@modules/orders/tests/factories';
import { productService } from '@modules/products';
import { inventoryService } from '@modules/inventory';
import { testCallerContext } from '@tests/callers';

setupTestDb();

/** A shopper with a basket of `quantity` units of one product, shipping set to pickup (free). */
const shopperWith = async (price: number, quantity = 2) => {
    const { user, bearer } = await authenticateAs('user');
    await giveAddress(user.id);
    const product = await createProduct({ price, onHand: 10 });
    await api()
        .post('/cart')
        .set('Authorization', bearer)
        .send({ productId: String(product._id), quantity })
        .expect(201);
    await api()
        .put('/cart/shipping-method')
        .set('Authorization', bearer)
        .send({ shippingMethodId: 'pickup' })
        .expect(200);
    return { bearer, product };
};

describe('POST /cart/checkout and the total the buyer was shown', () => {
    it('places the order when the named total is the one the cart shows', async () => {
        const { bearer } = await shopperWith(10);

        const response = await checkoutAs(bearer);

        expect(response.status).toBe(201);
        expect(response.body.data.totalPrice).toBe(20);
    });

    it('refuses with both totals when the price moved after the cart was read', async () => {
        const { bearer, product } = await shopperWith(10);
        const shown = await shownTotal(bearer);
        expect(shown).toEqual({ amount: 2000, currency: 'EUR' });

        await productService.updateById(String(product._id), { price: 12 }, testCallerContext);
        const response = await checkoutAs(bearer, { expectedTotal: shown });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('CART_TOTAL_CHANGED');
        expect(response.body.errors[0].details).toEqual({
            expected: { amount: 2000, currency: 'EUR' },
            actual: { amount: 2400, currency: 'EUR' }
        });
    });

    it('leaves nothing behind: no order, no stock held, the cart still full', async () => {
        const { bearer, product } = await shopperWith(10);
        const shown = await shownTotal(bearer);
        await productService.updateById(String(product._id), { price: 12 }, testCallerContext);

        await checkoutAs(bearer, { expectedTotal: shown });

        await expect(countOrders()).resolves.toBe(0);
        await expect(countersOf(product._id)).resolves.toMatchObject({ reserved: 0 });
        const cart = await api().get('/cart').set('Authorization', bearer);
        expect(cart.body.data.items).toHaveLength(1);
    });

    it('lets the buyer confirm the new total: naming it places the order', async () => {
        const { bearer, product } = await shopperWith(10);
        await productService.updateById(String(product._id), { price: 12 }, testCallerContext);

        const response = await checkoutAs(bearer, {
            expectedTotal: { amount: 2000, currency: 'EUR' }
        });
        expect(response.status).toBe(409);

        const confirmed = await checkoutAs(bearer, {
            expectedTotal: response.body.errors[0].details.actual as Record<string, unknown>
        });
        expect(confirmed.status).toBe(201);
        expect(confirmed.body.data.totalPrice).toBe(24);
    });

    it('refuses a total named in another currency, even with the same amount', async () => {
        const { bearer } = await shopperWith(10);

        const response = await checkoutAs(bearer, {
            expectedTotal: { amount: 2000, currency: 'USD' }
        });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('CART_TOTAL_CHANGED');
    });

    it('refuses when the basket itself changed: a line added after the screen was read', async () => {
        const { bearer, product } = await shopperWith(10);
        const shown = await shownTotal(bearer);
        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 1 });

        const response = await checkoutAs(bearer, { expectedTotal: shown });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('CART_TOTAL_CHANGED');
        expect(response.body.errors[0].details.actual.amount).toBe(3000);
    });

    it('answers 422 to a request that names no total at all: the field is required', async () => {
        const { bearer } = await shopperWith(10);

        const response = await api().post('/cart/checkout').set('Authorization', bearer).send({});

        expect(response.status).toBe(422);
    });

    it.each([
        { amount: -1, currency: 'EUR' },
        { amount: 20.5, currency: 'EUR' },
        { amount: 2000, currency: 'EURO' },
        { amount: 2000 }
    ])('answers 422 to a malformed total: %j', async (expectedTotal) => {
        const { bearer } = await shopperWith(10);

        const response = await api()
            .post('/cart/checkout')
            .set('Authorization', bearer)
            .send({ expectedTotal });

        expect(response.status).toBe(422);
    });

    it('checks the stock first: a short line is told its own refusal, not a price one', async () => {
        const { bearer, product } = await shopperWith(10, 2);
        await productService.updateById(String(product._id), { price: 12 }, testCallerContext);
        await inventoryService.adjust(String(product._id), -9, 'stocktake');

        const response = await checkoutAs(bearer, {
            expectedTotal: { amount: 2000, currency: 'EUR' }
        });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('CART_INSUFFICIENT_STOCK');
    });
});
