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

import { createHmac, type KeyObject } from 'node:crypto';
import { pseudonymConfig } from './config';
import { deriveSubkey } from './subkey';

/**
 * What a digest is used for. A closed list so a new purpose is a deliberate edit, and so one
 * purpose's digests can never be replayed as another's.
 */
export type PseudonymPurpose = 'log' | 'rate-limit' | 'idempotency';

/**
 * The HKDF subkey for one purpose under the current root secret.
 * `info` binds the key to its purpose and to this scheme's version.
 *
 * @param purpose - what the digest is for
 * @throws {Error} when `NODE_PSEUDONYM_KEY` is unset: there is no built-in key, so a digest
 *   under a guessable one is refused rather than made
 */
const subkeyFor = (purpose: PseudonymPurpose): KeyObject => {
    const root = pseudonymConfig().NODE_PSEUDONYM_KEY;
    if (root === undefined) throw new Error('NODE_PSEUDONYM_KEY is not set.');
    return deriveSubkey(root, `pseudonym/v1/${purpose}`);
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
