/**
 * @module
 * The address book — one invariant carries every case: a non-empty book has EXACTLY ONE
 * default, no matter which write got it there. The rest is ownership (someone else's entry
 * answers like an invented one) and the checkout resolver's three-way answer.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
// Relative, not the barrel: a module's own tests may not import its own `index.ts` (CLAUDE.md's
// barrel rules apply to tests too), so this reaches the sibling file directly.
import * as addressService from '../../service';
import { addressBookModel } from '../../model';
import { HOME, OFFICE } from './fixtures';

setupTestDb();

const defaults = async (userId: string) => {
    const view = await addressService.addressesGet(userId);
    return view.addresses.filter(({ default: isDefault }) => isDefault);
};

describe('the one-default invariant', () => {
    it('the first entry becomes default whether or not it asked', async () => {
        const user = await createUser();

        await addressService.addressAdd(user.id, HOME);

        const holders = await defaults(user.id);
        expect(holders.map(({ label }) => label)).toEqual(['home']);
    });

    it('a later entry claims the slot only by asking, and demotes the holder', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);
        await addressService.addressAdd(user.id, OFFICE);
        const before = await defaults(user.id);
        expect(before.map(({ label }) => label)).toEqual(['home']);

        const view = await addressService.addressesGet(user.id);
        const office = view.addresses.find(({ label }) => label === 'office');
        const answer = await addressService.addressSetDefault(user.id, office!.id);

        const after = await defaults(user.id);
        expect(after.map(({ label }) => label)).toEqual(['office']);
        expect(answer.data).toMatchObject({ label: 'office', default: true });
    });

    it('setting the default twice is the same state as once', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);
        await addressService.addressAdd(user.id, OFFICE);
        const view = await addressService.addressesGet(user.id);
        const office = view.addresses.find(({ label }) => label === 'office');

        await addressService.addressSetDefault(user.id, office!.id);
        const again = await addressService.addressSetDefault(user.id, office!.id);

        expect(again.success).toBe(true);
        const holders = await defaults(user.id);
        expect(holders.map(({ label }) => label)).toEqual(['office']);
    });

    it("answers 404 for an entry that is not the caller's", async () => {
        const owner = await createUser({ email: 'owner2@example.com', username: 'ownerb' });
        const stranger = await createUser({
            email: 'stranger2@example.com',
            username: 'strangerb'
        });
        await addressService.addressAdd(owner.id, HOME);
        const view = await addressService.addressesGet(owner.id);

        const answer = await addressService.addressSetDefault(stranger.id, view.addresses[0].id);

        expect(answer.status).toBe(404);
    });

    it('adding with `default: true` demotes the holder in the same write', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);

        await addressService.addressAdd(user.id, { ...OFFICE, default: true });

        const holders = await defaults(user.id);
        expect(holders.map(({ label }) => label)).toEqual(['office']);
    });

    it('an ordinary edit leaves the assignment alone', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);
        const view = await addressService.addressesGet(user.id);

        await addressService.addressUpdate(user.id, view.addresses[0].id, { city: 'Bologna' });

        expect(await defaults(user.id)).toHaveLength(1);
    });

    it('removing the default promotes the oldest remaining entry', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, HOME);
        await addressService.addressAdd(user.id, OFFICE);
        const view = await addressService.addressesGet(user.id);
        const home = view.addresses.find(({ label }) => label === 'home');

        await addressService.addressRemove(user.id, home!.id);

        const promoted = await defaults(user.id);
        expect(promoted.map(({ label }) => label)).toEqual(['office']);
    });
});

describe('ownership', () => {
    it("someone else's entry answers the same 404 as an invented one", async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'admin' });
        const stranger = await createUser({ email: 'stranger@example.com', username: 'stranger' });
        await addressService.addressAdd(owner.id, HOME);
        const view = await addressService.addressesGet(owner.id);
        const entryId = view.addresses[0].id;

        const update = await addressService.addressUpdate(stranger.id, entryId, {
            city: 'Hacked'
        });
        const remove = await addressService.addressRemove(stranger.id, entryId);

        expect(update.success).toBe(false);
        expect(update.status).toBe(404);
        expect(remove.success).toBe(false);
        expect(remove.status).toBe(404);
        // And the owner's entry is untouched.
        const after = await addressService.addressesGet(owner.id);
        expect(after.addresses[0]?.city).toBe('Modena');
    });
});

describe('PII at rest', () => {
    it('stores fullName/street/city/zip/country/phone encrypted, never as the plaintext submitted', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, { ...HOME, phone: '+39 059 000001' });

        // Bypasses the repository's own decrypt on purpose — this is what a raw DB read, or a
        // stolen disk/backup, would actually see.
        const stored = await addressBookModel.findOne({ userId: user._id }).lean();
        const [entry] = stored?.items ?? [];

        expect(entry?.fullName).not.toBe(HOME.fullName);
        expect(entry?.street).not.toBe(HOME.street);
        expect(entry?.city).not.toBe(HOME.city);
        expect(entry?.zip).not.toBe(HOME.zip);
        expect(entry?.country).not.toBe(HOME.country);
        expect(entry?.phone).not.toBe('+39 059 000001');
        // Versioned-secret's own wire format — see infrastructure/security/versioned-secret.ts.
        expect(entry?.fullName).toMatch(/^v\d+(?::[\da-f]+){3}$/);
    });

    it('round-trips through the repository back to the plaintext submitted', async () => {
        const user = await createUser();
        await addressService.addressAdd(user.id, { ...HOME, phone: '+39 059 000001' });

        const view = await addressService.addressesGet(user.id);
        expect(view.addresses[0]).toMatchObject({ ...HOME, phone: '+39 059 000001' });
    });
});
