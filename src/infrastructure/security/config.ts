/**
 * @module
 * The keys and switches the security helpers read: the pseudonymisation root, the PII field
 * encryption ring, and the breached-password ladder.
 *
 * Relative imports only: `pseudonymise.ts` is on the logger's import chain, which jest's
 * `globalSetup` loads outside path-alias resolution.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '../config/define';
import { flag, int, secret, versionedKeyRing } from '../config/fields';

/** The root secret every HMAC pseudonym is derived from. */
export const pseudonymConfig = defineConfig({
    name: 'pseudonymisation',
    shape: {
        NODE_PSEUDONYM_KEY: secret({
            minLength: 16,
            minBytes: 32,
            placeholder: 'your-pseudonym-key-here',
            productionOnly: true
        })
    }
});

/**
 * The PII field-encryption ring. Shape-only here: which module REQUIRES it is that module's
 * decision (`users`), so deleting the module deletes the requirement.
 */
export const PII_ENCRYPTION_KEY_FIELD = versionedKeyRing();

/** The slice the encryption helper reads. */
export const piiConfig = defineConfig({
    name: 'pii-encryption',
    shape: { NODE_PII_ENCRYPTION_KEY: PII_ENCRYPTION_KEY_FIELD }
});

/** The breached-password ladder: a bundled list, then optionally Have I Been Pwned. */
export const breachedPasswordsConfig = defineConfig({
    name: 'breached-passwords',
    shape: {
        NODE_PASSWORD_BREACH_LIST: flag({ default: true }),
        NODE_PASSWORD_BREACH_HIBP: flag({ default: false }),
        NODE_PASSWORD_BREACH_HIBP_TIMEOUT_MS: int({ default: 1500, min: 1 })
    }
});
