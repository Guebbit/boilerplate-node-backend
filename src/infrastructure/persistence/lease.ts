/**
 * @module
 * A Mongo-backed mutual-exclusion lease: one atomic upsert decides who runs a periodic job, so a
 * scaled-up cron container cannot run `reap:orders` twice in the same window. Recommended over a
 * Redis lock because this collection is durable by construction — no eviction policy to get
 * wrong — and because the lock lives in the same store as the work it is guarding.
 *
 * Fencing is NOT implemented. A lease can still expire while its holder is mid-run, and two
 * holders can briefly exist regardless of how the lock itself is built. This repo accepts that
 * and relies on every lease-guarded job being idempotent instead (`docs/reference/data.md`
 * already requires it of `ops/` scripts) — add a fencing token only for a job that turns out not
 * to be idempotent, and treat needing one as a signal the job is wrong.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import { randomUUID } from 'node:crypto';
import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { isDuplicateKey } from '@infrastructure/http/errors';
import { environmentNumber } from '@infrastructure/runtime/environment';

/**
 * A stored lease, one document per job name.
 *
 * `_id` IS the job name rather than a generated id: a job only ever wants ONE lease document, and
 * the atomic upsert `withLease` relies on needs to address it without a lookup first.
 * `lastSuccessAt`/`lastError` are read by `GET /observability/health` — see
 * `src/infrastructure/observability/job-health.ts` — so a job that silently stopped running is
 * visible on the probe an operator already looks at.
 */
export interface LeaseDocument extends Document<string> {
    owner: string;
    expiresAt: Date;
    lastSuccessAt?: Date;
    lastError?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Mongoose model type for {@link LeaseDocument}. */
export type LeaseModel = Model<LeaseDocument>;

/** Lease collection schema. */
export const leaseSchema: Schema<LeaseDocument, LeaseModel> = new Schema<LeaseDocument, LeaseModel>(
    {
        _id: {
            type: String
        },
        owner: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Date,
            required: true
        },
        lastSuccessAt: {
            type: Date
        },
        lastError: {
            type: String
        }
    },
    {
        // `updatedAt` is what the TTL index below reads, and it is what re-acquiring an active
        // lease bumps on every job run — see the index comment.
        timestamps: true
    }
);

/**
 * How long a lease document survives with no acquisition, in days, before Mongo's TTL index
 * removes it. Deliberately generous and unrelated to any job's own `ttlMs` argument: THIS window
 * is garbage collection for a job retired from the roster, not the mutual-exclusion window a
 * running job holds its lease for.
 */
const leaseRetentionDays = environmentNumber('NODE_LEASE_RETENTION_DAYS', 30, 1);

/*
 * TTL index on `updatedAt`, not `expiresAt`: every successful `findOneAndUpdate` in
 * `acquireLease` and `releaseLease` bumps `updatedAt` (via `timestamps: true` above), so a job
 * that keeps running on schedule never gets near this window — only a lease nobody has touched in
 * `leaseRetentionDays` is abandoned rather than merely between runs.
 *
 * Same caveat as every other TTL index in this repo: Mongo will not modify an existing index's
 * `expireAfterSeconds` in place, so changing `NODE_LEASE_RETENTION_DAYS` and restarting FAILS THE
 * BOOT — `npm run db:sync` is what applies it, by dropping the index and rebuilding it.
 */
leaseSchema.index(
    { updatedAt: 1 },
    { name: 'leases_updatedAt_ttl', expireAfterSeconds: leaseRetentionDays * 24 * 60 * 60 }
);

/** Lease model entrypoint. Collection name `leases`, Mongoose's default pluralization of `Lease`. */
export const leaseModel = model<LeaseDocument, LeaseModel>('Lease', leaseSchema);

/** One job's last observed outcome, as `GET /observability/health` reports it. */
export interface LeaseSummary {
    name: string;
    lastSuccessAt?: Date;
    lastError?: string;
}

/**
 * Every lease document that exists, projected to what health reporting needs.
 *
 * Only jobs that have attempted to acquire their lease at least once appear here — there is no
 * separate registry of "expected" job names to compare against, so a job removed from the
 * crontab simply stops updating its row until the TTL index above reclaims it.
 */
