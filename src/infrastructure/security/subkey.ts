/**
 * @module
 * The one HKDF entry point: a purpose-bound subkey derived from a root secret, cached.
 *
 * Scheme:   HKDF-SHA256 (RFC 5869), empty salt (the roots are already high-entropy), `info` as
 *           the purpose label, 32 bytes out.
 * Why:      one root never serves two purposes (NIST SP 800-57 §5.2); `info` is the separation.
 * Callers:  `pseudonymise.ts`, `versioned-secret.ts`, `account/two-factor/delivered-codes.ts`.
 *
 * Relative imports only: `pseudonymise.ts` imports this, and it sits on jest `globalSetup`'s chain.
 */

import { createSecretKey, hkdfSync, type KeyObject } from 'node:crypto';

/**
 * Subkeys already derived, keyed by `root` then `info`. Keyed on the root because tests change
 * the environment between cases; HKDF is cheap but this sits on the request path.
 */
const derived = new Map<string, Map<string, KeyObject>>();

/**
 * The HKDF subkey for one purpose under a root secret.
 *
 * @param root - the root secret (input key material)
 * @param info - the purpose label; binds the key to one use and, where wanted, a scheme version
 * @returns an immutable 32-byte secret key; the same instance for the same inputs
 */
export const deriveSubkey = (root: string, info: string): KeyObject => {
    const forRoot = derived.get(root) ?? new Map<string, KeyObject>();
    derived.set(root, forRoot);

    const known = forRoot.get(info);
    if (known) return known;

    /*
     * Node: HKDF-SHA256. Args: digest, input key material, salt, info, output length in bytes.
     * https://nodejs.org/api/crypto.html#cryptohkdfsyncdigest-ikm-salt-info-keylen
     * `createSecretKey` wraps the bytes in a `KeyObject`, which cannot be mutated afterwards
     * (unlike the `Buffer` it replaces), and which `createHmac`/`createCipheriv` accept directly.
     * https://nodejs.org/api/crypto.html#cryptocreatesecretkeykey-encoding
     */
    const key = createSecretKey(Buffer.from(hkdfSync('sha256', root, '', info, 32)));
    forRoot.set(info, key);
    return key;
};
