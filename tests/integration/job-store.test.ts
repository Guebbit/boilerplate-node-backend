/**
 * @module
 * The fallback queue's own rows and the gauges over them. A held job has no TTL, a dead one does,
 * and `HeldJobsStuck` can only fire on what these gauges report.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { holdJob, jobModel, parkJob } from '@infrastructure/persistence/job-store';
import {
    queueHeldJobsGauge,
    queueHeldJobsOldestAgeGauge
} from '@infrastructure/observability/metrics-queue';

setupTestDb();

/**
 * One gauge's value for one channel.
 *
 * @param gauge - the gauge to read
 * @param channel - the channel label
 * @returns `undefined` when the gauge reports nothing for that channel
 */
const valueOf = async (
    gauge: typeof queueHeldJobsGauge,
    channel: string
): Promise<number | undefined> => {
    const { values } = await gauge.get();
    return values.find(({ labels }) => labels.channel === channel)?.value;
};

describe('a held job', () => {
    it('has no expiry, so it is never silently dropped', async () => {
        await holdJob('worker.email.send', { n: 1 });

        const row = await jobModel.findOne().lean().exec();

        expect(row?.status).toBe('pending');
        expect(row?.expiresAt).toBeUndefined();
    });

    it('gets a week to live only once it is parked dead', async () => {
        await holdJob('worker.email.send', { n: 1 });
        const row = await jobModel.findOne().exec();
        if (!row) throw new Error('the held job is missing');

        await parkJob(row, 'refused');

        const parked = await jobModel.findOne().lean().exec();
        expect(parked?.status).toBe('dead');
        const days = ((parked?.expiresAt?.getTime() ?? 0) - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(6.9);
        expect(days).toBeLessThan(7.1);
    });
});

describe('the held-jobs gauges', () => {
    it('count the pending rows per channel and report how long the oldest has waited', async () => {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
        await jobModel.collection.insertOne({
            channel: 'worker.email.urgent',
            payload: { n: 1 },
            status: 'pending',
            attempts: 0,
            nextAttemptAt: tenMinutesAgo,
            createdAt: tenMinutesAgo
        });
        await holdJob('worker.email.urgent', { n: 2 });
        await holdJob('worker.image.digest', { n: 3 });

        expect(await valueOf(queueHeldJobsGauge, 'worker.email.urgent')).toBe(2);
        expect(await valueOf(queueHeldJobsGauge, 'worker.image.digest')).toBe(1);
        // The oldest row sets the age; the newer one on the same channel does not.
        const age = await valueOf(queueHeldJobsOldestAgeGauge, 'worker.email.urgent');
        expect(age).toBeGreaterThan(590);
        expect(age).toBeLessThan(620);
    });

    it('do not count a dead row as held, and drop a channel once nothing is held for it', async () => {
        await holdJob('worker.email.send', { n: 1 });
        const row = await jobModel.findOne().exec();
        if (!row) throw new Error('the held job is missing');
        await parkJob(row, 'refused');

        expect(await valueOf(queueHeldJobsGauge, 'worker.email.send')).toBeUndefined();
        expect(await valueOf(queueHeldJobsOldestAgeGauge, 'worker.email.send')).toBeUndefined();
    });
});
