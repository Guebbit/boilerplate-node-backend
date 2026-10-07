/**
 * @module
 * The short numeric codes a delivered method sends — minting, storage form and the checks that
 * decide whether one is still usable. Pure: it reads and writes a method entry, never the
 * database, so the TTL/attempt/cooldown rules can be tested against a fixed clock.
 */

import { createHmac, randomInt } from 'node:crypto';
import type { DeliveredCodeState } from '@modules/users';
import { constantTimeEqual } from '@infrastructure/security/constant-time';
import { deriveSubkey } from '@infrastructure/security/subkey';
import { getTotpEncryptionKeyRing } from '../session/config';
import { cooldownRemaining } from '../cooldown';

/** Digits in a delivered code — six, the length every authenticator app has taught people to expect. */
const DELIVERED_CODE_DIGITS = 6;

/** How long a delivered code is accepted. Ten minutes covers an SMTP queue and a person switching apps. */
export const DELIVERED_CODE_TTL_MS = 600_000;

/** Seconds between two deliveries of the same method — what the client counts down before re-enabling its button. */
export const DELIVERED_CODE_RESEND_SECONDS = 30;

/**
 * Wrong guesses one code tolerates before it is burned.
 *
 * This, not the hash below, is what actually protects six digits: it caps an online attack at
 * five tries out of a million per delivery, which no amount of stretching would improve on.
 */
export const DELIVERED_CODE_MAX_ATTEMPTS = 5;

/**
 * A delivered code's stored form — HMAC-SHA256 under an HKDF subkey of `NODE_TOTP_ENCRYPTION_KEY`
 * (info `delivered-code`), not a bare digest. The subkey keeps that key from serving as both the
 * AES input and the MAC key: one key, one purpose (NIST SP 800-57 §5.2). Six digits is a space of one million: a plain sha256 of one is recoverable from a
 * database dump in milliseconds, while an HMAC is not without the key, which lives in the
 * environment rather than the database. Not entropy stretching — blast-radius reduction.
 *
 * Always the ring's newest (`[0]`) key: unlike a TOTP secret, a delivered code is never persisted
 * across a rotation — it lives at most `DELIVERED_CODE_TTL_MS`, so there is no old ciphertext to
 * decrypt against an earlier entry, only an in-flight code that a rotation mid-window invalidates
 * (the same trade `docs/tools/security.md`'s JWT rotation makes for a session mid-refresh).
 *
 * @param code - the digits, as sent
 * @returns the hex digest to store in the entry's `codeHash`
 */
export const hashDeliveredCode = (code: string): string =>
    // Node: HMAC. https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options
    createHmac('sha256', deriveSubkey(getTotpEncryptionKeyRing()[0].key, 'delivered-code'))
        .update(code)
        .digest('hex');

/** A fresh zero-padded code, from the CSPRNG rather than `Math.random`. */
export const generateDeliveredCode = (): string =>
    randomInt(0, 10 ** DELIVERED_CODE_DIGITS)
        .toString()
        .padStart(DELIVERED_CODE_DIGITS, '0');

/**
 * Whether another delivery of this method is allowed yet — this method's anchor and window
 * handed to the shared {@link cooldownRemaining}, which the verification re-send uses too.
 *
 * @param entry - the entry, whose `codeSentAt` anchors the cooldown
 * @param now - the clock, injectable for tests
 * @returns seconds still to wait, or 0 when a send may go ahead
 */
export const deliveryCooldownRemaining = (
    entry: DeliveredCodeState,
    now: Date = new Date()
): number => cooldownRemaining(entry.codeSentAt, DELIVERED_CODE_RESEND_SECONDS, now);

/** Stamp a freshly minted code onto the entry, replacing whatever was in flight. */
export const armDeliveredCode = (
    entry: DeliveredCodeState,
    code: string,
    now: Date = new Date()
): void => {
    entry.codeHash = hashDeliveredCode(code);
    entry.codeSentAt = now;
    entry.codeExpiresAt = new Date(now.getTime() + DELIVERED_CODE_TTL_MS);
    entry.codeAttempts = 0;
};

/** Forget the code in flight — after it is spent, or after too many wrong guesses. */
export const clearDeliveredCode = (entry: DeliveredCodeState): void => {
    entry.codeHash = undefined;
    entry.codeSentAt = undefined;
    entry.codeExpiresAt = undefined;
    entry.codeAttempts = undefined;
};

/**
 * Check a typed code against the one in flight, and advance the entry accordingly: a match
 * clears the code (one use, always), a miss counts an attempt and clears it at the ceiling.
 * Mutates `entry`; the caller still has to persist it.
 *
 * @param entry - the entry holding the code in flight
 * @param code - the digits the caller typed
 * @param now - the clock, injectable for tests
 * @returns whether the code was accepted
 */
export const consumeDeliveredCode = (
    entry: DeliveredCodeState,
    code: string,
    now: Date = new Date()
): boolean => {
    if (!entry.codeHash || !entry.codeExpiresAt) return false;
    if (entry.codeExpiresAt.getTime() <= now.getTime()) {
        clearDeliveredCode(entry);
        return false;
    }

    const typed = hashDeliveredCode(code);
    if (constantTimeEqual(entry.codeHash, typed)) {
        clearDeliveredCode(entry);
        return true;
    }

    // A wrong guess burns budget, not the account: past the ceiling only the code in flight dies,
    // and the caller may ask for another one. Burning takes `codeSentAt` with it, so the cooldown
    // is gone too — `mfaSendLimiter` is what actually caps how many replacements one challenge buys.
    const attempts = (entry.codeAttempts ?? 0) + 1;
    entry.codeAttempts = attempts;
    if (attempts >= DELIVERED_CODE_MAX_ATTEMPTS) clearDeliveredCode(entry);
    return false;
};
