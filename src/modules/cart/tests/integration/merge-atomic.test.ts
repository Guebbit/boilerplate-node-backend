/**
 * @module
 * A merge and a reorder commit ALL their lines in one write, or none. What that buys the shopper:
 * a request that fails part-way leaves the cart as it was, so sending it again cannot add a line
 * twice; a cart that changes while the request is in flight is planned against again, not
 * overwritten; and the notice about removed lines can never turn a merge that wrote into a 500.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext, asCustomer } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { productService } from '@modules/products';
import { observePort } from '@tests/ports';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { logger } from '@infrastructure/adapters/logger';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { cartAnalyticsEvents } from '../../analytics';
import { cartService } from '../../services';
import { cartRepository } from '../../repository';
import { cartModel } from '../../model';
import { CART_MERGE_REFUSED } from '../../events';

/**
 * The analytics port is REPLACED with a recording wrapper around the real one, as in
 * `merge-effects.test.ts`: `jest.spyOn` cannot redefine the non-configurable property a
 * CommonJS namespace import exposes under the swc transform the mutation runs use.
 */
jest.mock('@infrastructure/observability/analytics', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/analytics')>(
        '@infrastructure/observability/analytics'
    );
    return { __esModule: true, ...actual, emitAnalyticsEvent: jest.fn(actual.emitAnalyticsEvent) };
});

setupTestDb();

afterEach(() => {
    jest.restoreAllMocks();
});

/** What the cart holds, as `productId → quantity`; empty for a user with no cart. */
const heldBy = (userId: string) =>
    cartRepository
        .findByUserId(userId)
        .then((cart) =>
            Object.fromEntries(
                (cart?.items ?? []).map(({ productId, quantity }) => [String(productId), quantity])
            )
        );

/** A guest line, by product document. */
const lineOf = (product: { _id: unknown }, quantity: number) => ({
    productId: String(product._id),
    quantity
});

describe('a merge is one write', () => {
    it('writes the cart once however many lines it brings', async () => {
        const user = await createUser();
        const [first, second, third] = await Promise.all([
            createProduct(),
            createProduct(),
            createProduct()
        ]);
        await cartService.addItemById(user.id, String(first._id), 1);
        const update = jest.spyOn(cartModel, 'findOneAndUpdate');

        await cartService.merge(
            user.id,
            [lineOf(first, 1), lineOf(second, 2), lineOf(third, 3)],
            testCallerContext
        );

        expect(update).toHaveBeenCalledTimes(1);
        await expect(heldBy(user.id)).resolves.toEqual({
            [String(first._id)]: 2,
            [String(second._id)]: 2,
            [String(third._id)]: 3
        });
    });

    it('leaves the cart as it was when the write fails, so a resend lands each line once', async () => {
        const user = await createUser();
        const kept = await createProduct();
        const fresh = await createProduct();
        await cartService.addItemById(user.id, String(kept._id), 1);
        const lines = [lineOf(kept, 1), lineOf(fresh, 2)];
        jest.spyOn(cartRepository, 'replaceLinesIfUnchanged').mockRejectedValueOnce(
            new Error('connection lost')
        );
        const emit = observePort(analyticsPort.emitAnalyticsEvent);

        await expect(cartService.merge(user.id, lines, testCallerContext)).rejects.toThrow(
            'connection lost'
        );
        await expect(heldBy(user.id)).resolves.toEqual({ [String(kept._id)]: 1 });
        // A write that failed counts nothing: the lines did not land.
        expect(emit).not.toHaveBeenCalled();

        await cartService.merge(user.id, lines, testCallerContext);
        await expect(heldBy(user.id)).resolves.toEqual({
            [String(kept._id)]: 2,
            [String(fresh._id)]: 2
        });
    });

    it('creates no cart, and counts nothing, when no line could be added', async () => {
        const user = await createUser();
        const gone = await createProduct();
        await productService.removeById(String(gone._id), true);
        const update = jest.spyOn(cartRepository, 'replaceLinesIfUnchanged');
        const emit = observePort(analyticsPort.emitAnalyticsEvent);

        const { lines } = await cartService.merge(user.id, [lineOf(gone, 1)], testCallerContext);

        expect(lines).toEqual([expect.objectContaining({ reason: 'removed', resulting: 0 })]);
        expect(update).not.toHaveBeenCalled();
        expect(emit).not.toHaveBeenCalled();
        await expect(cartRepository.findByUserId(user.id)).resolves.toBeNull();
    });
});

