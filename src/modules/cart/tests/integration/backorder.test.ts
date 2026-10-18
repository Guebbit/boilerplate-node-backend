/**
 * @module
 * A backorder as the cart sees it: its line reads `backorder` once the shelf cannot cover it,
 * checkout takes the shelf units there are and claims the rest against the cap, and the order
 * freezes how many are owed and the day they were promised.
 *
 * See: docs/modules/cart.md#line-availability
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { giveAddress } from '@modules/addresses/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { inventoryService } from '@modules/inventory';
import paymentsModule from '@modules/payments/module';
import { resetDomainEvents } from '@kernel/events';
import { cartService } from '../../services';
import { cartRepository } from '../../repository';

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    registerCheckoutModules([paymentsModule]);
});

const DAY_MS = 86_400_000;

/** A released product open to backorder: `onHand` on the shelf and a cap of `limit`. */
const backorderProduct = async (onHand: number, limit: number | null, restockInDays?: number) => {
    const product = await createProduct({
        onHand,
        allowBackorder: true,
        ...(restockInDays === undefined
            ? {}
            : { restockDate: new Date(Date.now() + restockInDays * DAY_MS).toISOString() })
    });
    // Also brings the catalogue's copy of the cap into step.
    await inventoryService.setBackorderLimit(String(product._id), limit);
    return product;
};

/** The availability of the one line in the user's cart. */
const availabilityOf = (userId: string) =>
    cartService.getForView(userId, testCallerContext).then(({ items }) => items[0]?.availability);

/** A user with an address, the product in their cart, and pickup chosen: ready to check out. */
const shopperWith = async (productId: string, quantity: number) => {
    const user = await createUser();
    await giveAddress(user.id);
    await cartService.addItemById(user.id, productId, quantity);
    await cartRepository.setShippingMethod(user.id, 'pickup');
    return user;
};

describe('a backorder line', () => {
    it('reads in_stock while the shelf covers it', async () => {
        const product = await backorderProduct(5, 10);
        const user = await createUser();

        await cartService.addItemById(user.id, String(product._id), 3);

        await expect(availabilityOf(user.id)).resolves.toBe('in_stock');
    });

    it('reads backorder once the line asks for more than the shelf holds', async () => {
        const product = await backorderProduct(2, 10);
        const user = await createUser();

        await cartService.addItemById(user.id, String(product._id), 3);

        await expect(availabilityOf(user.id)).resolves.toBe('backorder');
    });

    it('reads insufficient_stock when the shelf and the cap together fall short', async () => {
        const product = await backorderProduct(1, 1);
        const user = await createUser();

        await cartService.addItemById(user.id, String(product._id), 3);

        await expect(availabilityOf(user.id)).resolves.toBe('insufficient_stock');
    });

    it('reads out_of_stock with an empty shelf and a closed cap', async () => {
        const product = await backorderProduct(0, 0);
        const user = await createUser();

        await cartService.addItemById(user.id, String(product._id), 1);

        await expect(availabilityOf(user.id)).resolves.toBe('out_of_stock');
    });
});

describe('checking out a backorder', () => {
    it('takes the shelf units there are and freezes how many are owed and when', async () => {
        const product = await backorderProduct(2, 10, 20);
        const productId = String(product._id);
        const user = await shopperWith(productId, 3);

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(true);
        const line = result.success ? result.data.items[0] : undefined;
        expect(line?.quantity).toBe(3);
        expect(line?.backorderedQuantity).toBe(1);
        expect(line?.promisedAt?.toISOString()).toBe(product.restockDate?.toISOString());
        expect(line?.promiseDated).toBe(true);
        const levels = await inventoryService.listLevels();
        expect(levels.items).toMatchObject([
            { productId, reserved: 2, available: 0, backordered: 1 }
        ]);
    });

    it('promises 30 days from the order when the product names no restock date', async () => {
        const product = await backorderProduct(0, 10);
        const user = await shopperWith(String(product._id), 1);
        const before = Date.now();

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        const promised = result.success ? result.data.items[0]?.promisedAt : undefined;
        expect(result.success ? result.data.items[0]?.promiseDated : undefined).toBe(false);
        expect(promised?.getTime()).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
        expect(promised?.getTime()).toBeLessThan(Date.now() + 30 * DAY_MS + 1000);
    });

    it('freezes nothing owed when the shelf covered the whole line', async () => {
        const product = await backorderProduct(5, 10);
        const user = await shopperWith(String(product._id), 3);

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        const line = result.success ? result.data.items[0] : undefined;
        expect(line?.backorderedQuantity).toBeUndefined();
        expect(line?.promisedAt).toBeUndefined();
    });

    it('refuses a basket the shelf and the cap together cannot cover, and holds nothing', async () => {
        const product = await backorderProduct(1, 1);
        const productId = String(product._id);
        const user = await shopperWith(productId, 3);

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result).toMatchObject({ success: false, status: 409 });
        const levels = await inventoryService.listLevels();
        expect(levels.items).toMatchObject([
            { productId, reserved: 0, available: 1, backordered: 0 }
        ]);
    });
});
