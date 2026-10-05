/**
 * @module
 * The cart's `totalPrice` is the amount the order and the payment intent will carry.
 *
 * All three are summed in integer minor units and converted once (`orderTotal`): two decimals
 * added directly differ by a float epsilon for some prices (0.56 + 5.00).
 */

import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { giveAddress } from '@modules/addresses/tests/factories';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

describe('the cart total is the amount the order and the intent will carry', () => {
    it.each([
        { price: 0.56, quantity: 1, total: 5.56 },
        { price: 0.69, quantity: 1, total: 5.69 },
        { price: 1.06, quantity: 1, total: 6.06 }
    ])('a $price basket on standard shipping totals $total', async ({ price, quantity, total }) => {
        const { user, bearer } = await authenticateAs();
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
            .send({ shippingMethodId: 'standard' })
            .expect(200);

        const cart = await api().get('/cart').set('Authorization', bearer).expect(200);
        const checkout = await api()
            .post('/cart/checkout')
            .set('Authorization', bearer)
            .send({})
            .expect(201);

        expect(checkout.body.data.totalPrice).toBe(total);
        expect(cart.body.data.summary.totalPrice).toBe(total);
    });
});
