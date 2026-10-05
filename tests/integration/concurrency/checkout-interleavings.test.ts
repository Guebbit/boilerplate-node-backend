/**
 * @module
 * Checkout against a cart that moves under it — a REAL interleaving, not a mocked `null`.
 *
 * `cart-races.test.ts` fires N identical checkouts and hopes the scheduler overlaps them;
 * `stock.test.ts` stubs `clearLinesIfUnchanged` to `null`. Neither shows the guard catching an
 * ordinary cart write that lands between the version read and the clear. Here the write is
 * injected at a fixed point (inside the product join, after the version was captured), so the
 * interleaving is the same on every run.
 *
 * Invariants asserted:
 *   - A checkout that lost to a cart write answers `CART_CHANGED` and keeps NONE of its work:
 *     no order, no hold, no counter moved.
 *   - The shopper's newer cart is exactly what they left, never emptied by the loser.
 *   - A reprice landing mid-checkout is never half-applied: the lines, the free-shipping decision
 *     and the payment intent all come from the one reading of the catalogue the checkout took.
 */

import { productService } from '@modules/products';
import {
    createProduct,
    countersOf,
    readProduct,
    saveProduct
} from '@modules/products/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { giveAddress } from '@modules/addresses/tests/factories';
import { cartService } from '@modules/cart/services';
import { cartRepository } from '@modules/cart/repository';
import { stockLevelRepository } from '@modules/inventory/repository';
import { countOrders } from '@modules/orders/tests/factories';
import { createIntent } from '@modules/payments/services';
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

/** A shopper with an address, one product in the cart (quantity 3) and the pickup method chosen. */
const shopperWithCart = async () => {
    const user = await createUser();
    await giveAddress(user.id);
    const product = await createProduct({ onHand: 10 });
    const other = await createProduct({ onHand: 10 });
    await cartService.cartItemAddById(user.id, String(product._id), 3);
    await cartRepository.setShippingMethod(user.id, 'pickup');
    return { user, product, other };
};

/**
 * Make `write` run once, in the middle of the next checkout: after the cart's version was read,
 * while its lines are being joined to their products. `findManyByIds` is the one call between
 * the two, and spying an own method of a plain object is safe under the swc mutation harness.
 */
const writeDuringJoin = (write: () => Promise<unknown>): void => {
    const joinProducts = productService.findManyByIds;
    jest.spyOn(productService, 'findManyByIds').mockImplementationOnce((ids) =>
        joinProducts(ids).then(async (products) => {
            await write();
            return products;
        })
    );
};

/** The level row's counters, read from `stocklevels` itself, not the catalogue's cache of them. */
const levelOf = (productId: unknown) =>
    stockLevelRepository
        .findByProductId(String(productId))
        .then((level) => ({ onHand: level?.onHand, reserved: level?.reserved }));

/** What a cart holds, as plain data a test can compare before and after. */
const cartSnapshot = (userId: string) =>
    cartRepository.findByUserId(userId).then((cart) => ({
        items: (cart?.items ?? []).map((item) => ({
            productId: String(item.productId),
            quantity: item.quantity
        })),
        shippingMethodId: cart?.shippingMethodId,
        version: cart?.__v
    }));

/** One shopper write, by name, each of which must invalidate an in-flight checkout. */
interface CartWrite {
    name: string;
    run: (ctx: { userId: string; productId: string; otherId: string }) => Promise<unknown>;
}

const CART_WRITES: readonly CartWrite[] = [
    {
        name: 'adds another product',
        run: ({ userId, otherId }) => cartService.cartItemAddById(userId, otherId, 1)
    },
    {
        name: 'raises the quantity of the line being bought',
        run: ({ userId, productId }) => cartService.cartItemSetById(userId, productId, 5)
    },
    {
        name: 'removes the line being bought',
        run: ({ userId, productId }) =>
            cartService.cartItemRemoveById(userId, productId, testCallerContext)
    },
    {
        name: 'clears the whole cart',
        run: ({ userId }) => cartService.cartRemove(userId, testCallerContext)
    },
    {
        name: 'changes the shipping method',
        run: ({ userId }) => cartRepository.setShippingMethod(userId, null)
    }
];

