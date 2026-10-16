/**
 * @module
 * The manifest's `reencrypt` walk: after a PII key rotation, a phone still stamped `v1` moves to
 * `v2`. Read back raw, below the repository's own decrypt, to see the stamped version.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import { withEnvironmentOverrides } from '@tests/environment';
import { keyVersionOf } from '@infrastructure/security/versioned-secret';
import usersModule from '../../module';
import { userModel } from '../../model';
import { userService } from '../../services';
import { createUser } from '../factories';

setupTestDb();

/** A deployment mid-rotation: a new `v2` key in front, the worker's bare (`v1`) test key behind. */
const ROTATED_PII_KEY = 'v2:new-pii-key-material,v1:test-pii-encryption-key';

describe('users reencrypt', () => {
    it('moves a phone to v2', async () => {
        const user = await createUser();
        await userService.updateById(user.id, { phone: '+1 555 0100' }, callerContextAs('admin'));

        await withEnvironmentOverrides({ NODE_PII_ENCRYPTION_KEY: ROTATED_PII_KEY }, async () => {
            const report = await usersModule.reencrypt(false);

            expect(report.rewritten).toBe(1);
            const raw = await userModel.collection.findOne({ _id: user._id });
            expect(keyVersionOf(raw?.phone as string)).toBe('v2');
        });
    });
});
