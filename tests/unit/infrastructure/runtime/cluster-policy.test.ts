/**
 * `src/infrastructure/runtime/cluster-policy.ts` — how many workers the primary forks, and what it
 * does about a crash.
 */
import { crashVerdict, workerTarget } from '@infrastructure/runtime/cluster-policy';

describe('workerTarget', () => {
    it('forks the number a deployment asked for', () => {
        expect(workerTarget(3, 16)).toBe(3);
    });

    it('reads zero as one worker per available CPU, as .env-example documents', () => {
        expect(workerTarget(0, 4)).toBe(4);
    });

    it('never forks fewer than one', () => {
        expect(workerTarget(-2, 0)).toBe(1);
    });
});

describe('crashVerdict', () => {
    const policy = { windowMs: 60_000, backoffBaseMs: 500, backoffMaxMs: 30_000, maxCrashes: 3 };

    it('respawns an isolated crash after the base delay', () => {
        expect(crashVerdict([], 1_000_000, policy)).toMatchObject({
            action: 'respawn',
            delayMs: 500
        });
    });

    it('doubles the delay per crash inside the window', () => {
        expect(crashVerdict([999_000, 999_500], 1_000_000, policy)).toMatchObject({
            action: 'respawn',
            delayMs: 2000
        });
    });

    it('forgets crashes older than the window', () => {
        const verdict = crashVerdict([1, 2], 1_000_000, policy);

        expect(verdict).toMatchObject({ action: 'respawn', delayMs: 500 });
        expect(verdict.recentCrashes).toEqual([1_000_000]);
    });

    it('caps the delay at the maximum', () => {
        const wide = { ...policy, backoffMaxMs: 1000, maxCrashes: 10 };

        expect(crashVerdict([999_000, 999_100, 999_200], 1_000_000, wide)).toMatchObject({
            delayMs: 1000
        });
    });

    it('gives up once a window holds more crashes than the limit', () => {
        expect(crashVerdict([999_000, 999_100, 999_200], 1_000_000, policy)).toMatchObject({
            action: 'give-up'
        });
    });
});
