/**
 * `rateLimitStore` with an escalation: after the cap, each repeated lockout of the same key lasts
 * twice as long as the last, up to a ceiling, and a key that behaves is forgotten. Counted in the
 * in-process store (the suite blanks the `limits` Redis URL), on a fake clock, since the whole
 * property is "how long".
 *
 * `MemoryStore#get` answers an entry whose window ended until its sweep runs — the case the
 * "ends exactly when its window does" tests exist for.
 */
import type { Store } from 'express-rate-limit';
import { rateLimitStore } from '@infrastructure/http/middlewares/rate-limit-store';

/** A 1-second base window, a cap of 2, and three doublings: lockouts of 1s, 2s, 4s, 8s. */
const WINDOW_MS = 1000;

/** Builds a fresh escalating store on this file's window. */
const freshStore = (): Store => {
    const store = rateLimitStore('test-escalation', 'memory', { limit: 2, doublings: 3 });
    void store.init?.({ windowMs: WINDOW_MS } as Parameters<NonNullable<Store['init']>>[0]);
    return store;
};

/** Count one hit and say whether it was refused (past the cap of 2). */
const refused = (store: Store, key = 'k'): Promise<boolean> =>
    Promise.resolve(store.increment(key)).then(({ totalHits }) => totalHits > 2);

/** Spend the cap and trip it: three hits, the third refused. */
const tripCap = async (store: Store, key = 'k'): Promise<void> => {
    await refused(store, key);
    await refused(store, key);
    expect(await refused(store, key)).toBe(true);
};

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('an escalating store', () => {
    it('refuses past the cap and lifts when the base window ends', async () => {
        const store = freshStore();
        await tripCap(store);

        jest.advanceTimersByTime(WINDOW_MS - 1);
        expect(await refused(store)).toBe(true);

        jest.advanceTimersByTime(2);
        expect(await refused(store)).toBe(false);
    });

    it('doubles each lockout across consecutive trips, up to the ceiling', async () => {
        const store = freshStore();

        // 1s, 2s, 4s, 8s, then 8s again: three doublings are the most there are.
        for (const lockout of [1000, 2000, 4000, 8000, 8000]) {
            await refused(store);
            await refused(store);
            expect(await refused(store)).toBe(true);

            jest.advanceTimersByTime(lockout - 1);
            expect(await refused(store)).toBe(true);
            // Past the lock: the next trip starts from here, with no reset in between.
            jest.advanceTimersByTime(2);
        }
    });

    it('lengthens the lockout across consecutive trips without a reset in between', async () => {
        const store = freshStore();
        await tripCap(store);
        jest.advanceTimersByTime(WINDOW_MS + 1);

        // Second trip: the lockout is now two windows.
        await refused(store);
        await refused(store);
        expect(await refused(store)).toBe(true);
        jest.advanceTimersByTime(WINDOW_MS + 1);
        expect(await refused(store)).toBe(true);
        jest.advanceTimersByTime(WINDOW_MS);
        expect(await refused(store)).toBe(false);
    });

    it('forgets a key that stays quiet: the next trip is a first one again', async () => {
        const store = freshStore();
        await tripCap(store);
        jest.advanceTimersByTime(WINDOW_MS + 1);
        // Quiet for longer than the strike memory (base × 2^(doublings + 1) = 16s).
        jest.advanceTimersByTime(WINDOW_MS * 2 ** 4 + 1);

        await tripCap(store);
        jest.advanceTimersByTime(WINDOW_MS + 1);

        expect(await refused(store)).toBe(false);
    });

    it('keeps keys apart', async () => {
        const store = freshStore();
        await tripCap(store, 'one');

        expect(await refused(store, 'two')).toBe(false);
    });

    it('un-counts at the level a hit was counted at, for a request that then succeeded', async () => {
        const store = freshStore();
        await refused(store);
        await refused(store);
        await store.decrement('k');
        await store.decrement('k');

        // Both hits were given back, so the cap is whole again: two more are fine, the third is not.
        await refused(store);
        await refused(store);
        expect(await refused(store)).toBe(true);
    });

    it('resets every level and the strike count together', async () => {
        const store = freshStore();
        await tripCap(store);
        jest.advanceTimersByTime(WINDOW_MS + 1);
        await tripCap(store);

        await store.resetKey('k');

        // A fresh key: a first lockout of one window, not the third.
        await tripCap(store);
        jest.advanceTimersByTime(WINDOW_MS + 1);
        expect(await refused(store)).toBe(false);
    });

    it('reports the current level through get, so a gate can read how long it is locked', async () => {
        const store = freshStore();
        await tripCap(store);
        jest.advanceTimersByTime(WINDOW_MS + 1);
        await tripCap(store);

        const record = await store.get?.('k');

        expect(record?.totalHits).toBeGreaterThan(2);
    });
});
