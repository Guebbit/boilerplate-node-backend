/**
 * @module
 * Product states as the cart sees them: a hidden or off-sale product's line is KEPT and reads
 * `out_of_stock` with nothing to buy, and checkout refuses each for its own reason. A new add of an
 * off-sale product is clamped to nothing. Nothing here removes a line — only a deletion does.
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
import paymentsModule from '@modules/payments/module';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { cartService } from '../../services';
import { cartRepository } from '../../repository';
import { CART_MERGE_REFUSED } from '../../events';

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    registerCheckoutModules([paymentsModule]);
});

/** The stock answer of the one line in the user's cart. */
const stockOf = (userId: string) =>
    cartService.getForView(userId, testCallerContext).then(({ items, checkoutable }) => ({
        availability: items[0]?.availability,
        quantityAvailable: items[0]?.quantityAvailable,
        checkoutable
    }));

/** The quantities the cart holds, as `productId → quantity`. */
const heldBy = (userId: string) =>
    cartService
        .getForView(userId, testCallerContext)
        .then(({ items }) =>
            Object.fromEntries(items.map(({ productId, quantity }) => [productId, quantity]))
        );

/** Flip a product's flags the way an admin edit does. */
const edit = (id: unknown, data: { active?: boolean; purchasable?: boolean }) =>
    productService.updateById(String(id), data, testCallerContext);

describe('a hidden product (active: false)', () => {
    it('keeps the line, reads nothing to buy, and returns to in_stock on reactivation', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5 });
        await cartService.addItemById(user.id, String(product._id), 2);

        await edit(product._id, { active: false });
        await expect(stockOf(user.id)).resolves.toEqual({
            availability: 'out_of_stock',
            quantityAvailable: 0,
            checkoutable: false
        });
        await expect(heldBy(user.id)).resolves.toEqual({ [String(product._id)]: 2 });

        await edit(product._id, { active: true });
        await expect(stockOf(user.id)).resolves.toEqual({
            availability: 'in_stock',
            quantityAvailable: 5,
            checkoutable: true
        });
    });

    it('refuses a new add as a 404, so a hidden product is not revealed', async () => {
        const user = await createUser();
        const product = await createProduct({ active: false });

        const result = await cartService.addItemById(user.id, String(product._id), 1);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('is refused by checkout as a missing product, not as stock', async () => {
        const user = await createUser();
        await giveAddress(user.id);
        const product = await createProduct({ onHand: 5 });
        await cartService.addItemById(user.id, String(product._id), 1);
        await cartRepository.setShippingMethod(user.id, 'pickup');
        await edit(product._id, { active: false });

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(!result.success && result.errors[0]).toMatchObject({
            code: 'CART_PRODUCT_UNAVAILABLE'
        });
        // A 409 on every path: the pre-flight and the write-side refusal say the same thing.
        expect(!result.success && result.status).toBe(409);
    });
});

describe('an off-sale product (purchasable: false)', () => {
    it('is not added to the cart: the write succeeds with nothing added and says why', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5, purchasable: false });

        const added = await cartService.addItemById(user.id, String(product._id), 2);

        expect(added.success && added.data.items).toEqual([]);
        expect(added.success && added.data.warnings).toEqual([
            {
                code: 'MERCHANDISE_OUT_OF_STOCK',
                productId: String(product._id),
                requested: 2,
                resulting: 0
            }
        ]);
        await expect(heldBy(user.id)).resolves.toEqual({});
    });

    it('keeps a line already in the cart, reading nothing to buy until it is back on sale', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5 });
        await cartService.addItemById(user.id, String(product._id), 2);

        await edit(product._id, { purchasable: false });
        await expect(stockOf(user.id)).resolves.toEqual({
            availability: 'out_of_stock',
            quantityAvailable: 0,
            checkoutable: false
        });

        await edit(product._id, { purchasable: true });
        await expect(stockOf(user.id)).resolves.toEqual({
            availability: 'in_stock',
            quantityAvailable: 5,
            checkoutable: true
        });
    });

    it('is refused by checkout under the stock refusal, with nothing to buy', async () => {
        const user = await createUser();
        await giveAddress(user.id);
        const product = await createProduct({ onHand: 5, title: 'Heated Bed' });
        await cartService.addItemById(user.id, String(product._id), 1);
        await cartRepository.setShippingMethod(user.id, 'pickup');
        await edit(product._id, { purchasable: false });

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.status).toBe(409);
        expect(!result.success && result.errors[0]).toMatchObject({
            code: 'CART_INSUFFICIENT_STOCK',
            details: {
                lines: [
                    {
                        productId: String(product._id),
                        title: 'Heated Bed',
                        requested: 1,
                        quantityAvailable: 0
                    }
                ]
            }
        });
    });

    it('places no hold on the shelf when checkout refuses it', async () => {
        const user = await createUser();
        await giveAddress(user.id);
        const product = await createProduct({ onHand: 5 });
        await cartService.addItemById(user.id, String(product._id), 1);
        await cartRepository.setShippingMethod(user.id, 'pickup');
        await edit(product._id, { purchasable: false });

        await cartService.orderConfirm(user.id, testCallerContext, undefined);

        await expect(heldBy(user.id)).resolves.toEqual({ [String(product._id)]: 1 });
    });
});

describe('merge, by product state', () => {
    const announced = jest.fn();

    beforeEach(() => {
        announced.mockReset();
        onDomainEvent(CART_MERGE_REFUSED, announced);
    });

    it('adds nothing of an off-sale product, warns it is out of stock, and announces nothing', async () => {
        const user = await createUser();
        const offSale = await createProduct({ onHand: 5, purchasable: false });

        const { lines, warnings } = await cartService.merge(
            user.id,
            [{ productId: String(offSale._id), quantity: 2 }],
            testCallerContext
        );

        expect(lines).toEqual([{ productId: String(offSale._id), requested: 2, resulting: 0 }]);
        expect(warnings).toEqual([
            {
                code: 'MERCHANDISE_OUT_OF_STOCK',
                productId: String(offSale._id),
                requested: 2,
                resulting: 0
            }
        ]);
        await expect(heldBy(user.id)).resolves.toEqual({});
        expect(announced).not.toHaveBeenCalled();
    });

    it('does not add a hidden product: reason removed, no stock warning, announced', async () => {
        const user = await createUser();
        const hidden = await createProduct({ onHand: 5, active: false });

        const { lines, warnings } = await cartService.merge(
            user.id,
            [{ productId: String(hidden._id), quantity: 2 }],
            testCallerContext
        );

        expect(lines).toEqual([
            { productId: String(hidden._id), requested: 2, resulting: 0, reason: 'removed' }
        ]);
        expect(warnings).toBeUndefined();
        await expect(heldBy(user.id)).resolves.toEqual({});
        expect(announced).toHaveBeenCalledTimes(1);
    });
});
