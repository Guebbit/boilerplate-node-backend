/**
 * @module
 * The shape a "you just asked for this, wait a moment" refusal shares. Two flows publish mail on
 * a button press — the 2FA delivered code and the verification link — and the countdown a client
 * renders has to mean the same thing in both, which it only does if one place computes it.
 *
 * Lives at the module root, not under `services/`, so `two-factor/` can reach it the way it
 * already reaches `../emails` and `../session/` — without a `two-factor` → `services` edge.
 *
 * Holds no clock beyond the default, no database and no i18n keys: the caller supplies the
 * anchor, the window, and text that is already translated.
 */

import { generateReject } from '@infrastructure/http/response';
import type { ResponseReject } from '@infrastructure/http/response';

/**
 * Seconds still to wait before the same thing may be sent again, or 0 when a send may go ahead.
 *
 * An absent `sentAt` means nothing was ever sent, or the entry predates the field — either way
 * there is nothing to wait for.
 *
 * @param sentAt - when the last send went out
 * @param seconds - the window between two sends
 * @param now - the clock, injectable for tests
 * @returns whole seconds remaining, rounded up so a client never re-enables its button early
 */
export const cooldownRemaining = (
    sentAt: Date | undefined,
    seconds: number,
    now: Date = new Date()
): number => {
    if (!sentAt) return 0;

    const elapsed = (now.getTime() - sentAt.getTime()) / 1000;
    return Math.max(0, Math.ceil(seconds - elapsed));
};

/**
 * The 429 a client turns into a countdown rather than a generic "too many requests".
 *
 * `details.retryAfter` is deliberately the same number the successful response promised as
 * `resendAfter`, so a client that respected the promise never sees this at all.
 *
 * @param code - the flow's own error code, which the client branches on
 * @param message - already translated; this module holds no i18n keys
 * @param seconds - what {@link cooldownRemaining} returned
 */
export const resendTooSoon = (code: string, message: string, seconds: number): ResponseReject =>
    generateReject(429, [
        {
            code,
            message,
            details: { retryAfter: seconds }
        }
    ]);
