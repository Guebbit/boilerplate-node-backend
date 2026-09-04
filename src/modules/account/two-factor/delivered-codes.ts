/**
 * @module
 * The short numeric codes a delivered method sends — minting, storage form and the checks that
 * decide whether one is still usable. Pure: it reads and writes a method entry, never the
 * database, so the TTL/attempt/cooldown rules can be tested against a fixed clock.
 */

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { TwoFactorMethodRecord } from '@modules/users';
import { getTotpEncryptionKey } from '../session/config';

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
 * A delivered code's stored form — HMAC-SHA256 under `NODE_TOTP_ENCRYPTION_KEY`, not a bare
 * digest. Six digits is a space of one million: a plain sha256 of one is recoverable from a
 * database dump in milliseconds, while an HMAC is not without the key, which lives in the
 * environment rather than the database. Not entropy stretching — blast-radius reduction.
 *
 * @param code - the digits, as sent
 * @returns the hex digest to store in the entry's `codeHash`
 */
export const hashDeliveredCode = (code: string): string =>
    createHmac('sha256', getTotpEncryptionKey().key).update(code).digest('hex');

/** A fresh zero-padded code, from the CSPRNG rather than `Math.random`. */
export const generateDeliveredCode = (): string =>
    randomInt(0, 10 ** DELIVERED_CODE_DIGITS)
        .toString()
        .padStart(DELIVERED_CODE_DIGITS, '0');

/**
 * Whether another delivery of this method is allowed yet.
 *
 * @param entry - the method entry, whose `codeSentAt` anchors the cooldown
 * @param now - the clock, injectable for tests
 * @returns seconds still to wait, or 0 when a send may go ahead
 */
export const deliveryCooldownRemaining = (
    entry: TwoFactorMethodRecord,
    now: Date = new Date()
): number => {
    if (!entry.codeSentAt) return 0;
    const elapsed = (now.getTime() - entry.codeSentAt.getTime()) / 1000;
    return Math.max(0, Math.ceil(DELIVERED_CODE_RESEND_SECONDS - elapsed));
};

/** Stamp a freshly minted code onto the entry, replacing whatever was in flight. */
export const armDeliveredCode = (
    entry: TwoFactorMethodRecord,
    code: string,
    now: Date = new Date()
): void => {
    entry.codeHash = hashDeliveredCode(code);
    entry.codeSentAt = now;
    entry.codeExpiresAt = new Date(now.getTime() + DELIVERED_CODE_TTL_MS);
    entry.codeAttempts = 0;
};

/** Forget the code in flight — after it is spent, or after too many wrong guesses. */
export const clearDeliveredCode = (entry: TwoFactorMethodRecord): void => {
    entry.codeHash = undefined;
    entry.codeSentAt = undefined;
    entry.codeExpiresAt = undefined;
    entry.codeAttempts = undefined;
};

/** Constant-time digest comparison — `timingSafeEqual` throws on a length mismatch, which cannot happen between two hex digests of the same algorithm. */
const digestsMatch = (a: string, b: string): boolean =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Check a typed code against the one in flight, and advance the entry accordingly: a match
 * clears the code (one use, always), a miss counts an attempt and clears it at the ceiling.
 * Mutates `entry`; the caller still has to persist it.
 *
 * @param entry - the method entry holding the code in flight
 * @param code - the digits the caller typed
 * @param now - the clock, injectable for tests
 * @returns whether the code was accepted
 */
export const consumeDeliveredCode = (
    entry: TwoFactorMethodRecord,
    code: string,
    now: Date = new Date()
): boolean => {
    if (!entry.codeHash || !entry.codeExpiresAt) return false;
    if (entry.codeExpiresAt.getTime() <= now.getTime()) {
        clearDeliveredCode(entry);
        return false;
    }

    if (digestsMatch(entry.codeHash, hashDeliveredCode(code))) {
        clearDeliveredCode(entry);
        return true;
    }

    // A wrong guess burns budget, not the account: past the ceiling only the code in flight dies,
    // and the caller may ask for another one — subject to the cooldown and the route's limiter.
    const attempts = (entry.codeAttempts ?? 0) + 1;
    entry.codeAttempts = attempts;
    if (attempts >= DELIVERED_CODE_MAX_ATTEMPTS) clearDeliveredCode(entry);
    return false;
};