describe('a cart write between the version read and the clear', () => {
    it.each(CART_WRITES)(
        'a shopper who $name loses the checkout, and the checkout leaves nothing behind',
        async ({ run }) => {
            const { user, product, other } = await shopperWithCart();
            let afterWrite: Awaited<ReturnType<typeof cartSnapshot>> | undefined;
            writeDuringJoin(async () => {
                await run({
                    userId: user.id,
                    productId: String(product._id),
                    otherId: String(other._id)
                });
                afterWrite = await cartSnapshot(user.id);
            });

            const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

            expect(result.success).toBe(false);
            expect(result.status).toBe(409);
            expect(!result.success && result.errors[0]?.code).toBe('CART_CHANGED');
            // The loser's order is gone, and its hold with it, in the level collection itself.
            expect(await countOrders({ userId: user._id })).toBe(0);
            expect(await levelOf(product._id)).toEqual({ onHand: 10, reserved: 0 });
            expect(await countersOf(product._id)).toMatchObject({ reserved: 0, available: 10 });
            // The shopper's newer cart is untouched by the loser: items, choice and version.
            expect(await cartSnapshot(user.id)).toEqual(afterWrite);
        }
    );

    it('is retryable: the same shopper then checks out the cart they actually have', async () => {
        const { user, product, other } = await shopperWithCart();
        writeDuringJoin(() => cartService.cartItemAddById(user.id, String(other._id), 2));

        const lost = await cartService.orderConfirm(user.id, testCallerContext, undefined);
        const retried = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(lost.success).toBe(false);
        expect(retried.success).toBe(true);
        // One order, carrying the cart as it stood after the write, with exactly its units held.
        expect(await countOrders({ userId: user._id })).toBe(1);
        expect(retried.success && retried.data.items).toHaveLength(2);
        expect(await levelOf(product._id)).toEqual({ onHand: 10, reserved: 3 });
        expect(await levelOf(other._id)).toEqual({ onHand: 10, reserved: 2 });
        const remaining = await cartSnapshot(user.id);
        expect(remaining.items).toEqual([]);
    });

    it('does not lose a checkout to a write that changed nothing', async () => {
        // PUT the quantity the line already holds: no `__v` bump, so no false CART_CHANGED.
        const { user, product } = await shopperWithCart();
        writeDuringJoin(() => cartService.cartItemSetById(user.id, String(product._id), 3));

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(true);
        expect(await countOrders({ userId: user._id })).toBe(1);
    });
});

describe('a reprice between the catalogue read and the order write', () => {
    it('prices lines, shipping and the payment intent off the one reading', async () => {
        // 3 x 40 = 120 clears standard shipping's free-above-100 line; repriced to 10 mid-join the
        // basket would not. A mix (new price, old shipping decision) would total 30, or 125.
        const user = await createUser();
        await giveAddress(user.id);
        const product = await createProduct({ price: 40, onHand: 10 });
        await cartService.cartItemAddById(user.id, String(product._id), 3);
        await cartRepository.setShippingMethod(user.id, 'standard');
        writeDuringJoin(async () => {
            const stored = await readProduct(String(product._id));
            if (!stored) throw new Error('product vanished');
            stored.price = 10;
            await saveProduct(stored);
        });

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);
        const placed = result.success ? result.data : undefined;
        const intent = await createIntent(String(placed?._id), asCustomer(user.id));

        expect(result.success).toBe(true);
        expect(placed?.items[0]?.product.price).toBe(40);
        expect(placed?.shippingCost).toBe(0);
        expect(intent.success && intent.data?.amount).toBe(120);
    });
});
