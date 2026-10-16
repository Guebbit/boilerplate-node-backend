import { setupTestDb } from '@tests/setup-test-db';
import { eventually } from '@tests/eventually';
import {
    leaseModel,
    withLease,
    recordJobOutcome,
    listLeaseSummaries
} from '@infrastructure/persistence/lease';

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
        // The first acquisition has landed once its lease document exists.
        await eventually(() =>
            leaseModel.exists({ _id: 'scheduled-jobs-test.fresh' }).then(Boolean)
        );

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

    it('lets only one of two truly concurrent callers win the very first insert for a name', async () => {
        // No pre-existing document, unlike the case above — both calls fire back to back with no
        // `await` between them, so both `findOneAndUpdate` upserts are in flight before either can
        // resolve. This is `acquireLease`'s OTHER duplicate-key race (its own doc comment calls it
        // out separately from a held-lease race): the very first insert for `name`, contended.
        const name = 'scheduled-jobs-test.first-insert-race';
        const started: number[] = [];

        const [firstResult, secondResult] = await Promise.all([
            withLease(name, MINUTE_MS, () => {
                started.push(1);
                return Promise.resolve('first');
            }),
            withLease(name, MINUTE_MS, () => {
                started.push(2);
                return Promise.resolve('second');
            })
        ]);

        expect(started).toHaveLength(1);
        // Exactly one resolves to its body's own value; the other resolves `undefined` — the same
        // "someone else has it" outcome a contended, already-held lease produces.
        expect([firstResult, secondResult].filter((result) => result !== undefined)).toHaveLength(
            1
        );

        const stored = await leaseModel.findById(name).lean().exec();
        expect(stored).not.toBeNull();
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

/**
 * `recordJobOutcome` — the job-health path every `docker/crontab` job now goes through via
 * `scripts/run-script.ts`, not only the one job ({@link withLease}'s own single caller) that also
 * takes a mutual-exclusion lease.
 */
describe('recordJobOutcome', () => {
    it('creates a row for a job that has never taken a lease, already-expired', async () => {
        await recordJobOutcome('scheduled-jobs-test.outcome-only', { failed: false });

        const stored = await leaseModel.findById('scheduled-jobs-test.outcome-only').lean().exec();
        expect(stored?.lastSuccessAt).toBeInstanceOf(Date);
        // Immediately acquirable: `withLease`'s own query matches `expiresAt < now`, so a fresh
        // outcome-only row must never block a real lease acquisition for the same name.
        expect(stored?.expiresAt.getTime()).toBeLessThan(Date.now());
    });

    it('records lastError on a failure, without disturbing a later success', async () => {
        await recordJobOutcome('scheduled-jobs-test.outcome-failure', {
            failed: true,
            error: new Error('disk full')
        });

        const afterFailure = await leaseModel
            .findById('scheduled-jobs-test.outcome-failure')
            .lean()
            .exec();
        expect(afterFailure?.lastError).toBe('disk full');

        await recordJobOutcome('scheduled-jobs-test.outcome-failure', { failed: false });

        const afterSuccess = await leaseModel
            .findById('scheduled-jobs-test.outcome-failure')
            .lean()
            .exec();
        expect(afterSuccess?.lastSuccessAt).toBeInstanceOf(Date);
        expect(afterSuccess?.lastError).toBeUndefined();
    });

    it('does not overwrite an existing owner — $setOnInsert only applies to a brand-new row', async () => {
        const now = new Date();
        await leaseModel.create({
            _id: 'scheduled-jobs-test.outcome-preserves-owner',
            owner: 'a-real-holder',
            expiresAt: new Date(now.getTime() + 60_000)
        });

        await recordJobOutcome('scheduled-jobs-test.outcome-preserves-owner', { failed: false });

        const stored = await leaseModel
            .findById('scheduled-jobs-test.outcome-preserves-owner')
            .lean()
            .exec();
        expect(stored?.owner).toBe('a-real-holder');
        expect(stored?.lastSuccessAt).toBeInstanceOf(Date);
    });
});

/**
 * `lastRunAt` is what lets Prometheus tell a job that has only ever failed from one that never
 * ran: the failing job has a row (and so a run time) but no `lastSuccessAt`.
 */
describe('listLeaseSummaries', () => {
    it('reports when a job last ran, including one that has never succeeded', async () => {
        const before = Date.now();
        await recordJobOutcome('scheduled-jobs-test.summary-failing', {
            failed: true,
            error: new Error('disk full')
        });

        const summaries = await listLeaseSummaries();
        const summary = summaries.find(
            ({ name }) => name === 'scheduled-jobs-test.summary-failing'
        );

        expect(summary?.lastSuccessAt).toBeUndefined();
        expect(summary?.lastError).toBe('disk full');
        expect(summary?.lastRunAt?.getTime()).toBeGreaterThanOrEqual(before);
    });
});

/**
 * A lease row has no TTL: a job that stopped running entirely must stay visible as stale, since
 * the alert on `job_last_success_timestamp_seconds` reads it from here.
 */
describe('listLeaseSummaries', () => {
    it('still reports a row untouched for longer than any retention window', async () => {
        const longAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
        await leaseModel.create({
            _id: 'scheduled-jobs-test.abandoned',
            owner: 'none',
            expiresAt: new Date(0),
            lastSuccessAt: longAgo
        });
        // `timestamps: false` stops Mongoose stamping `updatedAt` with now over the old value.
        await leaseModel.updateOne(
            { _id: 'scheduled-jobs-test.abandoned' },
            { $set: { updatedAt: longAgo } },
            { timestamps: false }
        );
        await leaseModel.syncIndexes();

        const summaries = await listLeaseSummaries();
        expect(summaries.find(({ name }) => name === 'scheduled-jobs-test.abandoned')).toEqual(
            expect.objectContaining({ lastSuccessAt: longAgo, lastRunAt: longAgo })
        );
        const indexes = await leaseModel.collection.indexes();
        expect(indexes.some((index) => index.expireAfterSeconds !== undefined)).toBe(false);
    });
});
