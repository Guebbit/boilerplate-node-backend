/**
 * @module
 * The one digest every stored credential-like token is kept under: session ids, refresh tokens,
 * one-time links and API keys. A leaf, so any module can store or look a token up without
 * reaching a sibling for it.
 */

import { createHash } from 'node:crypto';

/**
 * Digest a token value for storage and lookup.
 *
 * A plain sha256 is enough because every value hashed here already carries at least 128 bits of
 * entropy (`randomBytes`, or a signed JWT): there is no low-entropy secret to stretch, and a slow
 * hash would only tax the request path every authenticated client hits.
 *
 * Callers that compare an in-memory token to a stored digest must hash it the same way. A one-off
 * script that ever rewrites stored rows must reuse this rather than reimplement the digest.
 *
 * @param token - the plaintext token value
 * @returns the lowercase hex sha256 digest
 */
export const hashToken = (token: string): string =>
    createHash('sha256').update(token).digest('hex');
