/**
 * @module
 * `merge` — a guest cart folded into the signed-in one. The rule is `POST /cart`'s, applied
 * line by line: quantities add up, a line the cart cannot take as asked is ANSWERED rather than
 * failed, and one bad line never strands the rest. Stock clamps, as `POST /cart/items` does: a short
 * line is added up to what can be bought and WARNED, a sold-out one adds nothing and is warned. What
 * it announces for the lines that could not be added at all is the contract with `notifications`.
 *
 * Every case reads the cart back for what it holds, never trusting the answer to describe itself.
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
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { cartService } from '../../services';
import { cartRepository } from '../../repository';
import { CART_MERGE_REFUSED } from '../../events';

setupTestDb();

// These cases fill a line up to the contract's 999 ceiling: lift the shop's own, lower, default.
beforeEach(() => {
    overrideEnvironment({ NODE_CART_LINE_MAX_QUANTITY: '999' });
});

afterEach(() => {
    resetEnvironmentOverrides();
});

/** What the cart now holds, as `productId → quantity`. */
const quantities = (userId: string) =>
    cartService
        .get(userId)
        .then((lines) =>
            Object.fromEntries(lines.map(({ productId, quantity }) => [productId, quantity]))
        );

/** A guest line, by product document. */
const lineOf = (product: { _id: unknown }, quantity: number) => ({
    productId: String(product._id),
    quantity
});

