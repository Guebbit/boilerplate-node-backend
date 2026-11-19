/**
 * @module
 * The durable fallback queue: where a job waits when the broker is configured but down. The
 * workers drain it (`src/infrastructure/adapters/job-drain.ts`), so a job is never dropped and never run inside a
 * request because the broker blew a fuse.
 *
 * Shape:     a database queue, the same idea as Laravel's `database` failover or Solid Queue. One
 *            row per job: channel, payload, attempts, a lease.
 * Claim:     one atomic `findOneAndUpdate` takes the oldest due row and stamps a lease token, as
 *            the outbox does. A worker that dies mid-job lets the lease lapse; the next claim
 *            takes the row again.
 * Expiry:    a held job has NO TTL: it stays until a worker drains it, because "never dropped"
 *            would be false the day a worker outage outlasted one. The alert for a job nobody
 *            drains is `HeldJobsStuck` (oldest held job over 15 minutes), fed by the gauges below.
 *            Only a `dead` row expires, after a week. A drained row is deleted at once, so a reset
 *            token or a 2FA code sits in Mongo only while it is undelivered.
 * Not here:  a webhook delivery keeps its own row (`webhooks`) and is sent from it by the worker's
 *            `fallbackSweep`, never copied in here. An image or an export IS held here: its
 *            pending marker only says "not done", not "queued".
 *
 * @see docs/understand/rabbitmq.md#when-the-broker-is-down
 */

import { randomUUID } from 'node:crypto';
import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { DAY_MS } from '@domain-primitives/time';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { setHeldJobsReader } from '@infrastructure/observability/metrics-queue';

/** Where a held job is in its life. `dead` is terminal and needs an operator. */
const JOB_STATUSES = ['pending', 'dead'] as const;

/** See {@link JOB_STATUSES}. */
export type JobStatus = (typeof JOB_STATUSES)[number];

/** One held job. */
export interface JobDocument extends Document {
    /** The channel the job was meant for (`worker.email.send`). */
    channel: string;
    /** The message exactly as the broker would have carried it. Checked against its schema on claim. */
    payload: unknown;
    status: JobStatus;
    /** Runs that failed so far. */
    attempts: number;
    /** Not claimed before this. Moves out with each failure, so backoff needs no timer. */
    nextAttemptAt: Date;
    /** A worker's claim on the row. Expires on its own, so a crashed worker frees it. */
    lockedUntil?: Date;
    /** Random per claim. Every result write must carry it, so a stale claim's write misses. */
    leaseToken?: string;
    lastError?: string;
    /** Set only when the job is parked `dead`; the TTL index reads it, so a held job never expires. */
    expiresAt?: Date;
    createdAt: Date;
}

/** Mongoose model type for {@link JobDocument}. */
export type JobModel = Model<JobDocument>;

/** How long a dead job is kept for an operator, the same week the broker keeps a parked message. */
const DEAD_TTL_MS = 7 * DAY_MS;

/**
 * How long one claim holds a row before another worker may take it. The drain renews it while the
 * handler runs ({@link renewJobLease}), so it bounds how soon a DEAD worker's job is taken over,
 * not how long a job may take.
 */
export const CLAIM_LEASE_MS = 60_000;

