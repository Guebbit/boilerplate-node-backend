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
            placeholder: 'your-pseudonym-key-here',
            productionOnly: true,
            describe:
                'Root secret for keyed hashes of personal data in logs and fingerprints. A fixed dev key outside a deployment.'
        })
    }
});

/**
 * The PII field-encryption ring. Shape-only here: which module REQUIRES it is that module's
 * decision (`users`), so deleting the module deletes the requirement.
 */
export const PII_ENCRYPTION_KEY_FIELD = versionedKeyRing({
    describe: 'Key ring encrypting personal fields at rest (addresses, phone numbers).'
});

/** The slice the encryption helper reads. */
export const piiConfig = defineConfig({
    name: 'pii-encryption',
    shape: { NODE_PII_ENCRYPTION_KEY: PII_ENCRYPTION_KEY_FIELD }
});

/** The breached-password ladder: a bundled list, then optionally Have I Been Pwned. */
export const breachedPasswordsConfig = defineConfig({
    name: 'breached-passwords',
    shape: {
        NODE_PASSWORD_BREACH_LIST: flag({
            default: true,
            describe: 'Refuse a password on the bundled breach list.'
        }),
        NODE_PASSWORD_BREACH_HIBP: flag({
            default: false,
            describe: 'Also ask Have I Been Pwned (k-anonymity range lookup). Fails open.'
        }),
        NODE_PASSWORD_BREACH_HIBP_TIMEOUT_MS: int({
            default: 1500,
            min: 1,
            describe: 'How long the HIBP lookup may take before it is skipped.'
        })
    }
});
