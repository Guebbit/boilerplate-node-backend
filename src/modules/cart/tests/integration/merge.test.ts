/**
 * @module
 * `cartMerge` — a guest cart folded into the signed-in one. The rule is `POST /cart`'s, applied
 * line by line: quantities add up, a line the cart cannot take as asked is ANSWERED rather than
 * failed, and one bad line never strands the rest. Stock never changes what is added: a short or
 * sold-out line is added and FLAGGED, and the flag is never the number. What it announces for the
 * lines that could not be added at all is the contract with `notifications`.
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
import { cartGet, cartItemAddById, cartMerge, orderConfirm } from '../../services';
import { cartRepository } from '../../repository';
import { CART_MERGE_REFUSED } from '../../events';

setupTestDb();

// These cases fill a line up to the contract's 999 ceiling: lift the shop's own, lower, default.
beforeEach(() => {
    overrideEnvironment({ NODE_CART_LINE_MAX: '999' });
});

afterEach(() => {
    resetEnvironmentOverrides();
});

/** What the cart now holds, as `productId → quantity`. */
const quantities = (userId: string) =>
    cartGet(userId).then((lines) =>
        Object.fromEntries(lines.map(({ productId, quantity }) => [productId, quantity]))
    );

/** A guest line, by product document. */
const lineOf = (product: { _id: unknown }, quantity: number) => ({
    productId: String(product._id),
    quantity
});

