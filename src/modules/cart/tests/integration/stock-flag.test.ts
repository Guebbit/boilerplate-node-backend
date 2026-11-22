/**
 * @module
 * The cart line's own stock answer: every answer that carries the cart gives each line the
 * product's `availability`, `quantityAvailable` and, where a line ships later, `quantityBackordered`
 * — the same words and numbers as `GET /products/{id}/availability`, read from the stock ledger and
 * the catalogue. A cart reserves nothing, so a line can hold more than the number after a sale.
 *
 * @see docs/modules/cart.md#line-availability
 */

import { setupTestDb } from '@tests/setup-test-db';
import { overrideEnvironment, resetEnvironmentOverrides } from '@infrastructure/config/store';
import { testCallerContext } from '@tests/callers';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { giveAddress } from '@modules/addresses/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { productService } from '@modules/products';
import { inventoryService } from '@modules/inventory';
import paymentsModule from '@modules/payments/module';
import { resetDomainEvents } from '@kernel/events';
import { cartService } from '../../services';
import { cartRepository } from '../../repository';

setupTestDb();

// These cases fill a line up to the contract's 999 ceiling: lift the shop's own, lower, default.
beforeEach(() => {
    overrideEnvironment({ NODE_CART_LINE_MAX_QUANTITY: '999' });
});

afterEach(() => {
    resetEnvironmentOverrides();
});

/** The first line of the user's cart as the view answers it. */
const lineOf = (userId: string) =>
    cartService.getForView(userId, testCallerContext).then(({ items }) => items[0]);

describe('GET /cart’s line stock answer', () => {
    it('carries the shelf as the number, and lets the line grow up to it', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5 });
        await cartService.addItemById(user.id, String(product._id), 4);

        await expect(lineOf(user.id)).resolves.toEqual({
            productId: String(product._id),
            quantity: 4,
            availability: 'in_stock',
            quantityAvailable: 5,
            canIncrease: true
        });
    });

    it('stops the "+" at the number, and at the number a line equal to it still fits', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 4 });
        await cartService.addItemById(user.id, String(product._id), 4);

        const view = await cartService.getForView(user.id, testCallerContext);

        expect(view.items[0]).toMatchObject({ quantityAvailable: 4, canIncrease: false });
        expect(view.checkoutable).toBe(true);
    });

    it('reads a line above the number after a sale, and is no longer checkoutable', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5 });
        await cartService.addItemById(user.id, String(product._id), 4);

        await inventoryService.adjust(String(product._id), -2, 'stocktake', testCallerContext);

        const view = await cartService.getForView(user.id, testCallerContext);
        expect(view.items[0]).toMatchObject({
            quantity: 4,
            availability: 'in_stock',
            quantityAvailable: 3,
            canIncrease: false
        });
        expect(view.checkoutable).toBe(false);
    });

    it('names a sold-out line out_of_stock with 0', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5 });
        await cartService.addItemById(user.id, String(product._id), 1);
        await inventoryService.adjust(String(product._id), -5, 'stocktake', testCallerContext);

        await expect(lineOf(user.id)).resolves.toMatchObject({
            availability: 'out_of_stock',
            quantityAvailable: 0,
            canIncrease: false
        });
    });

    it('counts units another order holds as not for sale', async () => {
        const buyer = await createUser({ email: 'buyer@example.com' });
        await giveAddress(buyer.id);
        const product = await createProduct({ onHand: 10 });
        await cartService.addItemById(buyer.id, String(product._id), 6);
        await cartRepository.setShippingMethod(buyer.id, 'pickup');
        resetDomainEvents();
        registerCheckoutModules([paymentsModule]);
        await expect(
            cartService.orderConfirm(buyer.id, testCallerContext, undefined)
        ).resolves.toMatchObject({
            success: true
        });

        const shopper = await createUser({ email: 'shopper@example.com' });
        await cartService.addItemById(shopper.id, String(product._id), 4);
        await expect(lineOf(shopper.id)).resolves.toMatchObject({ quantityAvailable: 4 });
    });

    it('names a line whose product is no longer shown out_of_stock, in the window before the pull', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartService.addItemById(user.id, String(product._id), 1);
        /**
         * No listeners: the real removal pulls the line out of every cart, which would leave
         * nothing to mark. This is the window before that cleanup ran.
         */
        resetDomainEvents();

        await productService.removeById(String(product._id), false);

        await expect(lineOf(user.id)).resolves.toMatchObject({
            availability: 'out_of_stock',
            quantityAvailable: 0
        });
    });

    it('names a hard-deleted product’s line out_of_stock too', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartService.addItemById(user.id, String(product._id), 1);
        resetDomainEvents();

        await productService.removeById(String(product._id), true);

        const view = await cartService.getForView(user.id, testCallerContext);
        expect(view.items[0]).toMatchObject({ availability: 'out_of_stock', quantityAvailable: 0 });
        expect(view.checkoutable).toBe(false);
    });

    it('names each line on its own, in one answer', async () => {
        const user = await createUser();
        const plenty = await createProduct({ onHand: 50 });
        const scarce = await createProduct({ onHand: 3 });
        await cartService.addItemById(user.id, String(plenty._id), 2);
        await cartService.addItemById(user.id, String(scarce._id), 2);

        const { items } = await cartService.getForView(user.id, testCallerContext);

        expect(items.map(({ quantityAvailable }) => quantityAvailable)).toEqual([50, 3]);
    });
});
