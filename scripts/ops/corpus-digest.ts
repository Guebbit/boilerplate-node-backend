/**
 * @module
 * Integrity check for a downloaded corpus: refuse bytes whose SHA-256 is not the pinned one.
 *
 * Kept apart from `refresh-breached-passwords.ts` because that file runs on import, and a test
 * must be able to load this one without a network or a database.
 */
import { createHash } from 'node:crypto';

/**
 * Throws unless the SHA-256 of `bytes` equals `expected`.
 *
 * @param bytes the downloaded body, exactly as received
 * @param expected the pinned digest, lowercase hex
 * @param label what was downloaded, named in the error
 * @throws {Error} on any mismatch — a moved, truncated or tampered corpus must never be filtered
 *   into the committed list
 */
export const assertCorpusDigest = (bytes: Uint8Array, expected: string, label: string): void => {
    // node:crypto: https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expected)
        throw new Error(
            `${label}: SHA-256 is ${actual}, expected ${expected}. Refusing the corpus.`
        );
};
