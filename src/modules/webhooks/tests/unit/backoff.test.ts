/**
 * The retry backoff schedule and the auto-disable threshold — pure rules, see `../../domain/backoff.ts`.
 */

import {
    WEBHOOK_RETRY_DELAYS_MS,
    WEBHOOK_MAX_ATTEMPTS,
    WEBHOOK_MAX_CONSECUTIVE_FAILURES,
    WEBHOOK_MIN_FAILING_MS,
    nextRetryDelayMs,
    nextAttemptAt,
    shouldAutoDisable
} from '@modules/webhooks/domain';

describe('nextRetryDelayMs', () => {
    it('returns the tier for each attempt that just failed, 1-based', () => {
        for (const [attempt, delay] of WEBHOOK_RETRY_DELAYS_MS.entries())
            expect(nextRetryDelayMs(attempt + 1)).toBe(delay);
    });

    it('returns undefined once every tier is spent — the exhausted signal', () => {
        expect(nextRetryDelayMs(WEBHOOK_RETRY_DELAYS_MS.length + 1)).toBeUndefined();
    });

    it('grows monotonically, short blip to most of a day', () => {
        for (let index = 1; index < WEBHOOK_RETRY_DELAYS_MS.length; index++)
            expect(WEBHOOK_RETRY_DELAYS_MS[index]).toBeGreaterThan(
                WEBHOOK_RETRY_DELAYS_MS[index - 1]
            );
    });
});

describe('WEBHOOK_MAX_ATTEMPTS', () => {
    it('is one initial try plus one per retry tier', () => {
        expect(WEBHOOK_MAX_ATTEMPTS).toBe(WEBHOOK_RETRY_DELAYS_MS.length + 1);
    });
});

describe('nextAttemptAt', () => {
    it('adds the tier delay to the given clock', () => {
        const now = new Date('2026-01-01T00:00:00.000Z');
        expect(nextAttemptAt(1, now)).toEqual(new Date(now.getTime() + WEBHOOK_RETRY_DELAYS_MS[0]));
        expect(nextAttemptAt(2, now)).toEqual(new Date(now.getTime() + WEBHOOK_RETRY_DELAYS_MS[1]));
    });

    it('is undefined past the last tier, same as nextRetryDelayMs', () => {
        const now = new Date('2026-01-01T00:00:00.000Z');
        expect(nextAttemptAt(WEBHOOK_MAX_ATTEMPTS, now)).toBeUndefined();
    });

    it('defaults to the real clock when none is given', () => {
        const before = Date.now();
        const at = nextAttemptAt(1);
        const after = Date.now();

        expect(at).toBeDefined();
        // A window rather than an exact value: `Date.now()` inside `nextAttemptAt` runs a moment
        // after `before` was captured here.
        expect(at!.getTime()).toBeGreaterThanOrEqual(before + WEBHOOK_RETRY_DELAYS_MS[0]);
        expect(at!.getTime()).toBeLessThanOrEqual(after + WEBHOOK_RETRY_DELAYS_MS[0]);
    });
});

describe('shouldAutoDisable', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const longAgo = new Date(now.getTime() - (WEBHOOK_MIN_FAILING_MS + 1));
    const recently = new Date(now.getTime() - 1);

    it('is false below the chain-count threshold, however long the streak has run', () => {
        for (let count = 0; count < WEBHOOK_MAX_CONSECUTIVE_FAILURES; count++)
            expect(shouldAutoDisable(count, longAgo, now)).toBe(false);
    });

    it('is false at and past the chain-count threshold when the streak has not run long enough', () => {
        expect(shouldAutoDisable(WEBHOOK_MAX_CONSECUTIVE_FAILURES, recently, now)).toBe(false);
        expect(shouldAutoDisable(WEBHOOK_MAX_CONSECUTIVE_FAILURES, now, now)).toBe(false);
    });

    it('is false with no failingSince at all — no streak open, whatever the count says', () => {
        expect(shouldAutoDisable(WEBHOOK_MAX_CONSECUTIVE_FAILURES, undefined, now)).toBe(false);
    });

    it('is true only once BOTH the chain count and the time floor are crossed', () => {
        expect(shouldAutoDisable(WEBHOOK_MAX_CONSECUTIVE_FAILURES, longAgo, now)).toBe(true);
        expect(shouldAutoDisable(WEBHOOK_MAX_CONSECUTIVE_FAILURES + 5, longAgo, now)).toBe(true);
    });

    it('is true exactly at the time floor, not just past it', () => {
        const atFloor = new Date(now.getTime() - WEBHOOK_MIN_FAILING_MS);
        expect(shouldAutoDisable(WEBHOOK_MAX_CONSECUTIVE_FAILURES, atFloor, now)).toBe(true);
    });

    it('defaults to the real clock when none is given', () => {
        expect(shouldAutoDisable(WEBHOOK_MAX_CONSECUTIVE_FAILURES, longAgo)).toBe(true);
    });
});
