/**
 * @module
 * The catalogue's cached counters and the `stocklevels` ledger can differ (a missed sync, a
 * direct write). Checkout's pre-flight, the hold (`reserveForOrder`), the cart view and the merge
 * all read the LEDGER, so a stale cache can neither oversell nor falsely refuse. The factories
 * keep the two coherent, which is why no other suite ever sees them differ.
 *
 * The invariant is about the direction of the error: when the two disagree, the ledger has the
 * last word. `cart/tests/integration/stock.test.ts` pins the "cache sits low" half at checkout.
 */

import type { Types } from 'mongoose';
import { createProduct, countersOf, productRepository } from '@modules/products/tests/factories';
import { productService } from '@modules/products';
import { createUser } from '@modules/users/tests/factories';
import { giveAddress } from '@modules/addresses/tests/factories';
import { cartService } from '@modules/cart/services';
import { cartRepository } from '@modules/cart/repository';
import { orderService } from '@modules/orders';
import { countOrders } from '@modules/orders/tests/factories';
import { stockLevelModel } from '@modules/inventory/model';
import { logger } from '@infrastructure/adapters/logger';
import { resetDomainEvents } from '@kernel/events';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { setupTestDb } from '@tests/setup-test-db';
import { asCustomer, testCallerContext } from '@tests/callers';

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    registerCheckoutModules();
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** A shopper with 3 units of a fresh product in the cart and pickup chosen. */
const shopperBuyingThree = async (onHand: number) => {
    const user = await createUser();
    await giveAddress(user.id);
    const product = await createProduct({ onHand });
    await cartService.cartItemAddById(user.id, String(product._id), 3);
    await cartRepository.setShippingMethod(user.id, 'pickup');
    return { user, product };
};

/** Overwrite the level row's counters, leaving the catalogue's cached copy untouched. */
const setLevel = (productId: Types.ObjectId, onHand: number, reserved: number) =>
    stockLevelModel.updateOne(
        { productId },
        { $set: { onHand, reserved, available: onHand - reserved } }
    );

/** The level row's counters, read from `stocklevels` itself. */
const levelOf = (productId: Types.ObjectId) =>
    stockLevelModel
        .findOne({ productId })
        .lean()
        .then((level) => ({ onHand: level?.onHand, reserved: level?.reserved }));

describe('the cache says there is stock, the level collection says there is not', () => {
    it('refuses the checkout at the hold, with no order and no unit moved', async () => {
        const { user, product } = await shopperBuyingThree(10);
        await setLevel(product._id, 2, 0);

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(false);
        expect(!result.success && result.errors[0]?.code).toBe('CART_INSUFFICIENT_STOCK');
        expect(await countOrders({ userId: user._id })).toBe(0);
        // Nothing was taken from the level, and the cache was not "corrected" by a refusal.
        expect(await levelOf(product._id)).toEqual({ onHand: 2, reserved: 0 });
    });

    it('names the blocking line from the level, not the cache, in the refusal', async () => {
        const { user, product } = await shopperBuyingThree(10);
        await setLevel(product._id, 2, 0);

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(!result.success && result.errors[0]?.details).toEqual({
            lines: [{ productId: String(product._id), title: product.title, requested: 3 }]
        });
    });

    it('sells exactly what the level holds when the cache over-reports', async () => {
        const { user, product } = await shopperBuyingThree(10);
        await setLevel(product._id, 3, 0);

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(true);
        expect(await levelOf(product._id)).toEqual({ onHand: 3, reserved: 3 });
    });

    it('does not let a cache that under-counts reservations sell the same units twice', async () => {
        // The cache believes nothing is reserved; the level knows 8 of 10 are held for others.
        const { user, product } = await shopperBuyingThree(10);
        await setLevel(product._id, 10, 8);
        await productRepository.syncStockCache(String(product._id), { onHand: 10, reserved: 0 });

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(false);
        expect(await levelOf(product._id)).toEqual({ onHand: 10, reserved: 8 });
    });
});

describe('the catalogue cache fails to sync after a stock write', () => {
    it('still holds the units, because the level is the truth and the sync never fails the caller', async () => {
        const { user, product } = await shopperBuyingThree(10);
        jest.spyOn(logger, 'error').mockImplementation(() => logger);
        jest.spyOn(productService, 'syncStockCache').mockRejectedValueOnce(
            new Error('products is down')
        );

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(true);
        expect(await levelOf(product._id)).toEqual({ onHand: 10, reserved: 3 });
        // The cache is stale (it never heard about the hold) until the next transition...
        expect(await countersOf(product._id)).toMatchObject({ onHand: 10, reserved: 0 });
    });

    it('converges on the next transition for that product', async () => {
        const { user, product } = await shopperBuyingThree(10);
        jest.spyOn(logger, 'error').mockImplementation(() => logger);
        jest.spyOn(productService, 'syncStockCache').mockRejectedValueOnce(
            new Error('products is down')
        );
        const checkout = await cartService.orderConfirm(user.id, testCallerContext, undefined);
        const orderId = String(checkout.success && checkout.data?._id);

        await orderService.cancelById(orderId, asCustomer(user.id));

        // The release moved the level to 0 held, and its own sync rewrote the whole cache from it.
        expect(await levelOf(product._id)).toEqual({ onHand: 10, reserved: 0 });
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 0, available: 10 });
    });
});
