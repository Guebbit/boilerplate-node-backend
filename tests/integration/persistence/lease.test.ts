import { setupTestDb } from '@tests/setup-test-db';
import { leaseModel, withLease } from '@infrastructure/persistence/lease';

/**
 * `withLease` against a real database — see docs/reference/ops.md#scheduled-jobs for why this is a
 * Mongo lease rather than a Redis lock — and the four properties it has to hold for a scaled-up
 * cron container to be safe: one runner at a time, an expired holder is not permanent, a crash (a
 * throw) frees the lease rather than blocking it for the full `ttlMs`, and losing a contested
 * acquisition is a normal outcome rather than a rejected promise.
 *
 * Real Mongo (via `setupTestDb`), not a mock: the property under test is what MongoDB itself does
 * with a concurrent `findOneAndUpdate` upsert, which a mock cannot exercise honestly.
 */

setupTestDb();

/** A minute — long enough that nothing in these cases expires by accident. */
const MINUTE_MS = 60_000;

/**
 * Poll until `name`'s lease document exists — confirmation that a prior `withLease` call's
 * acquisition has actually landed, rather than guessing with a fixed `setTimeout`.
 */
const waitForLeaseOwner = async (name: string): Promise<void> => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (await leaseModel.exists({ _id: name })) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`lease "${name}" was never acquired`);
};

describe('withLease', () => {
    it('runs the body for only one of two callers contending for the same held lease', async () => {
        const started: number[] = [];
        // Held open until the test releases it explicitly, so the second acquisition attempt below
        // genuinely lands WHILE the first still holds the lease — an instantly-resolving body would
        // let the first call finish and release before the second's request even reaches the
        // server, which would make both "win" in sequence rather than actually contending.
        let finishFirst: (() => void) | undefined;
        const first = withLease('scheduled-jobs-test.fresh', MINUTE_MS, () => {
            started.push(1);
            return new Promise<number>((resolve) => {
                finishFirst = () => resolve(1);
            });
        });
        await waitForLeaseOwner('scheduled-jobs-test.fresh');

        const second = withLease('scheduled-jobs-test.fresh', MINUTE_MS, () => {
            started.push(2);
            return Promise.resolve(2);
        });
        const secondResult = await second;
        finishFirst?.();
        const firstResult = await first;

        // The second caller loses without its body ever running, and resolves `undefined` rather
        // than rejecting — the duplicate-key race against an already-held, unexpired lease is
        // "someone else has it", not a failure.
        expect(started).toEqual([1]);
        expect(firstResult).toBe(1);
        expect(secondResult).toBeUndefined();
    });

    it('lets a different caller re-acquire a lease that has expired', async () => {
        // Acquired and released immediately: `withLease` stamps `expiresAt` with the epoch on
        // release (see lease.ts's `RELEASED`), so the very next acquisition already finds it
        // expired without a wait.
        await withLease('scheduled-jobs-test.expired', MINUTE_MS, () => Promise.resolve('first'));

        let ran = false;
        const result = await withLease('scheduled-jobs-test.expired', MINUTE_MS, () => {
            ran = true;
            return Promise.resolve('second');
        });

        expect(ran).toBe(true);
        expect(result).toBe('second');
    });

    it('releases the lease immediately when the body throws, instead of waiting out ttlMs', async () => {
        const failure = new Error('job blew up');

        await expect(
            withLease('scheduled-jobs-test.throws', MINUTE_MS, () => Promise.reject(failure))
        ).rejects.toBe(failure);

        // A long ttlMs would still block a same-window retry if the failed run had not released —
        // this proves it did, without waiting for anything to expire.
        let ran = false;
        await withLease('scheduled-jobs-test.throws', MINUTE_MS, () => {
            ran = true;
            return Promise.resolve(undefined);
        });

        expect(ran).toBe(true);

        const stored = await leaseModel.findById('scheduled-jobs-test.throws').lean().exec();
        expect(stored?.lastError).toBeUndefined();
    });

    it('records lastError on a throw and lastSuccessAt on a clean run, on the same document', async () => {
        const failure = new Error('temporary outage');

        await expect(
            withLease('scheduled-jobs-test.outcomes', MINUTE_MS, () => Promise.reject(failure))
        ).rejects.toBe(failure);

        const afterFailure = await leaseModel
            .findById('scheduled-jobs-test.outcomes')
            .lean()
            .exec();
        expect(afterFailure?.lastError).toBe('temporary outage');
        expect(afterFailure?.lastSuccessAt).toBeUndefined();

        await withLease('scheduled-jobs-test.outcomes', MINUTE_MS, () =>
            Promise.resolve(undefined)
        );

        const afterSuccess = await leaseModel
            .findById('scheduled-jobs-test.outcomes')
            .lean()
            .exec();
        expect(afterSuccess?.lastSuccessAt).toBeInstanceOf(Date);
        // A clean run clears a previous failure — a stale `lastError` would misreport a job that
        // has since recovered as still broken.
        expect(afterSuccess?.lastError).toBeUndefined();
    });

    it('resolves the duplicate-key race against an already-held, unexpired lease as "someone else has it"', async () => {
        const now = new Date();
        await leaseModel.create({
            _id: 'scheduled-jobs-test.held',
            owner: 'holder-a',
            expiresAt: new Date(now.getTime() + MINUTE_MS)
        });

        let ran = false;
        const result = await withLease('scheduled-jobs-test.held', MINUTE_MS, () => {
            ran = true;
            return Promise.resolve('should not run');
        });

        expect(ran).toBe(false);
        expect(result).toBeUndefined();

        // The existing holder's claim is untouched — a losing caller must not perturb the winner's
        // document on its way to answering "someone else has it".
        const stored = await leaseModel.findById('scheduled-jobs-test.held').lean().exec();
        expect(stored?.owner).toBe('holder-a');
    });
});
