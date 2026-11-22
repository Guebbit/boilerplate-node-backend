/**
 * @module
 * A backorder as the cart sees it: its line reads the product's own answer, with the units past
 * the shelf as `quantityBackordered`, a write stops at shelf plus room, checkout takes the shelf units there are and claims the rest against the cap, and the order
 * freezes how many are owed and the day they were promised.
 *
 * @see docs/modules/cart.md#line-availability
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { giveAddress } from '@modules/addresses/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { inventoryService } from '@modules/inventory';
import { shopDayOf } from '@modules/shop';
import { forceStockLevel } from '@modules/inventory/tests/factories';
import paymentsModule from '@modules/payments/module';
import { resetDomainEvents } from '@kernel/events';
import { cartService } from '../../services';
import { cartRepository } from '../../repository';

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    registerCheckoutModules([paymentsModule]);
});

/** One day in milliseconds, for stock arrival dates. */
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
    // The allowance lives on the level, never on the product.
    await inventoryService.setBackorderLimit(String(product._id), limit);
    return product;
};

/** The stock answer of the one line in the user's cart. */
const lineStockOf = (userId: string) =>
    cartService
        .getForView(userId, testCallerContext)
        .then(({ items }) => items[0])
        .then((line) => ({
            quantity: line?.quantity,
            availability: line?.availability,
            quantityAvailable: line?.quantityAvailable,
            quantityBackordered: line?.quantityBackordered
        }));

/** A user with an address, the product in their cart, and pickup chosen: ready to check out. */
const shopperWith = async (productId: string, quantity: number) => {
    const user = await createUser();
    await giveAddress(user.id);
    await cartService.addItemById(user.id, productId, quantity);
    await cartRepository.setShippingMethod(user.id, 'pickup');
    return user;
};

describe('a backorder line', () => {
    it('reads the shelf and the room as the number, and owes nothing while the shelf covers it', async () => {
        const product = await backorderProduct(5, 10);
        const user = await createUser();

        await cartService.addItemById(user.id, String(product._id), 3);

        await expect(lineStockOf(user.id)).resolves.toEqual({
            quantity: 3,
            availability: 'in_stock',
            quantityAvailable: 15,
            quantityBackordered: undefined
        });
    });

    it('counts the units past the shelf as backordered, in the product’s own words', async () => {
        const product = await backorderProduct(2, 10);
        const user = await createUser();

        await cartService.addItemById(user.id, String(product._id), 3);

        await expect(lineStockOf(user.id)).resolves.toEqual({
            quantity: 3,
            availability: 'in_stock',
            quantityAvailable: 12,
            quantityBackordered: 1
        });
    });

    it('reads backorder with an empty shelf, the whole line owed', async () => {
        const product = await backorderProduct(0, 10);
        const user = await createUser();

        await cartService.addItemById(user.id, String(product._id), 3);

        await expect(lineStockOf(user.id)).resolves.toEqual({
            quantity: 3,
            availability: 'backorder',
            quantityAvailable: 10,
            quantityBackordered: 3
        });
    });

    it('takes any quantity of an uncapped backorder: no limit is not nothing', async () => {
        const product = await backorderProduct(0, null);
        const user = await createUser();

        const added = await cartService.addItemById(user.id, String(product._id), 8);

        expect(added.success && added.data.warnings).toBeUndefined();
        expect(added.success && added.data.items[0]).toMatchObject({
            quantity: 8,
            availability: 'backorder',
            quantityBackordered: 8
        });
        expect(added.success && added.data.items[0]).not.toHaveProperty('quantityAvailable');
        expect(added.success && added.data.checkoutable).toBe(true);
    });

    it('clamps a line to the shelf and the cap together, and warns', async () => {
        const product = await backorderProduct(1, 1);
        const user = await createUser();

        const added = await cartService.addItemById(user.id, String(product._id), 3);

        expect(added.success && added.data.warnings).toEqual([
            {
                code: 'MERCHANDISE_NOT_ENOUGH_STOCK',
                productId: String(product._id),
                requested: 3,
                resulting: 2
            }
        ]);
        await expect(lineStockOf(user.id)).resolves.toMatchObject({
            quantity: 2,
            quantityAvailable: 2,
            quantityBackordered: 1
        });
    });

    it('adds nothing with an empty shelf and a closed cap, and says it is out of stock', async () => {
        const product = await backorderProduct(0, 0);
        const user = await createUser();

        const added = await cartService.addItemById(user.id, String(product._id), 1);

        expect(added.success && added.data.items).toEqual([]);
        expect(added.success && added.data.warnings).toMatchObject([
            { code: 'MERCHANDISE_OUT_OF_STOCK', requested: 1, resulting: 0 }
        ]);
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

    it('sends the promise as the shop day on the wire, for the 30-day default too', async () => {
        const dated = await backorderProduct(0, 10, 20);
        const undated = await backorderProduct(0, 10);
        const user = await shopperWith(String(dated._id), 1);
        await cartService.addItemById(user.id, String(undated._id), 1);

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        /**
         * The wire shape: `toJSON` is the serializer every response goes through. The cast names
         * the one field read; the serializer's return type is the loose Document one.
         */
        const wire = (result.success ? result.data.toJSON() : { items: [] }) as {
            items: { promisedAt?: string }[];
        };
        const days = wire.items.map((item) => item.promisedAt);
        expect(days).toContain(shopDayOf(dated.restockDate ?? new Date(0)));
        expect(days).toContain(shopDayOf(new Date(Date.now() + 30 * DAY_MS)));
        expect(days.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day ?? ''))).toBe(true);
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
        const product = await backorderProduct(5, 5);
        const productId = String(product._id);
        const user = await shopperWith(productId, 3);
        // A sale and a lower cap after the add: shelf 1 and room 1 cannot cover 3.
        await forceStockLevel(product._id, 1, 0);
        await inventoryService.setBackorderLimit(productId, 1);

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result).toMatchObject({ success: false, status: 409 });
        expect(!result.success && result.errors[0].details).toEqual({
            lines: [{ productId, title: product.title, requested: 3, quantityAvailable: 2 }]
        });
        const levels = await inventoryService.listLevels();
        expect(levels.items).toMatchObject([
            { productId, reserved: 0, available: 1, backordered: 0 }
        ]);
    });
});
