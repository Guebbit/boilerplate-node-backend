/**
 * @module
 * The address book at checkout — the resolver's three-way answer, and what an order snapshots.
 * Apart from the rest of the address-book suite because it needs a cart and an order: removing
 * the shop takes exactly this file with it.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import * as addressService from '../../service';
import { cartService } from '@modules/cart';
import { countOrders } from '@modules/orders/tests/factories';
import { createProduct, readProduct } from '@modules/products/tests/factories';
import { HOME, OFFICE } from './fixtures';

setupTestDb();

/** One in-stock product straight into the user's cart — the checkout cases' shared setup. */
const cartWith = async (userId: string) => {
    const product = await createProduct();
    await cartService.cartItemAddById(userId, String(product._id), 1);
    return product;
};

describe('checkout and the address', () => {
    it('snapshots the default when no id is named', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);
        await cartWith(user.id);

        // `standard` requires an address — this is the case that resolves it from the default.
        await cartService.cartShippingMethodSet(user.id, 'standard');
        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(true);
        expect(result.success && result.data?.shippingAddress).toMatchObject({
            fullName: 'Ada Lovelace',
            street: 'Via Roma 1'
        });
    });

    it('snapshots the NAMED entry over the default', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);
        await addressService.addressAdd(user.id, OFFICE);
        await cartWith(user.id);
        const view = await addressService.addressesGet(user.id);
        const office = view.addresses.find(({ label }) => label === 'office');

        await cartService.cartShippingMethodSet(user.id, 'standard');
        const result = await cartService.orderConfirm(user.id, testCallerContext, {
            addressId: office!.id
        });

        expect(result.success).toBe(true);
        expect(result.success && result.data?.shippingAddress?.street).toBe('Via Milano 2');
    });

    it('ships nothing rather than nowhere: a stale id refuses the checkout untouched', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);
        const product = await cartWith(user.id);
        await cartService.cartShippingMethodSet(user.id, 'standard');

        const result = await cartService.orderConfirm(user.id, testCallerContext, {
            addressId: '65dc8a99604c307b702b5ccc'
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        expect(!result.success && result.errors[0]?.code).toBe('CART_ADDRESS_NOT_FOUND');
        // Nothing moved — the address check runs before anything is held.
        const stored = await readProduct(String(product._id));
        expect(stored?.onHand).toBe(10);
        expect(stored?.reserved).toBe(0);
        const cart = await cartService.cartGetForBadge(user.id);
        expect(cart.items).toHaveLength(1);
    });

    it("naming another user's real entry is refused the same way — not silently shipped nowhere", async () => {
        // `addressForCheckout` resolves the id against the CALLER's own book, so a stranger's
        // real entry and an invented id take the same branch — but the invariant this proves is
        // ownership, not merely existence, and the doc's split return type exists for exactly
        // this case: collapsing it would let a stale/foreign id silently downgrade to "no address".
        const owner = await createUser({ email: 'owner@example.com', username: 'admin' });
        await addressService.addressAdd(owner.id, HOME);
        const ownerView = await addressService.addressesGet(owner.id);
        const ownersEntryId = ownerView.addresses[0].id;

        const stranger = await createUser({ email: 'stranger@example.com', username: 'stranger' });
        const product = await cartWith(stranger.id);
        await cartService.cartShippingMethodSet(stranger.id, 'standard');

        const result = await cartService.orderConfirm(stranger.id, testCallerContext, {
            addressId: ownersEntryId
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        expect(!result.success && result.errors[0]?.code).toBe('CART_ADDRESS_NOT_FOUND');
        await expect(countOrders({ userId: stranger._id })).resolves.toBe(0);
        const stored = await readProduct(String(product._id));
        expect(stored?.onHand).toBe(10);
        expect(stored?.reserved).toBe(0);
    });

    it('a pickup order ships to no address but is still invoiced to the default', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);
        await cartWith(user.id);

        // `pickup` needs no address, so nothing is frozen as a shipping address.
        await cartService.cartShippingMethodSet(user.id, 'pickup');
        const result = await cartService.orderConfirm(user.id, testCallerContext);

        expect(result.success).toBe(true);
        expect(result.success && result.data?.shippingAddress).toBeUndefined();
        expect(result.success && result.data?.billingAddress).toMatchObject({
            street: 'Via Roma 1'
        });
    });

    it('an empty book cannot check out: every order needs a billing address', async () => {
        const user = await createUser();
        const product = await cartWith(user.id);

        await cartService.cartShippingMethodSet(user.id, 'pickup');
        const result = await cartService.orderConfirm(user.id, testCallerContext);

        expect(result.success).toBe(false);
        expect(result.status).toBe(422);
        expect(!result.success && result.errors[0]?.code).toBe('CART_BILLING_ADDRESS_REQUIRED');
        // Refused before the hold: nothing moved.
        const stored = await readProduct(String(product._id));
        expect(stored?.reserved).toBe(0);
    });
});

