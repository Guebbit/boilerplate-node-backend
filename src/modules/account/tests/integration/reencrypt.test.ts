/**
 * @module
 * The manifest's `reencrypt` walk: after a TOTP key rotation, an enrolled secret still stamped
 * `v1` moves to `v2` and still decrypts under its method id. The stored value is the ciphertext
 * itself, so its stamped version is read straight off the document.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironmentOverrides } from '@tests/environment';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { keyVersionOf } from '@infrastructure/security/versioned-secret';
import accountModule from '../../module';
import { encryptTotpSecret, decryptTotpSecret } from '../../two-factor/totp';

setupTestDb();

/** A deployment mid-rotation: a new `v2` key in front, the worker's bare (`v1`) test key behind. */
const ROTATED_TOTP_KEY = 'v2:new-totp-key-material,v1:test-totp-encryption-key';

describe('account reencrypt', () => {
    it('moves an enrolled secret to v2 and it still decrypts under its method id', async () => {
        const methodId = new Types.ObjectId();
        const user = await createUser({
            twoFactorMethods: [
                {
                    _id: methodId,
                    method: 'totp',
                    enrolledAt: new Date(),
                    secret: encryptTotpSecret('JBSWY3DPEHPK3PXP', String(methodId))
                }
            ]
        });

        await withEnvironmentOverrides({ NODE_TOTP_ENCRYPTION_KEY: ROTATED_TOTP_KEY }, async () => {
            const report = await accountModule.reencrypt(false);

            expect(report.rewritten).toBe(1);
            const stored = await userRepository.findByIdWithCredentials(user.id);
            const secret = stored?.twoFactorMethods?.[0]?.secret ?? '';
            expect(keyVersionOf(secret)).toBe('v2');
            expect(decryptTotpSecret(secret, String(methodId))).toBe('JBSWY3DPEHPK3PXP');
        });
    });
});
