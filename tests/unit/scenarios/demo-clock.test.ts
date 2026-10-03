/**
 * The demo profile's clock: it moves `Date` forward on request, refuses to go back, and puts the
 * real time back on reset. Real timers stay real — `setTimeout` still fires on wall time.
 */
import { installDemoClock } from '@scenarios/support/demo-clock';

/** One hour in milliseconds — big enough to tell from real-time drift within a test. */
const HOUR_MS = 3_600_000;

/** Slack for the real time that passes between two reads. */
const DRIFT_MS = 2000;

describe('the demo clock', () => {
    let clock: ReturnType<typeof installDemoClock>;

    beforeEach(() => {
        clock = installDemoClock();
    });

    afterEach(() => {
        clock.uninstall();
    });

    it('starts on real time', () => {
        expect(clock.offsetMs()).toBeLessThan(DRIFT_MS);
    });

    it('moves Date.now() forward by the amount asked', () => {
        const before = Date.now();
        clock.advance(HOUR_MS);

        expect(Date.now() - before).toBeGreaterThanOrEqual(HOUR_MS);
        expect(Date.now() - before).toBeLessThan(HOUR_MS + DRIFT_MS);
        expect(clock.offsetMs()).toBeGreaterThanOrEqual(HOUR_MS - DRIFT_MS);
    });

    it('moves `new Date()` too, not only Date.now()', () => {
        const before = Date.now();
        clock.advance(HOUR_MS);

        expect(Date.now() - before).toBeGreaterThanOrEqual(HOUR_MS);
    });

    it('accumulates: two jumps are one long one', () => {
        clock.advance(HOUR_MS);
        clock.advance(HOUR_MS);

        expect(clock.offsetMs()).toBeGreaterThanOrEqual(2 * HOUR_MS - DRIFT_MS);
    });

    it.each([-1, NaN, Infinity])('refuses %p', (ms) => {
        expect(() => {
            clock.advance(ms);
        }).toThrow(RangeError);
        expect(clock.offsetMs()).toBeLessThan(DRIFT_MS);
    });

    it('returns to real time on reset', () => {
        clock.advance(HOUR_MS);
        clock.reset();

        expect(clock.offsetMs()).toBeLessThan(DRIFT_MS);
    });

    it('leaves real timers alone', async () => {
        clock.advance(HOUR_MS);
        const started = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(performance.now() - started).toBeGreaterThanOrEqual(20);
    });
});
