/**
 * @module
 * `users`' configuration: the key its personal fields are encrypted under.
 *
 * The adapter that reads the ring is shape-only (`infrastructure/security/config.ts`); the
 * requirement that it be set is this module's, so deleting the module deletes it.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { withPresence } from '@infrastructure/config/fields';
import { PII_ENCRYPTION_KEY_FIELD } from '@infrastructure/security/config';

/**
 * A phone number encrypted under the shipped placeholder is recoverable by anyone who has read
 * this repository — same failure shape `NODE_TOTP_ENCRYPTION_KEY` guards against, same fix. Shared
 * with `addresses` (never optional without this module, per its own `dependsOn`), so requiring it
 * here covers both.
 */
export const usersConfig = defineConfig({
    name: 'users',
    shape: {
        NODE_PII_ENCRYPTION_KEY: withPresence(PII_ENCRYPTION_KEY_FIELD, {
            minLength: 16,
            placeholder: 'your-pii-encryption-key-here'
        })
    }
});
