/**
 * `createBreaker` — the circuit breaker in front of the limits Redis. The clock is injected, so no
 * case waits out a window: it moves a number.
 */

import { createBreaker } from '@infrastructure/http/middlewares/store-breaker';

/** A breaker with a 30 s window and a clock the test moves by hand. */
const breakerWithClock = () => {
    let time = 1_000_000;
    return {
        breaker: createBreaker(30_000, () => time),
        advance: (ms: number) => {
            time += ms;
        }
    };
};

describe('createBreaker', () => {
    it('admits every call while closed', () => {
        const { breaker } = breakerWithClock();

        expect([breaker.admit(), breaker.admit(), breaker.admit()]).toEqual([true, true, true]);
    });

    it('refuses every call for the whole window after a failure', () => {
        const { breaker, advance } = breakerWithClock();
        breaker.failed();

        expect(breaker.admit()).toBe(false);
        advance(29_999);
        expect(breaker.admit()).toBe(false);
    });

    it('lets exactly one probe through once the window has passed', () => {
        const { breaker, advance } = breakerWithClock();
        breaker.failed();
        advance(30_000);

        expect([breaker.admit(), breaker.admit(), breaker.admit()]).toEqual([true, false, false]);
    });

    it('closes after a probe that worked', () => {
        const { breaker, advance } = breakerWithClock();
        breaker.failed();
        advance(30_000);
        breaker.admit();
        breaker.succeeded();

        expect([breaker.admit(), breaker.admit()]).toEqual([true, true]);
    });

    it('re-opens for a full window after a probe that failed', () => {
        const { breaker, advance } = breakerWithClock();
        breaker.failed();
        advance(30_000);
        breaker.admit();
        breaker.failed();

        expect(breaker.admit()).toBe(false);
        advance(29_999);
        expect(breaker.admit()).toBe(false);
        advance(1);
        expect(breaker.admit()).toBe(true);
    });
});
