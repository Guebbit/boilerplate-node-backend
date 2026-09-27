/**
 * @module
 * Constant-time string comparison — the one primitive every static-credential check in this repo
 * needs (a metrics scraper token, an api-key hash, a webhook signature, a 2FA code) and none of
 * them may hand-roll with `===`, which leaks how many leading bytes matched through response
 * timing.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Double-hash: sha256 both inputs down to a fixed 32-byte digest before comparing.
 *
 * A naive `a.length === b.length && timingSafeEqual(a, b)` still leaks whether the lengths match
 * through the `&&` short-circuit — a real leak for a variable-length secret like a bearer token.
 * Hashing first removes the length oracle entirely: both digests are always 32 bytes, so
 * `timingSafeEqual` never throws and no branch runs on `a`/`b` themselves.
 * https://paragonie.com/blog/2015/11/preventing-timing-attacks-on-string-comparison-with-double-hmac-strategy
 */
const digestOf = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Are `a` and `b` the same string, compared in constant time — see {@link digestOf}. */
export const constantTimeEqual = (a: string, b: string): boolean =>
    timingSafeEqual(digestOf(a), digestOf(b));
