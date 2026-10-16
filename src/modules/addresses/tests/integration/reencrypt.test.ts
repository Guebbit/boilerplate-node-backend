/**
 * @module
 * The manifest's `reencrypt` walk: after a PII key rotation, address-book entries still stamped
 * `v1` move to `v2`, a second run changes nothing, and a dry run writes nothing. Read back raw,
 * below the repository's own decrypt, to see the stamped version.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironmentOverrides } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { keyVersionOf } from '@infrastructure/security/versioned-secret';
import addressesModule from '../../module';
import { addressBookModel } from '../../model';
import { addressService } from '../../service';

setupTestDb();

/** A deployment mid-rotation: a new `v2` key in front, the worker's bare (`v1`) test key behind. */
const ROTATED_PII_KEY = 'v2:new-pii-key-material,v1:test-pii-encryption-key';

const ADDRESS = {
    fullName: 'Ada Lovelace',
    street: '12 Analytical Engine Rd',
    city: 'London',
    zip: 'SW1A',
    country: 'GB'
};

describe('addresses reencrypt', () => {
    it('moves v1 to v2, changes nothing on a second run, and writes nothing on a dry run', async () => {
        const user = await createUser();
        await addressService.create(user.id, ADDRESS);
        const stored = () => addressBookModel.collection.findOne({ userId: user._id });

        await withEnvironmentOverrides({ NODE_PII_ENCRYPTION_KEY: ROTATED_PII_KEY }, async () => {
            const dry = await addressesModule.reencrypt(true);
            expect(dry.rewritten).toBe(0);
            expect(dry.found['addressbooks.items.city']).toEqual({ v1: 1 });
            const before = await stored();
            expect(keyVersionOf(before?.items[0].city as string)).toBe('v1');

            const first = await addressesModule.reencrypt(false);
            expect(first.rewritten).toBe(5);
            const moved = await stored();
            expect(keyVersionOf(moved?.items[0].city as string)).toBe('v2');

            const second = await addressesModule.reencrypt(false);
            expect(second.rewritten).toBe(0);
            expect(await stored()).toEqual(moved);
            // And it still reads back, now under the new key alone.
            const view = await addressService.list(user.id);
            expect(view.addresses[0]).toMatchObject(ADDRESS);
        });
    });
});
