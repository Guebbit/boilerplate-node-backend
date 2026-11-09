/**
 * @module
 * An order placed through checkout freezes the Terms version in force at placement, the way it
 * freezes its currency. A bump between two checkouts leaves the first order on the old version.
 */

import { api, authenticateAs } from '@tests/http';
import { checkoutAs } from '@tests/checkout-as';
import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironmentOverrides } from '@tests/environment';
import { giveAddress } from '@modules/addresses/tests/factories';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

/** Puts one unit of `productId` in the cart and picks pickup, so a checkout has something to buy. */
const fillCart = async (bearer: string, productId: string) => {
    await api()
        .post('/cart/items')
        .set('Authorization', bearer)
        .send({ productId, quantity: 1 })
        .expect(200);
    await api()
        .put('/cart/shipping-method')
        .set('Authorization', bearer)
        .send({ shippingMethodId: 'pickup' })
        .expect(200);
};

/** A shopper with an address and one unit in the cart, ready to check out. */
const shopperReady = async () => {
    const { user, bearer } = await authenticateAs('user');
    await giveAddress(user.id);
    const product = await createProduct({ price: '10.00', onHand: 10 });
    await fillCart(bearer, String(product._id));
    return { bearer, product };
};

describe('POST /cart/checkout and the Terms version', () => {
    it('stamps the order with the version in force at placement', () =>
        withEnvironmentOverrides({ NODE_TERMS_VERSION: '2026-11' }, async () => {
            const { bearer } = await shopperReady();

            const response = await checkoutAs(bearer);

            expect(response.status).toBe(201);
            expect(response.body.termsVersion).toBe('2026-11');
        }));

    it('gives two orders two versions when the Terms were bumped between them', async () => {
        const { bearer, product } = await shopperReady();

        const first = await withEnvironmentOverrides({ NODE_TERMS_VERSION: 'v1' }, () =>
            checkoutAs(bearer)
        );
        await fillCart(bearer, String(product._id));
        const second = await withEnvironmentOverrides({ NODE_TERMS_VERSION: 'v2' }, () =>
            checkoutAs(bearer)
        );

        expect(first.body.termsVersion).toBe('v1');
        expect(second.body.termsVersion).toBe('v2');
    });
});