describe('merge', () => {
    const announced = jest.fn();

    beforeEach(() => {
        resetDomainEvents();
        announced.mockReset();
        onDomainEvent(CART_MERGE_REFUSED, announced);
    });

    describe('answers one result per submitted line', () => {
        it('gives a product the cart did not hold a line of its own, with no reason', async () => {
            const user = await createUser();
            const product = await createProduct();

            const { lines } = await cartService.merge(
                user.id,
                [lineOf(product, 2)],
                testCallerContext
            );

            expect(lines).toEqual([
                {
                    productId: String(product._id),
                    requested: 2,
                    resulting: 2
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({ [String(product._id)]: 2 });
        });

        it('adds up a product held in both carts, like two POST /cart calls, and says "summed"', async () => {
            const user = await createUser();
            const product = await createProduct();
            await cartService.addItemById(user.id, String(product._id), 3);

            const { lines } = await cartService.merge(
                user.id,
                [lineOf(product, 4)],
                testCallerContext
            );

            expect(lines).toEqual([
                {
                    productId: String(product._id),
                    requested: 4,
                    resulting: 7,
                    reason: 'summed'
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({ [String(product._id)]: 7 });
        });

        it('stops a line at the ceiling and says "capped"', async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 5000 });
            await cartService.addItemById(user.id, String(product._id), 998);

            const { lines } = await cartService.merge(
                user.id,
                [lineOf(product, 5)],
                testCallerContext
            );

            expect(lines).toEqual([
                {
                    productId: String(product._id),
                    requested: 5,
                    resulting: 999,
                    reason: 'capped'
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({ [String(product._id)]: 999 });
        });

        it('keeps the lines in request order, one result each, whatever became of them', async () => {
            const user = await createUser();
            const fine = await createProduct();
            const scarce = await createProduct({ onHand: 1 });
            const hidden = await createProduct();
            await productService.removeById(String(hidden._id), false);

            const { lines } = await cartService.merge(
                user.id,
                [lineOf(hidden, 1), lineOf(fine, 2), lineOf(scarce, 3)],
                testCallerContext
            );

            expect(lines.map(({ productId }) => productId)).toEqual([
                String(hidden._id),
                String(fine._id),
                String(scarce._id)
            ]);
            expect(lines.map(({ reason }) => reason)).toEqual(['removed', undefined, undefined]);
            expect(lines.map(({ resulting }) => resulting)).toEqual([0, 2, 1]);
        });

        it('answers a product listed twice as two results, the second seeing the first', async () => {
            const user = await createUser();
            const product = await createProduct();

            const { lines } = await cartService.merge(
                user.id,
                [lineOf(product, 1), lineOf(product, 2)],
                testCallerContext
            );

            expect(lines).toEqual([
                {
                    productId: String(product._id),
                    requested: 1,
                    resulting: 1
                },
                {
                    productId: String(product._id),
                    requested: 2,
                    resulting: 3,
                    reason: 'summed'
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({ [String(product._id)]: 3 });
        });

        it('answers the merged cart alongside', async () => {
            const user = await createUser();
            const product = await createProduct();

            const { cart } = await cartService.merge(
                user.id,
                [lineOf(product, 2)],
                testCallerContext
            );

            expect(cart.items.map(({ productId }) => productId)).toEqual([String(product._id)]);
        });
    });

    describe('stock clamps a line and warns', () => {
        it('adds a short line up to what can be bought, with no reason and one warning', async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 5 });

            const { lines, warnings } = await cartService.merge(
                user.id,
                [lineOf(product, 8)],
                testCallerContext
            );

            expect(lines).toEqual([{ productId: String(product._id), requested: 8, resulting: 5 }]);
            expect(warnings).toEqual([
                {
                    code: 'MERCHANDISE_NOT_ENOUGH_STOCK',
                    productId: String(product._id),
                    requested: 8,
                    resulting: 5
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({ [String(product._id)]: 5 });
        });

        it('does not warn for a line that fits exactly what can be bought', async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 5 });

            const { lines, warnings } = await cartService.merge(
                user.id,
                [lineOf(product, 5)],
                testCallerContext
            );

            expect(lines[0]).toMatchObject({ resulting: 5 });
            expect(warnings).toBeUndefined();
        });

        it('counts the summed quantity against what can be bought', async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 5 });
            await cartService.addItemById(user.id, String(product._id), 3);

            const { lines, warnings } = await cartService.merge(
                user.id,
                [lineOf(product, 4)],
                testCallerContext
            );

            expect(lines[0]).toMatchObject({ resulting: 5, reason: 'summed' });
            expect(warnings).toEqual([
                {
                    code: 'MERCHANDISE_NOT_ENOUGH_STOCK',
                    productId: String(product._id),
                    requested: 7,
                    resulting: 5
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({ [String(product._id)]: 5 });
        });

        it('never lowers a line the cart already holds above what can be bought', async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 10 });
            await cartService.addItemById(user.id, String(product._id), 8);
            // Five of the ten leave the shelf, through the ledger the merge reads.
            await inventoryService.adjust(String(product._id), -5, 'stocktake', testCallerContext);

            const { lines, warnings } = await cartService.merge(
                user.id,
                [lineOf(product, 1)],
                testCallerContext
            );

            expect(lines[0]).toEqual({
                productId: String(product._id),
                requested: 1,
                resulting: 8
            });
            expect(warnings).toMatchObject([
                { code: 'MERCHANDISE_NOT_ENOUGH_STOCK', requested: 9, resulting: 8 }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({ [String(product._id)]: 8 });
        });

        it('adds nothing of a sold-out product, warns it is out of stock, and does not call it removed', async () => {
            const user = await createUser();
            const sold = await createProduct({ onHand: 0 });

            const { lines, warnings } = await cartService.merge(
                user.id,
                [lineOf(sold, 2)],
                testCallerContext
            );

            expect(lines).toEqual([{ productId: String(sold._id), requested: 2, resulting: 0 }]);
            expect(warnings).toEqual([
                {
                    code: 'MERCHANDISE_OUT_OF_STOCK',
                    productId: String(sold._id),
                    requested: 2,
                    resulting: 0
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({});
            expect(announced).not.toHaveBeenCalled();
        });

        it('warns a capped line that is also short, keeping the reason the cap gave', async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 1000 });
            await cartService.addItemById(user.id, String(product._id), 995);
            await inventoryService.adjust(String(product._id), -3, 'stocktake', testCallerContext);

            const { lines, warnings } = await cartService.merge(
                user.id,
                [lineOf(product, 10)],
                testCallerContext
            );

            // 997 can be bought, the cap is 999: the cap leaves 4 to add, stock 2 of them.
            expect(lines[0]).toMatchObject({ resulting: 997, reason: 'capped' });
            expect(warnings).toMatchObject([
                { code: 'MERCHANDISE_NOT_ENOUGH_STOCK', requested: 999, resulting: 997 }
            ]);
        });

        it('counts a hold another shopper’s checkout put on the shelf', async () => {
            const buyer = await createUser({ email: 'buyer@example.com' });
            await giveAddress(buyer.id);
            const product = await createProduct({ onHand: 10 });
            await cartService.addItemById(buyer.id, String(product._id), 6);
            await cartRepository.setShippingMethod(buyer.id, 'pickup');
            resetDomainEvents();
            registerCheckoutModules([paymentsModule]);
            await expect(
                cartService.orderConfirm(buyer.id, testCallerContext, undefined)
            ).resolves.toMatchObject({ success: true });
            onDomainEvent(CART_MERGE_REFUSED, announced);

            const guest = await createUser({ email: 'guest@example.com' });
            const fits = await cartService.merge(guest.id, [lineOf(product, 4)], testCallerContext);
            const over = await cartService.merge(guest.id, [lineOf(product, 1)], testCallerContext);

            // 10 on the shelf, 6 held by the open order: 4 left to buy. Four fit, a fifth does not.
            expect(fits.lines[0]).toMatchObject({ resulting: 4 });
            expect(fits.warnings).toBeUndefined();
            expect(over.lines[0]).toMatchObject({ resulting: 4 });
            expect(over.warnings).toMatchObject([
                { code: 'MERCHANDISE_NOT_ENOUGH_STOCK', requested: 5, resulting: 4 }
            ]);
        });

        it('warns each clamped line once, in request order, and lets the rest land', async () => {
            const user = await createUser();
            const fine = await createProduct({ onHand: 50 });
            const scarce = await createProduct({ onHand: 1 });
            const none = await createProduct({ onHand: 0 });

            const { warnings } = await cartService.merge(
                user.id,
                [lineOf(fine, 2), lineOf(scarce, 3), lineOf(none, 1)],
                testCallerContext
            );

            expect(warnings?.map(({ code, productId }) => [code, productId])).toEqual([
                ['MERCHANDISE_NOT_ENOUGH_STOCK', String(scarce._id)],
                ['MERCHANDISE_OUT_OF_STOCK', String(none._id)]
            ]);
            await expect(quantities(user.id)).resolves.toEqual({
                [String(fine._id)]: 2,
                [String(scarce._id)]: 1
            });
        });
    });

    describe('a product the catalogue will not show', () => {
        it('is "removed", leaves a line the cart already held as it was, and the rest still land', async () => {
            const user = await createUser();
            const fine = await createProduct();
            const hidden = await createProduct();
            await cartService.addItemById(user.id, String(hidden._id), 2);
            await productService.removeById(String(hidden._id), false);

            const { lines } = await cartService.merge(
                user.id,
                [lineOf(hidden, 1), lineOf(fine, 1)],
                testCallerContext
            );

            expect(lines).toEqual([
                {
                    productId: String(hidden._id),
                    requested: 1,
                    resulting: 2,
                    reason: 'removed'
                },
                {
                    productId: String(fine._id),
                    requested: 1,
                    resulting: 1
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({
                [String(hidden._id)]: 2,
                [String(fine._id)]: 1
            });
        });

        it('is refused the same way when it was hard-deleted, and writes nothing', async () => {
            const user = await createUser();
            const gone = await createProduct();
            await productService.removeById(String(gone._id), true);

            const { lines } = await cartService.merge(
                user.id,
                [lineOf(gone, 3)],
                testCallerContext
            );

            expect(lines).toEqual([
                {
                    productId: String(gone._id),
                    requested: 3,
                    resulting: 0,
                    reason: 'removed'
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({});
        });
    });

    describe('the notification event', () => {
        it('is emitted once, with every removed line, its requested quantity and the names', async () => {
            const user = await createUser();
            const hidden = await createProduct({ title: 'Hidden thing' });
            const deleted = await createProduct({ title: 'Deleted thing' });
            await productService.removeById(String(hidden._id), false);
            await productService.removeById(String(deleted._id), false);

            await cartService.merge(
                user.id,
                [lineOf(hidden, 2), lineOf(deleted, 3)],
                testCallerContext
            );

            expect(announced).toHaveBeenCalledTimes(1);
            expect(announced).toHaveBeenCalledWith(
                {
                    userId: user.id,
                    lines: [
                        {
                            productId: String(hidden._id),
                            requested: 2,
                            titles: { en: 'Hidden thing' }
                        },
                        {
                            productId: String(deleted._id),
                            requested: 3,
                            titles: { en: 'Deleted thing' }
                        }
                    ]
                },
                expect.anything()
            );
        });

        it('says nothing for a sold-out product: it was added, and a stock-out is temporary', async () => {
            const user = await createUser();
            const soldOut = await createProduct({ onHand: 0 });

            await cartService.merge(user.id, [lineOf(soldOut, 3)], testCallerContext);

            expect(announced).not.toHaveBeenCalled();
        });

        it('carries an empty name map for a product that no longer exists at all', async () => {
            const user = await createUser();
            const gone = await createProduct();
            await productService.removeById(String(gone._id), true);

            await cartService.merge(user.id, [lineOf(gone, 1)], testCallerContext);

            expect(announced).toHaveBeenCalledWith(
                expect.objectContaining({ lines: [expect.objectContaining({ titles: {} })] }),
                expect.anything()
            );
        });

        it('says nothing for lines that landed with another quantity: that is the answer’s to show', async () => {
            const user = await createUser();
            const summed = await createProduct();
            const scarce = await createProduct({ onHand: 1 });
            const capped = await createProduct({ onHand: 5000 });
            await cartService.addItemById(user.id, String(summed._id), 1);
            await cartService.addItemById(user.id, String(capped._id), 999);

            await cartService.merge(
                user.id,
                [lineOf(summed, 1), lineOf(scarce, 4), lineOf(capped, 1)],
                testCallerContext
            );

            expect(announced).not.toHaveBeenCalled();
        });

        it('says nothing when every line landed as asked', async () => {
            const user = await createUser();
            const product = await createProduct();

            await cartService.merge(user.id, [lineOf(product, 1)], testCallerContext);

            expect(announced).not.toHaveBeenCalled();
        });
    });
});