describe('a cart that changes during a merge', () => {
    it('is planned against again: the concurrent add is kept and summed', async () => {
        const user = await createUser();
        const product = await createProduct();
        const other = await createProduct();
        const write = cartRepository.replaceLinesIfUnchanged;
        /**
         * Between the plan's read and its write another request adds to the cart (and bumps its
         * version): the first write must be refused, and the second plan must see the new line.
         */
        jest.spyOn(cartRepository, 'replaceLinesIfUnchanged').mockImplementationOnce((...args) =>
            cartService.addItemById(user.id, String(product._id), 2).then(() => write(...args))
        );
        await cartService.addItemById(user.id, String(other._id), 1);
        const emit = observePort(analyticsPort.emitAnalyticsEvent);

        const { lines } = await cartService.merge(user.id, [lineOf(product, 3)], testCallerContext);

        expect(lines).toEqual([
            {
                productId: String(product._id),
                requested: 3,
                resulting: 5,
                reason: 'summed',
                availability: 'in_stock'
            }
        ]);
        await expect(heldBy(user.id)).resolves.toEqual({
            [String(other._id)]: 1,
            [String(product._id)]: 5
        });
        // The refused first plan counted nothing: one event, for the plan that landed.
        expect(emit).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledWith(
            expect.objectContaining({
                event: cartAnalyticsEvents.CART_ITEM_UPDATED,
                properties: { product_id: String(product._id), quantity: 3 }
            })
        );
    });

    it('is planned against again when the cart did not exist and was created meanwhile', async () => {
        const user = await createUser();
        const product = await createProduct();
        const write = cartRepository.replaceLinesIfUnchanged;
        jest.spyOn(cartRepository, 'replaceLinesIfUnchanged').mockImplementationOnce((...args) =>
            cartService.addItemById(user.id, String(product._id), 1).then(() => write(...args))
        );

        await cartService.merge(user.id, [lineOf(product, 2)], testCallerContext);

        await expect(heldBy(user.id)).resolves.toEqual({ [String(product._id)]: 3 });
    });

    it('gives up with an error, writing nothing, when the cart moves on every attempt', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartService.addItemById(user.id, String(product._id), 1);
        jest.spyOn(cartRepository, 'replaceLinesIfUnchanged').mockResolvedValue(null);

        await expect(
            cartService.merge(user.id, [lineOf(product, 1)], testCallerContext)
        ).rejects.toThrow('exhausted retries');
        await expect(heldBy(user.id)).resolves.toEqual({ [String(product._id)]: 1 });
    });
});

describe('the notice about removed lines', () => {
    it('still goes out, with no names for that line, when the names cannot be read', async () => {
        const user = await createUser();
        const hidden = await createProduct();
        const shown = await createProduct();
        await productService.removeById(String(hidden._id), false);
        jest.spyOn(productService, 'titlesOf').mockRejectedValueOnce(new Error('names down'));
        const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
        resetDomainEvents();
        const announced = jest.fn();
        onDomainEvent(CART_MERGE_REFUSED, announced);

        const { lines } = await cartService.merge(
            user.id,
            [lineOf(hidden, 2), lineOf(shown, 1)],
            testCallerContext
        );

        expect(lines).toEqual([
            expect.objectContaining({ productId: String(hidden._id), reason: 'removed' }),
            expect.objectContaining({ productId: String(shown._id), resulting: 1 })
        ]);
        expect(announced).toHaveBeenCalledWith(
            {
                userId: user.id,
                lines: [{ productId: String(hidden._id), requested: 2, titles: {} }]
            },
            expect.anything()
        );
        expect(logged).toHaveBeenCalledTimes(1);
        await expect(heldBy(user.id)).resolves.toEqual({ [String(shown._id)]: 1 });
    });
});

describe('a reorder is one write too', () => {
    it('leaves the cart as it was when the write fails, so a retry lands each line once', async () => {
        const user = await createUser();
        const kept = await createProduct();
        const fresh = await createProduct();
        await cartService.addItemById(user.id, String(kept._id), 1);
        const order = await createOrder(user, [toOrderItem(kept, 1), toOrderItem(fresh, 2)]);
        jest.spyOn(cartRepository, 'replaceLinesIfUnchanged').mockRejectedValueOnce(
            new Error('connection lost')
        );

        const failed = await cartService.reorderIntoCart(
            asCustomer(user.id),
            String(order._id),
            testCallerContext
        );
        expect(failed.success).toBe(false);
        await expect(heldBy(user.id)).resolves.toEqual({ [String(kept._id)]: 1 });

        const retried = await cartService.reorderIntoCart(
            asCustomer(user.id),
            String(order._id),
            testCallerContext
        );
        expect(retried.success).toBe(true);
        await expect(heldBy(user.id)).resolves.toEqual({
            [String(kept._id)]: 2,
            [String(fresh._id)]: 2
        });
    });

    it('answers with the cart the write returned', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 2)]);

        const result = await cartService.reorderIntoCart(
            asCustomer(user.id),
            String(order._id),
            testCallerContext
        );

        expect(result).toMatchObject({
            success: true,
            data: {
                cart: {
                    items: [
                        expect.objectContaining({ productId: String(product._id), quantity: 2 })
                    ]
                }
            }
        });
    });
});
