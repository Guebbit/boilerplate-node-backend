/**
 * The address book — one invariant carries every case: a non-empty book has EXACTLY ONE
 * default, no matter which write got it there. The rest is ownership (someone else's entry
 * answers like an invented one) and the checkout resolver's three-way answer.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factory';
import { accountService } from '@modules/account/services';
import { cartService } from '@modules/cart';
import { productRepository } from '@modules/products';
import { createProduct } from '@modules/products/tests/factory';

setupTestDb();

const HOME = {
    label: 'home',
    fullName: 'Ada Lovelace',
    street: 'Via Roma 1',
    city: 'Modena',
    zip: '41121',
    country: 'IT'
};
const OFFICE = {
    label: 'office',
    fullName: 'Ada Lovelace',
    street: 'Via Milano 2',
    city: 'Modena',
    zip: '41122',
    country: 'IT'
};

const defaults = async (userId: string) => {
    const view = await accountService.addressesGet(userId);
    return view.addresses.filter(({ default: isDefault }) => isDefault);
};

describe('the one-default invariant', () => {
    it('the first entry becomes default whether or not it asked', async () => {
        const user = await createUser();

        await accountService.addressAdd(user.id, HOME);

        const holders = await defaults(user.id);
        expect(holders.map(({ label }) => label)).toEqual(['home']);
    });

    it('a later entry claims the slot only by asking, and demotes the holder', async () => {
        const user = await createUser();
        await accountService.addressAdd(user.id, HOME);
        await accountService.addressAdd(user.id, OFFICE);
        const before = await defaults(user.id);
        expect(before.map(({ label }) => label)).toEqual(['home']);

        const view = await accountService.addressesGet(user.id);
        const office = view.addresses.find(({ label }) => label === 'office');
        await accountService.addressUpdate(user.id, office!.id, { default: true });

        const after = await defaults(user.id);
        expect(after.map(({ label }) => label)).toEqual(['office']);
    });

    it('adding with `default: true` demotes the holder in the same write', async () => {
        const user = await createUser();
        await accountService.addressAdd(user.id, HOME);

        await accountService.addressAdd(user.id, { ...OFFICE, default: true });

        const holders = await defaults(user.id);
        expect(holders.map(({ label }) => label)).toEqual(['office']);
    });

    it('`default: false` on an update leaves the assignment alone', async () => {
        const user = await createUser();
        await accountService.addressAdd(user.id, HOME);
        const view = await accountService.addressesGet(user.id);

        await accountService.addressUpdate(user.id, view.addresses[0]!.id, {
            default: false,
            city: 'Bologna'
        });

        expect(await defaults(user.id)).toHaveLength(1);
    });

    it('removing the default promotes the oldest remaining entry', async () => {
        const user = await createUser();
        await accountService.addressAdd(user.id, HOME);
        await accountService.addressAdd(user.id, OFFICE);
        const view = await accountService.addressesGet(user.id);
        const home = view.addresses.find(({ label }) => label === 'home');

        await accountService.addressRemove(user.id, home!.id);

        const promoted = await defaults(user.id);
        expect(promoted.map(({ label }) => label)).toEqual(['office']);
    });
});

/** One in-stock product straight into the user's cart — the checkout cases' shared setup. */
const cartWith = async (userId: string) => {
    const product = await createProduct({ onHand: 10 });
    await cartService.cartItemAddById(userId, String(product._id), 1);
    return product;
};

describe('ownership', () => {
    it("someone else's entry answers the same 404 as an invented one", async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'owner' });
        const stranger = await createUser({ email: 'stranger@example.com', username: 'stranger' });
        await accountService.addressAdd(owner.id, HOME);
        const view = await accountService.addressesGet(owner.id);
        const entryId = view.addresses[0]!.id;

        const update = await accountService.addressUpdate(stranger.id, entryId, {
            city: 'Hacked'
        });
        const remove = await accountService.addressRemove(stranger.id, entryId);

        expect(update.success).toBe(false);
        expect(update.status).toBe(404);
        expect(remove.success).toBe(false);
        expect(remove.status).toBe(404);
        // And the owner's entry is untouched.
        const after = await accountService.addressesGet(owner.id);
        expect(after.addresses[0]?.city).toBe('Modena');
    });
});

describe('checkout and the address', () => {
    it('snapshots the default when no id is named', async () => {
        const user = await createUser();
        await accountService.addressAdd(user.id, HOME);
        await cartWith(user.id);

        const result = await cartService.orderConfirm(user.id);

        expect(result.success).toBe(true);
        expect(result.success && result.data?.shippingAddress).toMatchObject({
            fullName: 'Ada Lovelace',
            street: 'Via Roma 1'
        });
    });

    it('snapshots the NAMED entry over the default', async () => {
        const user = await createUser();
        await accountService.addressAdd(user.id, HOME);
        await accountService.addressAdd(user.id, OFFICE);
        await cartWith(user.id);
        const view = await accountService.addressesGet(user.id);
        const office = view.addresses.find(({ label }) => label === 'office');

        const result = await cartService.orderConfirm(user.id, office!.id);

        expect(result.success).toBe(true);
        expect(result.success && result.data?.shippingAddress?.street).toBe('Via Milano 2');
    });

    it('ships nothing rather than nowhere: a stale id refuses the checkout untouched', async () => {
        const user = await createUser();
        await accountService.addressAdd(user.id, HOME);
        const product = await cartWith(user.id);

        const result = await cartService.orderConfirm(user.id, '65dc8a99604c307b702b5ccc');

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        // Nothing moved — the address check runs before anything is held.
        const stored = await productRepository.findById(String(product._id));
        expect(stored?.onHand).toBe(10);
        expect(stored?.reserved).toBe(0);
        const cart = await cartService.cartGetWithSummary(user.id);
        expect(cart.items).toHaveLength(1);
    });

    it('an empty book is not an obstacle — the order simply carries no address', async () => {
        const user = await createUser();
        await cartWith(user.id);

        const result = await cartService.orderConfirm(user.id);

        expect(result.success).toBe(true);
        expect(result.success && result.data?.shippingAddress).toBeUndefined();
    });
});
