/**
 * @module
 * The cart view's stock flag: every answer that carries the cart marks a line `insufficientStock`
 * when its quantity is more than is for sale, from the same rule checkout and the merge use and
 * the same source, the stock ledger.
 *
 * The second invariant matters as much as the first: the flag is a boolean and NEVER the number
 * left. "Reading the shelf" (`docs/theory/defences/authorization.md`) gives exact stock to
 * `inventory.any.read` only, so no field of any cart answer may vary with what is on the shelf
 * beyond that one boolean.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { overrideEnvironment, resetEnvironmentOverrides } from '@infrastructure/config/store';
import { testCallerContext } from '@tests/callers';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { giveAddress } from '@modules/addresses/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { productService } from '@modules/products';
import { inventoryService } from '@modules/inventory';
import paymentsModule from '@modules/payments/module';
import { resetDomainEvents } from '@kernel/events';
import { cartItemAddById, cartGetForView, orderConfirm } from '../../services';
import { cartRepository } from '../../repository';

setupTestDb();

// These cases fill a line up to the contract's 999 ceiling: lift the shop's own, lower, default.
beforeEach(() => {
    overrideEnvironment({ NODE_CART_LINE_MAX: '999' });
});

afterEach(() => {
    resetEnvironmentOverrides();
});

/** The flag of the one line in the user's cart. */
const flagOf = (userId: string) =>
    cartGetForView(userId, testCallerContext).then(({ items }) => items[0]?.insufficientStock);

/** Every key that appears anywhere in a JSON value, nested objects and arrays included. */
const keysOf = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.flatMap((entry) => keysOf(entry));
    if (typeof value !== 'object' || value === null) return [];
    return Object.entries(value).flatMap(([key, entry]) => [key, ...keysOf(entry)]);
};

describe('GET /cart’s stock flag', () => {
    it('is false while the line fits, and true once it no longer does', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5 });
        await cartItemAddById(user.id, String(product._id), 4);
        await expect(flagOf(user.id)).resolves.toBe(false);

        await inventoryService.adjust(String(product._id), -2, 'stocktake');

        await expect(flagOf(user.id)).resolves.toBe(true);
    });

    it('reads the ledger, not the catalogue cache that sits low', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5 });
        await cartItemAddById(user.id, String(product._id), 4);

        await productService.syncStockCache(String(product._id), { onHand: 0, reserved: 0 });

        await expect(flagOf(user.id)).resolves.toBe(false);
    });

    it('treats a line equal to what is for sale as fitting', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 4 });
        await cartItemAddById(user.id, String(product._id), 4);

        await expect(flagOf(user.id)).resolves.toBe(false);
    });

    it('flags a sold-out line', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 0 });
        await cartItemAddById(user.id, String(product._id), 1);

        await expect(flagOf(user.id)).resolves.toBe(true);
    });

    it('counts units another order holds as not for sale', async () => {
        const buyer = await createUser({ email: 'buyer@example.com' });
        await giveAddress(buyer.id);
        const product = await createProduct({ onHand: 10 });
        await cartItemAddById(buyer.id, String(product._id), 6);
        await cartRepository.setShippingMethod(buyer.id, 'pickup');
        resetDomainEvents();
        registerCheckoutModules([paymentsModule]);
        await expect(orderConfirm(buyer.id, testCallerContext, undefined)).resolves.toMatchObject({
            success: true
        });

        const shopper = await createUser({ email: 'shopper@example.com' });
        await cartItemAddById(shopper.id, String(product._id), 4);
        await expect(flagOf(shopper.id)).resolves.toBe(false);
        await cartItemAddById(shopper.id, String(product._id), 1);

        // 10 on the shelf, 6 held by the open order: 4 fit, 5 do not.
        await expect(flagOf(shopper.id)).resolves.toBe(true);
    });

    it('flags a line whose product is no longer sold, in the window before the pull', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemAddById(user.id, String(product._id), 1);
        // No listeners: the real removal pulls the line out of every cart, which would leave
        // nothing to mark. This is the window before that cleanup ran.
        resetDomainEvents();

        await productService.removeById(String(product._id), false);

        await expect(flagOf(user.id)).resolves.toBe(true);
    });

    it('flags a hard-deleted product’s line too', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemAddById(user.id, String(product._id), 1);
        resetDomainEvents();

        await productService.removeById(String(product._id), true);

        await expect(flagOf(user.id)).resolves.toBe(true);
    });

    it('flags each line on its own, in one answer', async () => {
        const user = await createUser();
        const plenty = await createProduct({ onHand: 50 });
        const scarce = await createProduct({ onHand: 1 });
        await cartItemAddById(user.id, String(plenty._id), 2);
        await cartItemAddById(user.id, String(scarce._id), 2);

        const { items } = await cartGetForView(user.id, testCallerContext);

        expect(items.map(({ insufficientStock }) => insufficientStock)).toEqual([false, true]);
    });
});

/** One product on the shelf at `onHand`, 999 of it in the caller's cart: short either way. */
const shortCartBody = async (onHand: number, bearer: string) => {
    const product = await createProduct({ onHand });
    await api()
        .post('/cart')
        .set('Authorization', bearer)
        .send({ productId: String(product._id), quantity: 999 });

    const view = await api().get('/cart').set('Authorization', bearer);
    const merge = await api()
        .post('/cart/merge')
        .set('Authorization', bearer)
        .send({ lines: [{ productId: String(product._id), quantity: 1 }] });
    return { id: String(product._id), view: view.body, merge: merge.body };
};

/** A body with the product id blanked, so two products' answers can be compared. */
const anonymised = (body: unknown, id: string): unknown =>
    JSON.parse(JSON.stringify(body).replaceAll(id, 'PRODUCT'));

describe('the flag never carries a number', () => {
    it('answers GET /cart and POST /cart/merge identically for 1 on the shelf and 500', async () => {
        const first = await authenticateAs('user');
        const second = await authenticateAsRole('customer');
        const nearlyGone = await shortCartBody(1, first.bearer);
        const plenty = await shortCartBody(500, second.bearer);

        expect(anonymised(nearlyGone.view, nearlyGone.id)).toEqual(
            anonymised(plenty.view, plenty.id)
        );
        expect(anonymised(nearlyGone.merge, nearlyGone.id)).toEqual(
            anonymised(plenty.merge, plenty.id)
        );
        expect(nearlyGone.view.data.items[0].insufficientStock).toBe(true);
        expect(nearlyGone.merge.data.lines[0].insufficientStock).toBe(true);
    });

    it('has no stock-like field anywhere in either answer', async () => {
        const { bearer } = await authenticateAs('user');
        const { view, merge } = await shortCartBody(7, bearer);

        const stockLike = /available|onhand|reserved|remaining|left|stock/i;
        const offending = [...keysOf(view), ...keysOf(merge)].filter(
            (key) => stockLike.test(key) && key !== 'insufficientStock'
        );

        expect(offending).toEqual([]);
    });
});