export const listLeaseSummaries = (): Promise<LeaseSummary[]> =>
    leaseModel
        .find({}, { owner: 0, expiresAt: 0, createdAt: 0, updatedAt: 0, __v: 0 })
        .sort({ _id: 1 })
        .lean()
        .exec()
        .then((rows) =>
            rows.map((row) => ({
                name: row._id,
                lastSuccessAt: row.lastSuccessAt,
                lastError: row.lastError
            }))
        );

/** `error` reduced to the string `lastError` stores — same shape `db/run-script.ts` logs with. */
const describeError = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * Try to become (or remain) the holder of `name`. One atomic `findOneAndUpdate` upsert: it wins
 * when the lease is missing, expired, or already held by `token` — see this file's module
 * docblock's linked design doc for the exact shape and why it is safe.
 *
 * The duplicate-key branch covers TWO races as one, both correctly answered "someone else has
 * it": a genuinely first insert contended by two callers, and a non-expired lease held by a
 * DIFFERENT token — the query does not match that document, so the upsert's insert attempt
 * collides with the existing `_id` and Mongo answers E11000 either way.
 */
const acquireLease = (name: string, token: string, ttlMs: number): Promise<boolean> => {
    const now = new Date();

    return leaseModel
        .findOneAndUpdate(
            { _id: name, $or: [{ expiresAt: { $lt: now } }, { owner: token }] },
            { $set: { owner: token, expiresAt: new Date(now.getTime() + ttlMs) } },
            { upsert: true, returnDocument: 'after' }
        )
        .exec()
        .then(() => true)
        .catch((error: unknown) => {
            if (isDuplicateKey(error)) return false;
            throw error;
        });
};

/**
 * What "released" sets `expiresAt` to. The Unix epoch, not `new Date()`: a release and the very
 * next acquisition's own `now` can land in the same millisecond, and `acquireLease`'s query is a
 * strict `$lt` — a release stamped with "now" can leave the document expired-by-equality instead
 * of expired-by-comparison, and lose that race against itself. A date this far in the past is
 * `$lt` every real `now` without relying on the clock ticking forward between the two calls.
 */
const RELEASED = new Date(0);

/**
 * Release `name`, recording the outcome — called on both the success and the throwing path of
 * `withLease`, which is what makes a throwing body's lease immediately re-acquirable instead of
 * waiting out the full `ttlMs`.
 *
 * Filtered on `owner: token`: if the lease already expired and someone else acquired it before
 * this write lands, this update matches nothing and their lease is left alone — this holder lost
 * it fairly and has nothing left to release.
 */
const releaseLease = (
    name: string,
    token: string,
    outcome: { failed: false } | { failed: true; error: unknown }
): Promise<unknown> =>
    leaseModel
        .updateOne(
            { _id: name, owner: token },
            outcome.failed
                ? { $set: { expiresAt: RELEASED, lastError: describeError(outcome.error) } }
                : {
                      $set: { expiresAt: RELEASED, lastSuccessAt: new Date() },
                      $unset: { lastError: '' }
                  }
        )
        .exec()
        .catch((releaseError: unknown) => {
            // A failed release is not a failed job: the lease simply rides out its `ttlMs` instead
            // of freeing early, exactly as if the process had crashed here. Logged, not thrown —
            // throwing would replace the job's own outcome (success or its real error) with this
            // one.
            logger.warn('releaseLease - could not release, lease will expire naturally', {
                name,
                detail: describeError(releaseError)
            });
        });

/**
 * Run `run` only if this process is the one holder of the named lease right now, and release it
 * immediately after — on success or on a throw — rather than waiting out `ttlMs`.
 *
 * Returns `undefined` without calling `run` when another holder already has the lease. Rejects
 * with whatever `run` threw when `run` throws; a rejection from acquiring or releasing is not
 * conflated with that.
 *
 * @param name - the job's identity; also the lease document's `_id`
 * @param ttlMs - the ceiling on how long a holder that never releases (a crash) blocks the lease
 * @param run - the guarded work; its resolved value passes through unchanged
 */
export const withLease = <T>(
    name: string,
    ttlMs: number,
    run: () => Promise<T>
): Promise<T | undefined> => {
    const token = randomUUID();

    return acquireLease(name, token, ttlMs).then((acquired) => {
        if (!acquired) return undefined;

        return run().then(
            (result) => releaseLease(name, token, { failed: false }).then(() => result),
            (error: unknown) =>
                releaseLease(name, token, { failed: true, error }).then(() => {
                    throw error;
                })
        );
    });
};
