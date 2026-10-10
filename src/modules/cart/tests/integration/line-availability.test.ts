/**
 * @module
 * Product states as the cart sees them: a hidden product's line is KEPT and reads `removed`, an
 * off-sale product's line is kept and reads `unavailable`, and checkout refuses both for its own
 * reason. Nothing here removes a line — only a deletion does.
 *
 * See: docs/modules/cart.md#line-availability
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { giveAddress } from '@modules/addresses/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { productService } from '@modules/products';
import paymentsModule from '@modules/payments/module';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { cartGetForView, cartItemAddById, cartMerge, orderConfirm } from '../../services';
import { cartRepository } from '../../repository';
import { CART_MERGE_REFUSED } from '../../events';

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    registerCheckoutModules([paymentsModule]);
});

/** The availability of the one line in the user's cart. */
const availabilityOf = (userId: string) =>
    cartGetForView(userId, testCallerContext).then(({ items }) => items[0]?.availability);

/** The quantities the cart holds, as `productId → quantity`. */
const heldBy = (userId: string) =>
    cartGetForView(userId, testCallerContext).then(({ items }) =>
        Object.fromEntries(items.map(({ productId, quantity }) => [productId, quantity]))
    );

/** Flip a product's flags the way an admin edit does. */
const edit = (id: unknown, data: { active?: boolean; purchasable?: boolean }) =>
    productService.updateById(String(id), data, testCallerContext);

describe('a hidden product (active: false)', () => {
    it('keeps the line, reads removed, and returns to in_stock on reactivation', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5 });
        await cartItemAddById(user.id, String(product._id), 2);

        await edit(product._id, { active: false });
        await expect(availabilityOf(user.id)).resolves.toBe('removed');
        await expect(heldBy(user.id)).resolves.toEqual({ [String(product._id)]: 2 });

        await edit(product._id, { active: true });
        await expect(availabilityOf(user.id)).resolves.toBe('in_stock');
    });

    it('refuses a new add as a 404, so a hidden product is not revealed', async () => {
        const user = await createUser();
        const product = await createProduct({ active: false });

        const result = await cartItemAddById(user.id, String(product._id), 1);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('is refused by checkout as a missing product, not as stock', async () => {
        const user = await createUser();
        await giveAddress(user.id);
        const product = await createProduct({ onHand: 5 });
        await cartItemAddById(user.id, String(product._id), 1);
        await cartRepository.setShippingMethod(user.id, 'pickup');
        await edit(product._id, { active: false });

        const result = await orderConfirm(user.id, testCallerContext, undefined);

        expect(!result.success && result.errors[0]).toMatchObject({
            code: 'CART_PRODUCT_UNAVAILABLE'
        });
    });
});

describe('an off-sale product (purchasable: false)', () => {
    it('is accepted into the cart like a sold-out product, and reads unavailable', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5, purchasable: false });

        const added = await cartItemAddById(user.id, String(product._id), 2);

        expect(added.success).toBe(true);
        await expect(availabilityOf(user.id)).resolves.toBe('unavailable');
    });

    it('reads in_stock again once it is put back on sale', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5 });
        await cartItemAddById(user.id, String(product._id), 2);

        await edit(product._id, { purchasable: false });
        await expect(availabilityOf(user.id)).resolves.toBe('unavailable');

        await edit(product._id, { purchasable: true });
        await expect(availabilityOf(user.id)).resolves.toBe('in_stock');
    });

    it('is refused by checkout under the stock refusal, naming it unavailable', async () => {
        const user = await createUser();
        await giveAddress(user.id);
        const product = await createProduct({ onHand: 5, purchasable: false, title: 'Heated Bed' });
        await cartItemAddById(user.id, String(product._id), 1);
        await cartRepository.setShippingMethod(user.id, 'pickup');

        const result = await orderConfirm(user.id, testCallerContext, undefined);

        expect(result.status).toBe(409);
        expect(!result.success && result.errors[0]).toMatchObject({
            code: 'CART_INSUFFICIENT_STOCK',
            details: {
                lines: [
                    {
                        productId: String(product._id),
                        title: 'Heated Bed',
                        requested: 1,
                        availability: 'unavailable'
                    }
                ]
            }
        });
    });

    it('places no hold on the shelf when checkout refuses it', async () => {
        const user = await createUser();
        await giveAddress(user.id);
        const product = await createProduct({ onHand: 5, purchasable: false });
        await cartItemAddById(user.id, String(product._id), 1);
        await cartRepository.setShippingMethod(user.id, 'pickup');

        await orderConfirm(user.id, testCallerContext, undefined);

        await expect(heldBy(user.id)).resolves.toEqual({ [String(product._id)]: 1 });
    });
});

describe('merge, by product state', () => {
    const announced = jest.fn();

    beforeEach(() => {
        announced.mockReset();
        onDomainEvent(CART_MERGE_REFUSED, announced);
    });

    it('adds an off-sale product, flagged unavailable, and announces nothing', async () => {
        const user = await createUser();
        const offSale = await createProduct({ onHand: 5, purchasable: false });

        const { lines } = await cartMerge(
            user.id,
            [{ productId: String(offSale._id), quantity: 2 }],
            testCallerContext
        );

        expect(lines).toEqual([
            {
                productId: String(offSale._id),
                requested: 2,
                resulting: 2,
                availability: 'unavailable'
            }
        ]);
        expect(announced).not.toHaveBeenCalled();
    });

    it('does not add a hidden product: reason removed, availability removed, announced', async () => {
        const user = await createUser();
        const hidden = await createProduct({ onHand: 5, active: false });

        const { lines } = await cartMerge(
            user.id,
            [{ productId: String(hidden._id), quantity: 2 }],
            testCallerContext
        );

        expect(lines).toEqual([
            {
                productId: String(hidden._id),
                requested: 2,
                resulting: 0,
                reason: 'removed',
                availability: 'removed'
            }
        ]);
        await expect(heldBy(user.id)).resolves.toEqual({});
        expect(announced).toHaveBeenCalledTimes(1);
    });
});
