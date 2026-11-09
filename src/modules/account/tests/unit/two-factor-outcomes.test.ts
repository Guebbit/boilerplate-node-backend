/**
 * @module
 * `rejectLocked`: the 2FA lock's 429 says how long the lock still has to run, from the user the
 * caller already loaded. No database: the user is a stub, the clock is passed in.
 */

import { asStub } from '@tests/stub';
import type { UserDocument } from '@modules/users';
import { MFA_LOCK_MS } from '../../two-factor';
import { rejectLocked } from '../../services/two-factor-outcomes';

/** A fixed "now", so every wait below is exact arithmetic. */
const NOW = new Date('2030-01-01T12:00:00.000Z');

/** A user stub holding only the field `rejectLocked` reads. */
const userLockedUntil = (lockedUntil: Date | undefined) =>
    asStub<UserDocument>({ mfaLockedUntil: lockedUntil });

/** The `retryAfter` the refusal carries. */
const waitOf = (user: UserDocument) => rejectLocked(user, NOW).errors[0].details?.retryAfter;

describe('rejectLocked', () => {
    it('is a 429 carrying RATE_LIMITED', () => {
        const rejection = rejectLocked(userLockedUntil(new Date(NOW.getTime() + 60_000)), NOW);

        expect(rejection.status).toBe(429);
        expect(rejection.errors[0].code).toBe('RATE_LIMITED');
    });

    it('names the time left on a lock still running, rounded up to whole seconds', () => {
        expect(waitOf(userLockedUntil(new Date(NOW.getTime() + 120_000)))).toBe(120);
        expect(waitOf(userLockedUntil(new Date(NOW.getTime() + 119_001)))).toBe(120);
    });

    it('never says less than one second', () => {
        expect(waitOf(userLockedUntil(new Date(NOW.getTime() + 1)))).toBe(1);
    });

    it('falls back to the full lock length when the loaded user carries no live lock', () => {
        const full = MFA_LOCK_MS / 1000;

        expect(waitOf(userLockedUntil(undefined))).toBe(full);
        expect(waitOf(userLockedUntil(new Date(NOW.getTime() - 5000)))).toBe(full);
    });
});
