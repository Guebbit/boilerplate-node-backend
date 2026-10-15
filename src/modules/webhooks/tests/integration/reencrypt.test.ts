/**
 * @module
 * The manifest's `reencrypt` walk: after a webhook-secret key rotation, a ring secret still
 * stamped `v1` moves to `v2` and still decrypts under its entry id. Read back raw, below the
 * repository's own decrypt, to see the stamped version.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerAs } from '@tests/callers';
import { withEnvironment } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { keyVersionOf } from '@infrastructure/security/versioned-secret';
import webhooksModule from '../../module';
import { webhookSubscriptionModel } from '../../model';
import { create as createSubscription } from '../../services/subscriptions';
import { decryptRingSecret } from '../../secrets';

setupTestDb();

/** A deployment mid-rotation: a new `v2` key in front, the worker's bare (`v1`) test key behind. */
const ROTATED_WEBHOOK_KEY = 'v2:new-webhook-key-material,v1:test-webhook-secret-encryption-key';

describe('webhooks reencrypt', () => {
    it('moves a ring secret to v2 and it still decrypts under its entry id', async () => {
        await createUser();
        await createSubscription(
            { url: 'https://example.com/hook', eventTypes: ['*'] },
            { caller: callerAs('manager'), analyticsConsent: false }
        );

        await withEnvironment(
            'NODE_WEBHOOK_SECRET_ENCRYPTION_KEY',
            ROTATED_WEBHOOK_KEY,
            async () => {
                const report = await webhooksModule.reencrypt(false);

                expect(report.rewritten).toBe(1);
                const raw = await webhookSubscriptionModel.collection.findOne({});
                const entry = raw?.secrets[0] as { id: string; ciphertext: string };
                expect(keyVersionOf(entry.ciphertext)).toBe('v2');
                expect(decryptRingSecret(entry.ciphertext, entry.id)).toMatch(/^whsec_/);
            }
        );
    });
});