/** Jobs collection schema. */
const jobSchema = new Schema<JobDocument, JobModel>(
    {
        channel: { type: String, required: true },
        payload: { type: Schema.Types.Mixed, required: true },
        status: { type: String, enum: [...JOB_STATUSES], default: 'pending' },
        attempts: { type: Number, default: 0 },
        nextAttemptAt: { type: Date, required: true },
        lockedUntil: { type: Date },
        leaseToken: { type: String },
        lastError: { type: String },
        expiresAt: { type: Date }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

/** No endpoint serves a job, but a claim's token is a credential-shaped field: never on the wire. */
applySerialization(jobSchema, { omit: ['leaseToken'] });

/** The claim's read: due pending rows of some channels, oldest first. */
jobSchema.index({ status: 1, channel: 1, nextAttemptAt: 1 });

/**
 * Cleanup of dead rows, `expireAfterSeconds: 0` so the row's own `expiresAt` says when. A row with
 * no `expiresAt` (every held job) is never touched. Same caveat as every TTL index here: changing it
 * needs `npm run db:sync`.
 */
jobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Jobs model entrypoint. Collection `jobs`. */
export const jobModel = model<JobDocument, JobModel>('Job', jobSchema);

/**
 * Hold a job until a worker drains it.
 *
 * @param channel - the channel the job was meant for
 * @param payload - the message, already built and JSON-serializable
 */
export const holdJob = (channel: string, payload: unknown): Promise<void> => {
    const now = Date.now();
    return jobModel
        .create({ channel, payload, nextAttemptAt: new Date(now) })
        .then(() => undefined);
};

/**
 * Take the oldest due job of `channels` under a fresh lease.
 *
 * @param channels - the channels this loop serves
 * @param leaseMs - how long the claim holds the row unless it is renewed
 * @returns the claimed row (its `leaseToken` set), or `null` when none is due
 */
export const claimNextJob = (
    channels: readonly string[],
    leaseMs: number
): Promise<JobDocument | null> => {
    const now = new Date();
    return jobModel
        .findOneAndUpdate(
            {
                status: 'pending',
                channel: { $in: [...channels] },
                nextAttemptAt: { $lte: now },
                $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }]
            },
            {
                $set: {
                    lockedUntil: new Date(now.getTime() + leaseMs),
                    leaseToken: randomUUID()
                }
            },
            // `returnDocument: 'after'` returns the row after the update, so the caller sees its own token.
            { sort: { nextAttemptAt: 1, _id: 1 }, returnDocument: 'after' }
        )
        .exec();
};

/**
 * Extend a running job's claim, so a handler that outlasts the lease (an export build) is not taken
 * over by another copy. Matches the claim's token: a claim already lost renews nothing.
 *
 * @param job - the claimed row
 * @param leaseMs - how long from now the claim holds
 */
export const renewJobLease = (job: JobDocument, leaseMs: number): Promise<void> =>
    jobModel
        .updateOne(
            { _id: job._id, leaseToken: job.leaseToken },
            { $set: { lockedUntil: new Date(Date.now() + leaseMs) } }
        )
        .then(() => undefined);

/**
 * Remove a finished job. Matches the claim's token, so a worker whose lease lapsed deletes nothing.
 *
 * @param job - the claimed row
 */
export const completeJob = (job: JobDocument): Promise<void> =>
    jobModel.deleteOne({ _id: job._id, leaseToken: job.leaseToken }).then(() => undefined);

/**
 * Put a failed job back for another attempt after `delayMs`.
 *
 * @param job - the claimed row
 * @param error - what went wrong, kept on the row
 * @param delayMs - how long until it is due again
 */
export const retryJobLater = (job: JobDocument, error: string, delayMs: number): Promise<void> =>
    jobModel
        .updateOne(
            { _id: job._id, leaseToken: job.leaseToken },
            {
                $inc: { attempts: 1 },
                $set: { nextAttemptAt: new Date(Date.now() + delayMs), lastError: error },
                $unset: { lockedUntil: '', leaseToken: '' }
            }
        )
        .then(() => undefined);

/**
 * Park a job that will not succeed: out of attempts, or refused for good. It is kept for an
 * operator, and never claimed again.
 *
 * @param job - the claimed row
 * @param error - why it was parked
 */
export const parkJob = (job: JobDocument, error: string): Promise<void> =>
    jobModel
        .updateOne(
            { _id: job._id, leaseToken: job.leaseToken },
            {
                $inc: { attempts: 1 },
                $set: {
                    status: 'dead',
                    lastError: error,
                    expiresAt: new Date(Date.now() + DEAD_TTL_MS)
                },
                $unset: { lockedUntil: '', leaseToken: '' }
            }
        )
        .then(() => undefined);

/**
 * What the held-jobs gauges read: per channel, how many pending jobs wait and since when the
 * oldest has. A job under a live claim is still held, since the work is not done.
 */
const heldJobsSummary = (): Promise<{ channel: string; count: number; oldestCreatedAt: Date }[]> =>
    jobModel
        .aggregate<{ _id: string; count: number; oldestCreatedAt: Date }>([
            { $match: { status: 'pending' } },
            {
                $group: {
                    _id: '$channel',
                    count: { $sum: 1 },
                    oldestCreatedAt: { $min: '$createdAt' }
                }
            }
        ])
        .then((groups) =>
            groups.map(({ _id, count, oldestCreatedAt }) => ({
                channel: _id,
                count,
                oldestCreatedAt
            }))
        );

// Hand the gauges their reader: observability sits below this file and may not import it.
setHeldJobsReader(heldJobsSummary);
