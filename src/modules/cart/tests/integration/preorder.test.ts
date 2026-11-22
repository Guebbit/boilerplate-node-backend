/**
 * @module
 * A preorder as the cart sees it: its line reads `preorder` with all of it shipping later, is judged
 * against the allowance and not the shelf, a write stops at what the allowance has left, and checkout holds the allowance, freezes the promise on the order's line and
 * accepts a basket that mixes it with ordinary goods.
 *
 * @see docs/modules/cart.md#line-availability
 */

import { setupTestDb } from '@tests/setup-test-db';
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
import { shopDayOf } from '@modules/shop';

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    registerCheckoutModules([paymentsModule]);
});

/** A release date a month away, as the ISO string the catalogue stores it from. */
const nextMonth = () => new Date(Date.now() + 30 * 86_400_000).toISOString();

/** A preorder product: no stock on the shelf, an allowance of `limit`. */
const preorderProduct = async (limit: number, onHand = 0) => {
    const product = await createProduct({ onHand, releaseDate: nextMonth() });
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
const shopperWith = async (productId: string, quantity: number, email?: string) => {
    const user = await createUser(email === undefined ? {} : { email });
    await giveAddress(user.id);
    await cartService.addItemById(user.id, productId, quantity);
    await cartRepository.setShippingMethod(user.id, 'pickup');
    return user;
};

describe('a preorder line', () => {
    it('reads preorder, the allowance as the number and every unit shipping later', async () => {
        const product = await preorderProduct(5);
        const user = await createUser();

        await cartService.addItemById(user.id, String(product._id), 3);

        await expect(lineStockOf(user.id)).resolves.toEqual({
            quantity: 3,
            availability: 'preorder',
            quantityAvailable: 5,
            quantityBackordered: 3
        });
    });

    it('owes nothing on a line whose allowance has since been closed: it reads out of stock', async () => {
        const product = await preorderProduct(5);
        const user = await createUser();
        await cartService.addItemById(user.id, String(product._id), 3);
        await inventoryService.setBackorderLimit(String(product._id), 0);

        await expect(lineStockOf(user.id)).resolves.toEqual({
            quantity: 3,
            availability: 'out_of_stock',
            quantityAvailable: 0,
            quantityBackordered: undefined
        });
    });

    it('clamps a line to what the allowance has left, and warns', async () => {
        const product = await preorderProduct(2);
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
        await expect(lineStockOf(user.id)).resolves.toMatchObject({ quantity: 2 });
    });

    it('adds nothing with no allowance at all, however full the shelf is', async () => {
        const product = await preorderProduct(0, 50);
        const user = await createUser();

        const added = await cartService.addItemById(user.id, String(product._id), 1);

        expect(added.success && added.data.items).toEqual([]);
        expect(added.success && added.data.warnings).toMatchObject([
            { code: 'MERCHANDISE_OUT_OF_STOCK', requested: 1, resulting: 0 }
        ]);
    });

    it('goes back to the shelf the moment the release date has passed', async () => {
        const product = await preorderProduct(5, 5);
        const user = await createUser();
        await cartService.addItemById(user.id, String(product._id), 1);

        await productService.updateById(
            String(product._id),
            { releaseDate: shopDayOf(new Date(Date.now() - 86_400_000)) },
            testCallerContext
        );

        await expect(lineStockOf(user.id)).resolves.toEqual({
            quantity: 1,
            availability: 'in_stock',
            quantityAvailable: 5,
            quantityBackordered: undefined
        });
    });
});

describe('checking out a preorder', () => {
    it('claims the allowance, leaves the shelf alone and freezes the promise on the line', async () => {
        const product = await preorderProduct(5);
        const productId = String(product._id);
        const user = await shopperWith(productId, 2);

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(true);
        const line = result.success ? result.data.items[0] : undefined;
        expect(line?.product).toMatchObject({ preorder: true });
        expect(line?.product.releaseDate?.toISOString()).toBe(product.releaseDate?.toISOString());
        const levels = await inventoryService.listPreorders();
        expect(levels.items).toMatchObject([
            { productId, backordered: 2, held: 2, paid: 0, left: 3 }
        ]);
        const shelf = await inventoryService.availableFor([productId]);
        expect(shelf.get(productId)?.available).toBe(0);
    });

    it('refuses once the allowance is full, naming the line with nothing to buy', async () => {
        const product = await preorderProduct(2);
        const productId = String(product._id);
        const first = await shopperWith(productId, 2);
        // In the cart while the allowance still has room; the first checkout then fills it.
        const latecomer = await shopperWith(productId, 1, 'latecomer@example.com');
        await cartService.orderConfirm(first.id, testCallerContext, undefined);

        const result = await cartService.orderConfirm(latecomer.id, testCallerContext, undefined);

        expect(result.status).toBe(409);
        expect(!result.success && result.errors[0]).toMatchObject({
            code: 'CART_INSUFFICIENT_STOCK',
            details: { lines: [{ productId, requested: 1, quantityAvailable: 0 }] }
        });
    });

    it('accepts a basket mixing a preorder with goods that are in stock', async () => {
        const preorder = await preorderProduct(5);
        const ordinary = await createProduct({ onHand: 4 });
        const user = await createUser();
        await giveAddress(user.id);
        await cartService.addItemById(user.id, String(preorder._id), 1);
        await cartService.addItemById(user.id, String(ordinary._id), 2);
        await cartRepository.setShippingMethod(user.id, 'pickup');

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(true);
        const frozen = result.success
            ? result.data.items.map(({ product }) => [String(product._id), product.preorder])
            : [];
        expect(frozen).toEqual(
            expect.arrayContaining([
                [String(preorder._id), true],
                [String(ordinary._id), undefined]
            ])
        );
        const shelf = await inventoryService.availableFor([String(ordinary._id)]);
        expect(shelf.get(String(ordinary._id))?.available).toBe(2);
    });

    it('keeps the promise frozen when the date later passes', async () => {
        const product = await preorderProduct(5);
        const user = await shopperWith(String(product._id), 1);
        const placed = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        await productService.updateById(
            String(product._id),
            { releaseDate: shopDayOf(new Date(Date.now() - 86_400_000)) },
            testCallerContext
        );

        const line = placed.success ? placed.data.items[0] : undefined;
        expect(line?.product.preorder).toBe(true);
    });
});
