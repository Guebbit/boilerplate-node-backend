/**
 * @module
 * Keyed pseudonymisation of identifiers and secrets that must be comparable but not readable:
 * log fields, rate-limit identities and the idempotency fingerprint.
 *
 * Scheme:   HMAC-SHA256 under a per-purpose subkey, HKDF-derived from one root secret.
 * Why:      a bare hash of a guessable value is brute-forced; a keyed one needs the key.
 * Sources:  EDPB Guidelines 01/2025 ¶88-89, ¶117-118; RFC 5869; NIST SP 800-57 §5.2.
 * Rotation: single value. Digests change once; see docs/tools/security.md.
 *
 * Relative imports only: `logger.ts` imports this, and it sits on jest `globalSetup`'s chain.
 */

import { createHmac, hkdfSync } from 'node:crypto';

/**
 * What a digest is used for. A closed list so a new purpose is a deliberate edit, and so one
 * purpose's digests can never be replayed as another's.
 */
export type PseudonymPurpose = 'log' | 'rate-limit' | 'idempotency';

/**
 * Non-secret root outside production, where `NODE_PSEUDONYM_KEY` is not required
 * (`required-config.ts`): a dev or test digest still needs to be stable, and a machine with this
 * source tree has nothing to protect.
 */
const DEV_PSEUDONYM_KEY = 'dev-pseudonym-key';

/**
 * Subkeys already derived, keyed by `root` then purpose. Keyed on the root because tests change
 * the environment between cases; HKDF is cheap but this sits on the request path.
 */
const subkeys = new Map<string, Map<PseudonymPurpose, Buffer>>();

/**
 * The HKDF subkey for one purpose under the current root secret.
 * `info` binds the key to its purpose and to this scheme's version.
 *
 * @param purpose - what the digest is for
 */
const subkeyFor = (purpose: PseudonymPurpose): Buffer => {
    const root = process.env.NODE_PSEUDONYM_KEY || DEV_PSEUDONYM_KEY;
    const forRoot = subkeys.get(root) ?? new Map<PseudonymPurpose, Buffer>();
    subkeys.set(root, forRoot);

    const known = forRoot.get(purpose);
    if (known) return known;

    /*
     * Node: HKDF-SHA256 (RFC 5869). Args: digest, input key material, salt (empty: the root is
     * already high-entropy), info (purpose label), output length in bytes.
     * https://nodejs.org/api/crypto.html#cryptohkdfsyncdigest-ikm-salt-info-keylen
     */
    const derived = Buffer.from(hkdfSync('sha256', root, '', `pseudonym/v1/${purpose}`, 32));
    forRoot.set(purpose, derived);
    return derived;
};

/**
 * Pseudonymises `value` for one purpose: the same input always gives the same digest, and only a
 * holder of the root secret can reproduce or test a guess against it.
 *
 * @param purpose - what the digest is for; picks the subkey
 * @param value - the identifier or secret to pseudonymise
 * @returns the full HMAC-SHA256 digest as 64 hex characters; callers may truncate
 */
export const pseudonymise = (purpose: PseudonymPurpose, value: string): string =>
    // Node: HMAC. https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options
    createHmac('sha256', subkeyFor(purpose)).update(value).digest('hex');
