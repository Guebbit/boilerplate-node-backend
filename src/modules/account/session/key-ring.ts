/**
 * @module
 * The signing-key ring's `kid`: how a secret gets a stable identifier, and how `./jwt` finds the
 * ring member a token's header names. Pure — no `jsonwebtoken` calls — so the ring math is testable
 * without signing anything. See docs/modules/account-sessions.md.
 */

import { createHash } from 'node:crypto';

/**
 * A short, stable identifier for a secret — stamped in a signed token's `kid` header so a
 * verifier can find the right ring member without trying every one. Derived from the secret
 * itself, never from its position in the ring: dropping the oldest entry on rotation must not
 * silently repoint an existing token's `kid` at a different key.
 *
 * @param secret - a ring member
 * @returns a 16-character hex digest
 */
export const keyId = (secret: string): string =>
    createHash('sha256').update(secret).digest('hex').slice(0, 16);

/**
 * The ring member a `kid` names, or `undefined` when it names none — a key this deployment has
 * already retired, or a token that never carried one. The caller turns that into a rejection: a
 * token signed by a key we no longer hold is exactly "log in again", never a crash.
 *
 * @param ring - the ordered ring, newest first
 * @param kid - the `kid` claimed by a token's header
 */
export const keyForId = (ring: readonly string[], kid: string | undefined): string | undefined =>
    ring.find((secret) => keyId(secret) === kid);