describe('checkout and the billing address', () => {
    it('is the shipping address when none is named — "same as shipping"', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);
        await cartWith(user.id);
        await cartService.cartShippingMethodSet(user.id, 'standard');

        const result = await cartService.orderConfirm(user.id, testCallerContext);

        expect(result.success && result.data?.billingAddress).toMatchObject({
            fullName: 'Ada Lovelace',
            street: 'Via Roma 1'
        });
        expect(result.success && result.data?.shippingAddress).toMatchObject({
            street: 'Via Roma 1'
        });
    });

    it('is the NAMED entry, leaving the shipping address on its own', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);
        await addressService.addressAdd(user.id, OFFICE);
        await cartWith(user.id);
        const { addresses } = await addressService.addressesGet(user.id);
        const office = addresses.find(({ label }) => label === 'office');
        await cartService.cartShippingMethodSet(user.id, 'standard');

        const result = await cartService.orderConfirm(user.id, testCallerContext, {
            billingAddressId: office!.id
        });

        expect(result.success && result.data?.shippingAddress?.street).toBe('Via Roma 1');
        expect(result.success && result.data?.billingAddress?.street).toBe('Via Milano 2');
    });

    it('is asked alone for a digital-only basket: no shipping address is frozen', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);
        const digital = await createProduct({ requiresShipping: false });
        await cartService.cartItemAddById(user.id, String(digital._id), 1);

        const result = await cartService.orderConfirm(user.id, testCallerContext);

        expect(result.success).toBe(true);
        expect(result.success && result.data?.shippingAddress).toBeUndefined();
        expect(result.success && result.data?.billingAddress).toMatchObject({
            street: 'Via Roma 1'
        });
    });

    it('takes the named entry for a digital-only basket', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);
        await addressService.addressAdd(user.id, OFFICE);
        const digital = await createProduct({ requiresShipping: false });
        await cartService.cartItemAddById(user.id, String(digital._id), 1);
        const { addresses } = await addressService.addressesGet(user.id);
        const office = addresses.find(({ label }) => label === 'office');

        const result = await cartService.orderConfirm(user.id, testCallerContext, {
            billingAddressId: office!.id
        });

        expect(result.success && result.data?.billingAddress?.street).toBe('Via Milano 2');
    });

    it('refuses a digital-only checkout with no address on file', async () => {
        const user = await createUser();
        const digital = await createProduct({ requiresShipping: false });
        await cartService.cartItemAddById(user.id, String(digital._id), 1);

        const result = await cartService.orderConfirm(user.id, testCallerContext);

        expect(result.status).toBe(422);
        expect(!result.success && result.errors[0]?.code).toBe('CART_BILLING_ADDRESS_REQUIRED');
    });

    it('refuses a shipping addressId on a digital-only basket instead of freezing it', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);
        const { addresses } = await addressService.addressesGet(user.id);
        const digital = await createProduct({ requiresShipping: false });
        await cartService.cartItemAddById(user.id, String(digital._id), 1);

        const result = await cartService.orderConfirm(user.id, testCallerContext, {
            addressId: addresses[0].id
        });

        expect(result.status).toBe(409);
        expect(!result.success && result.errors[0]?.code).toBe('CART_ADDRESS_NOT_APPLICABLE');
        await expect(countOrders({ userId: user._id })).resolves.toBe(0);
    });

    it("refuses another user's entry as billing, as it does for shipping", async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'admin' });
        await addressService.addressAdd(owner.id, HOME);
        const ownersView = await addressService.addressesGet(owner.id);
        const ownersEntryId = ownersView.addresses[0].id;
        const stranger = await createUser({ email: 'stranger@example.com', username: 'stranger' });
        await addressService.addressAdd(stranger.id, OFFICE);
        await cartWith(stranger.id);
        await cartService.cartShippingMethodSet(stranger.id, 'standard');

        const result = await cartService.orderConfirm(stranger.id, testCallerContext, {
            billingAddressId: ownersEntryId
        });

        expect(result.status).toBe(404);
        expect(!result.success && result.errors[0]?.code).toBe('CART_ADDRESS_NOT_FOUND');
        await expect(countOrders({ userId: stranger._id })).resolves.toBe(0);
    });

    it('is not held to the ship-to countries, unlike the shipping address', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, { ...HOME, country: 'JP' });
        const digital = await createProduct({ requiresShipping: false });
        await cartService.cartItemAddById(user.id, String(digital._id), 1);

        const result = await cartService.orderConfirm(user.id, testCallerContext);

        expect(result.success && result.data?.billingAddress?.country).toBe('JP');
    });
});