describe('cartMerge', () => {
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

            const { lines } = await cartMerge(user.id, [lineOf(product, 2)], testCallerContext);

            expect(lines).toEqual([
                {
                    productId: String(product._id),
                    requested: 2,
                    resulting: 2,
                    insufficientStock: false
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({ [String(product._id)]: 2 });
        });

        it('adds up a product held in both carts, like two POST /cart calls, and says "summed"', async () => {
            const user = await createUser();
            const product = await createProduct();
            await cartItemAddById(user.id, String(product._id), 3);

            const { lines } = await cartMerge(user.id, [lineOf(product, 4)], testCallerContext);

            expect(lines).toEqual([
                {
                    productId: String(product._id),
                    requested: 4,
                    resulting: 7,
                    reason: 'summed',
                    insufficientStock: false
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({ [String(product._id)]: 7 });
        });

        it('stops a line at the ceiling and says "capped"', async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 5000 });
            await cartItemAddById(user.id, String(product._id), 998);

            const { lines } = await cartMerge(user.id, [lineOf(product, 5)], testCallerContext);

            expect(lines).toEqual([
                {
                    productId: String(product._id),
                    requested: 5,
                    resulting: 999,
                    reason: 'capped',
                    insufficientStock: false
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

            const { lines } = await cartMerge(
                user.id,
                [lineOf(hidden, 1), lineOf(fine, 2), lineOf(scarce, 3)],
                testCallerContext
            );

            expect(lines.map(({ productId }) => productId)).toEqual([
                String(hidden._id),
                String(fine._id),
                String(scarce._id)
            ]);
            expect(lines.map(({ reason }) => reason)).toEqual([
                'unavailable',
                undefined,
                undefined
            ]);
            expect(lines.map(({ insufficientStock }) => insufficientStock)).toEqual([
                false,
                false,
                true
            ]);
        });

        it('answers a product listed twice as two results, the second seeing the first', async () => {
            const user = await createUser();
            const product = await createProduct();

            const { lines } = await cartMerge(
                user.id,
                [lineOf(product, 1), lineOf(product, 2)],
                testCallerContext
            );

            expect(lines).toEqual([
                {
                    productId: String(product._id),
                    requested: 1,
                    resulting: 1,
                    insufficientStock: false
                },
                {
                    productId: String(product._id),
                    requested: 2,
                    resulting: 3,
                    reason: 'summed',
                    insufficientStock: false
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({ [String(product._id)]: 3 });
        });

        it('answers the merged cart alongside', async () => {
            const user = await createUser();
            const product = await createProduct();

            const { cart } = await cartMerge(user.id, [lineOf(product, 2)], testCallerContext);

            expect(cart.items.map(({ productId }) => productId)).toEqual([String(product._id)]);
        });
    });

    describe('stock flags a line and never changes it', () => {
        it('adds a short line in full and flags it, with no reason', async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 5 });

            const { lines } = await cartMerge(user.id, [lineOf(product, 8)], testCallerContext);

            expect(lines).toEqual([
                {
                    productId: String(product._id),
                    requested: 8,
                    resulting: 8,
                    insufficientStock: true
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({ [String(product._id)]: 8 });
        });

        it('does not flag a line that fits exactly what is for sale', async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 5 });

            const { lines } = await cartMerge(user.id, [lineOf(product, 5)], testCallerContext);

            expect(lines[0]).toMatchObject({ resulting: 5, insufficientStock: false });
        });

        it('counts the summed quantity against what is for sale, and keeps the sum', async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 5 });
            await cartItemAddById(user.id, String(product._id), 3);

            const { lines } = await cartMerge(user.id, [lineOf(product, 4)], testCallerContext);

            expect(lines[0]).toMatchObject({
                resulting: 7,
                reason: 'summed',
                insufficientStock: true
            });
            await expect(quantities(user.id)).resolves.toEqual({ [String(product._id)]: 7 });
        });

        it('never lowers a line the cart already holds above what is for sale', async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 10 });
            await cartItemAddById(user.id, String(product._id), 8);
            // Five of the ten leave the shelf, through the ledger the merge reads.
            await inventoryService.adjust(String(product._id), -5, 'stocktake');

            const { lines } = await cartMerge(user.id, [lineOf(product, 1)], testCallerContext);

            expect(lines[0]).toMatchObject({
                resulting: 9,
                reason: 'summed',
                insufficientStock: true
            });
            await expect(quantities(user.id)).resolves.toEqual({ [String(product._id)]: 9 });
        });

        it('adds a sold-out product like POST /cart would, and flags it, not "unavailable"', async () => {
            const user = await createUser();
            const sold = await createProduct({ onHand: 0 });

            const { lines } = await cartMerge(user.id, [lineOf(sold, 2)], testCallerContext);

            expect(lines).toEqual([
                {
                    productId: String(sold._id),
                    requested: 2,
                    resulting: 2,
                    insufficientStock: true
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({ [String(sold._id)]: 2 });
        });

        it('flags a capped line that is also short, keeping the reason the cap gave', async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 10 });
            await cartItemAddById(user.id, String(product._id), 998);

            const { lines } = await cartMerge(user.id, [lineOf(product, 5)], testCallerContext);

            expect(lines[0]).toMatchObject({
                resulting: 999,
                reason: 'capped',
                insufficientStock: true
            });
        });

        it('counts a hold another shopper’s checkout put on the shelf', async () => {
            const buyer = await createUser({ email: 'buyer@example.com' });
            await giveAddress(buyer.id);
            const product = await createProduct({ onHand: 10 });
            await cartItemAddById(buyer.id, String(product._id), 6);
            await cartRepository.setShippingMethod(buyer.id, 'pickup');
            resetDomainEvents();
            registerCheckoutModules([paymentsModule]);
            await expect(
                orderConfirm(buyer.id, testCallerContext, undefined)
            ).resolves.toMatchObject({ success: true });
            onDomainEvent(CART_MERGE_REFUSED, announced);

            const guest = await createUser({ email: 'guest@example.com' });
            const fits = await cartMerge(guest.id, [lineOf(product, 4)], testCallerContext);
            const over = await cartMerge(guest.id, [lineOf(product, 1)], testCallerContext);

            // 10 on the shelf, 6 held by the open order: 4 left to sell. Four fit, five do not.
            expect(fits.lines[0]).toMatchObject({ resulting: 4, insufficientStock: false });
            expect(over.lines[0]).toMatchObject({ resulting: 5, insufficientStock: true });
        });
    });

    describe('the flag never carries a number', () => {
        it('answers the same body for a line short by one as for a line short by hundreds', async () => {
            const user = await createUser();
            const nearly = await createProduct({ onHand: 4 });
            const hardly = await createProduct({ onHand: 1 });

            const { lines } = await cartMerge(
                user.id,
                [lineOf(nearly, 5), lineOf(hardly, 5)],
                testCallerContext
            );

            const [first, second] = lines;
            expect({ ...first, productId: '' }).toEqual({ ...second, productId: '' });
            expect(Object.keys(first ?? {}).toSorted()).toEqual([
                'insufficientStock',
                'productId',
                'requested',
                'resulting'
            ]);
        });

        it('answers a sold-out line exactly as it answers a nearly sold-out one', async () => {
            const user = await createUser();
            const none = await createProduct({ onHand: 0 });
            const one = await createProduct({ onHand: 1 });

            const { lines } = await cartMerge(
                user.id,
                [lineOf(none, 3), lineOf(one, 3)],
                testCallerContext
            );

            const [first, second] = lines;
            expect({ ...first, productId: '' }).toEqual({ ...second, productId: '' });
        });
    });

    describe('a product the catalogue will not show', () => {
        it('is "unavailable", leaves a line the cart already held as it was, and the rest still land', async () => {
            const user = await createUser();
            const fine = await createProduct();
            const hidden = await createProduct();
            await cartItemAddById(user.id, String(hidden._id), 2);
            await productService.removeById(String(hidden._id), false);

            const { lines } = await cartMerge(
                user.id,
                [lineOf(hidden, 1), lineOf(fine, 1)],
                testCallerContext
            );

            expect(lines).toEqual([
                {
                    productId: String(hidden._id),
                    requested: 1,
                    resulting: 2,
                    reason: 'unavailable',
                    insufficientStock: true
                },
                {
                    productId: String(fine._id),
                    requested: 1,
                    resulting: 1,
                    insufficientStock: false
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

            const { lines } = await cartMerge(user.id, [lineOf(gone, 3)], testCallerContext);

            expect(lines).toEqual([
                {
                    productId: String(gone._id),
                    requested: 3,
                    resulting: 0,
                    reason: 'unavailable',
                    insufficientStock: false
                }
            ]);
            await expect(quantities(user.id)).resolves.toEqual({});
        });
    });

    describe('the notification event', () => {
        it('is emitted once, with every unavailable line, its requested quantity and the names', async () => {
            const user = await createUser();
            const hidden = await createProduct({ title: 'Hidden thing' });
            const deleted = await createProduct({ title: 'Deleted thing' });
            await productService.removeById(String(hidden._id), false);
            await productService.removeById(String(deleted._id), false);

            await cartMerge(user.id, [lineOf(hidden, 2), lineOf(deleted, 3)], testCallerContext);

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

            await cartMerge(user.id, [lineOf(soldOut, 3)], testCallerContext);

            expect(announced).not.toHaveBeenCalled();
        });

        it('carries an empty name map for a product that no longer exists at all', async () => {
            const user = await createUser();
            const gone = await createProduct();
            await productService.removeById(String(gone._id), true);

            await cartMerge(user.id, [lineOf(gone, 1)], testCallerContext);

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
            await cartItemAddById(user.id, String(summed._id), 1);
            await cartItemAddById(user.id, String(capped._id), 999);

            await cartMerge(
                user.id,
                [lineOf(summed, 1), lineOf(scarce, 4), lineOf(capped, 1)],
                testCallerContext
            );

            expect(announced).not.toHaveBeenCalled();
        });

        it('says nothing when every line landed as asked', async () => {
            const user = await createUser();
            const product = await createProduct();

            await cartMerge(user.id, [lineOf(product, 1)], testCallerContext);

            expect(announced).not.toHaveBeenCalled();
        });
    });
});
