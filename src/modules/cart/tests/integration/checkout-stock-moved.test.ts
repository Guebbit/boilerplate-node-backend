/**
 * @module
 * Stock can move between the moment a line is added to the cart and the checkout (another buyer,
 * a staff adjustment). Checkout's pre-flight and the hold (`reserveForOrder`) read the `stocklevels`
 * ledger, so a change made behind the cart's back can neither oversell nor falsely refuse.
 */

import type { Types } from 'mongoose';
import { createProduct } from '@modules/products/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { giveAddress } from '@modules/addresses/tests/factories';
import { cartService } from '../../services';
import { cartRepository } from '../../repository';
import { countOrders } from '@modules/orders/tests/factories';
import { forceStockLevel, stockLevelRepository } from '@modules/inventory/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    registerCheckoutModules();
});

/** A shopper with 3 units of a fresh product in the cart and pickup chosen. */
const shopperBuyingThree = async (onHand: number) => {
    const user = await createUser();
    await giveAddress(user.id);
    const product = await createProduct({ onHand });
    await cartService.addItemById(user.id, String(product._id), 3);
    await cartRepository.setShippingMethod(user.id, 'pickup');
    return { user, product };
};

/** The level row's counters, read from `stocklevels` itself. */
const levelOf = (productId: Types.ObjectId) =>
    stockLevelRepository
        .findByProductId(String(productId))
        .then((level) => ({ onHand: level?.onHand, reserved: level?.reserved }));

describe('the level moves after the line was added to the cart', () => {
    it('refuses the checkout at the hold, with no order and no unit moved', async () => {
        const { user, product } = await shopperBuyingThree(10);
        await forceStockLevel(product._id, 2, 0);

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(false);
        expect(!result.success && result.errors[0]?.code).toBe('CART_INSUFFICIENT_STOCK');
        expect(await countOrders({ userId: user._id })).toBe(0);
        // Nothing was taken from the level.
        expect(await levelOf(product._id)).toEqual({ onHand: 2, reserved: 0 });
    });

    it('names the blocking line from the level in the refusal', async () => {
        const { user, product } = await shopperBuyingThree(10);
        await forceStockLevel(product._id, 2, 0);

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(!result.success && result.errors[0]?.details).toEqual({
            lines: [
                {
                    productId: String(product._id),
                    title: product.title,
                    requested: 3,
                    quantityAvailable: 2
                }
            ]
        });
    });

    it('sells exactly what the level holds', async () => {
        const { user, product } = await shopperBuyingThree(10);
        await forceStockLevel(product._id, 3, 0);

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(true);
        expect(await levelOf(product._id)).toEqual({ onHand: 3, reserved: 3 });
    });

    it('does not sell units that other buyers already hold', async () => {
        const { user, product } = await shopperBuyingThree(10);
        await forceStockLevel(product._id, 10, 8);

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(false);
        expect(await levelOf(product._id)).toEqual({ onHand: 10, reserved: 8 });
    });
});
