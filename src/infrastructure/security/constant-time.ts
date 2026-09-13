/**
 * @module
 * Constant-time string comparison — the one primitive every static-credential check in this repo
 * needs (a metrics scraper token, an api-key hash) and none of them may hand-roll with `===`,
 * which leaks how many leading bytes matched through response timing.
 */

import { timingSafeEqual } from 'node:crypto';

/**
 * Are `a` and `b` the same string, compared in constant time.
 *
 * `timingSafeEqual` throws on a length mismatch, which would itself be a length oracle — so the
 * lengths are compared first and the result folded into one boolean, the same way a `!==` would
 * be, but without ever calling `timingSafeEqual` on buffers of different sizes.
 */
export const constantTimeEqual = (a: string, b: string): boolean => {
    const bytesA = Buffer.from(a);
    const bytesB = Buffer.from(b);

    return bytesA.length === bytesB.length && timingSafeEqual(bytesA, bytesB);
};
