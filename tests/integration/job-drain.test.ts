/**
 * @module
 * The durable fallback queue end to end against a real database: a held job is claimed, run through
 * the same handler and schema as a broker delivery, and ends removed, retried or parked.
 *
 * Which row a loop may take (its role's channels, never a dead or not-yet-due one) and what a
 * failure does to the row are the behaviour; the broker is not involved.
 */

import { z } from 'zod';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import {
    startJobDrain,
    stopJobDrain,
    type DrainConsumer
} from '@infrastructure/adapters/job-drain';
import { claimNextJob, holdJob, jobModel } from '@infrastructure/persistence/job-store';
import { queueJobsDeadLetteredTotal } from '@infrastructure/observability/metrics-queue';

/** What the queue adapter reports; a case sets it. */
const queueStateMock = jest.fn().mockReturnValue('ready');
jest.mock('@infrastructure/adapters/queue', () => ({
    ...jest.requireActual('@infrastructure/adapters/queue'),
    queueState: () => queueStateMock()
}));

/**
 * A short lease, so a case can outlast it in well under a second: the real one is a minute, and the
 * renewal runs every third of it.
 */
jest.mock('@infrastructure/persistence/job-store', () => ({
    ...jest.requireActual('@infrastructure/persistence/job-store'),
    CLAIM_LEASE_MS: 300
}));

setupTestDb();

/** A payload the stand-in consumers accept. */
const payloadSchema = z.object({ n: z.number() });

/** The payloads the stand-in handler ran with, in order. */
const ran: unknown[] = [];

/**
 * A consumer for `queue` whose handler records its payload and answers `outcome`.
 *
 * @param queue - the channel
 * @param outcome - what the handler does: `true` done, `false` refuse, an Error to throw
 */
const consumer = (queue: string, outcome: boolean | Error = true): DrainConsumer => ({
    queue,
    schema: payloadSchema,
    handler: (message) => {
        ran.push(message);
        return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
    }
});

/**
 * Wait until `done` holds, polling the database.
 *
 * @param done - the condition, asked every 20 ms
 */
const until = async (done: () => Promise<boolean>): Promise<void> => {
    for (let attempt = 0; attempt < 150; attempt += 1) {
        if (await done()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('the drain did not reach the expected state');
};

/**
 * A consumer for the webhook channel that declares a sweep of its own.
 *
 * @param fallbackSweep - what the worker runs while the broker is down
 */
const withSweep = (fallbackSweep: () => Promise<void>): DrainConsumer => ({
    ...consumer('worker.webhook.deliver'),
    fallbackSweep
});

/** A promise a case settles by hand: `gate` waits until `release` is called. */
const deferred = (): { gate: Promise<void>; release: () => void } => {
    let open: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
        open = resolve;
    });
    return { gate, release: () => open?.() };
};

/**
 * The dead-letter metric's current value for one channel.
 *
 * @param queue - the channel
 */
const deadLettered = async (queue: string): Promise<number> => {
    const { values } = await queueJobsDeadLetteredTotal.get();
    return values.find(({ labels }) => labels.queue === queue)?.value ?? 0;
};

beforeEach(() => {
    ran.length = 0;
    setEnvironment({ NODE_QUEUE_MAX_ATTEMPTS: '2', NODE_QUEUE_RETRY_DELAY_SECONDS: '1' });
});

afterEach(() => stopJobDrain(1000));

describe('a held job', () => {
    it('runs through the handler and is removed', async () => {
        await holdJob('worker.email.send', { n: 1 });

        startJobDrain([consumer('worker.email.send')], 'standard');

        await until(async () => (await jobModel.countDocuments()) === 0);
        expect(ran).toEqual([{ n: 1 }]);
    });

    it('is parked, not run, when its payload no longer satisfies the contract', async () => {
        await holdJob('worker.email.send', { n: 'not a number' });

        startJobDrain([consumer('worker.email.send')], 'standard');

        await until(async () => (await jobModel.countDocuments({ status: 'dead' })) === 1);
        expect(ran).toEqual([]);
    });

    it('is parked, not retried, when the handler refuses it', async () => {
        await holdJob('worker.email.send', { n: 1 });

        startJobDrain([consumer('worker.email.send', false)], 'standard');

        await until(async () => (await jobModel.countDocuments({ status: 'dead' })) === 1);
        expect(ran).toHaveLength(1);
    });

    it('is put back for another attempt, with the failure kept, when the handler throws', async () => {
        await holdJob('worker.email.send', { n: 1 });

        startJobDrain([consumer('worker.email.send', new Error('smtp timeout'))], 'standard');

        await until(async () => (await jobModel.countDocuments({ attempts: 1 })) === 1);
        const row = await jobModel.findOne().lean().exec();
        expect(row?.status).toBe('pending');
        expect(row?.lastError).toBe('smtp timeout');
        // Due again later, not at once: the retry delay is the broker's `NODE_QUEUE_RETRY_DELAY_SECONDS`.
        expect(row?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    });
});

describe('which rows a loop may claim', () => {
    it('never claims a dead row, or one not yet due', async () => {
        await jobModel.create([
            {
                channel: 'worker.email.send',
                payload: { n: 1 },
                status: 'dead',
                nextAttemptAt: new Date(Date.now() - 1000)
            },
            {
                channel: 'worker.email.send',
                payload: { n: 2 },
                nextAttemptAt: new Date(Date.now() + 60_000)
            }
        ]);

        startJobDrain([consumer('worker.email.send')], 'standard');
        await new Promise((resolve) => setTimeout(resolve, 150));

        expect(ran).toEqual([]);
        expect(await jobModel.countDocuments()).toBe(2);
    });

    it('does not claim a row that is under a live lease', async () => {
        await holdJob('worker.email.send', { n: 1 });
        const claimed = await claimNextJob(['worker.email.send'], 60_000);
        expect(claimed).not.toBeNull();

        startJobDrain([consumer('worker.email.send')], 'standard');
        await new Promise((resolve) => setTimeout(resolve, 150));

        expect(ran).toEqual([]);
    });

    it('takes a row over once its lease has lapsed, as when a worker died mid-job', async () => {
        await holdJob('worker.email.send', { n: 1 });
        await claimNextJob(['worker.email.send'], 1);
        await new Promise((resolve) => setTimeout(resolve, 20));

        startJobDrain([consumer('worker.email.send')], 'standard');

        await until(async () => (await jobModel.countDocuments()) === 0);
        expect(ran).toEqual([{ n: 1 }]);
    });
});

describe('a job that outlasts its lease', () => {
    it('is not claimed again by another copy while its handler is still running', async () => {
        await holdJob('worker.account.export', { n: 1 });
        const { gate, release } = deferred();
        const slow: DrainConsumer = {
            queue: 'worker.account.export',
            schema: payloadSchema,
            handler: (message) => {
                ran.push(message);
                return gate.then(() => true);
            }
        };

        startJobDrain([slow], 'heavy');
        await until(() => Promise.resolve(ran.length === 1));
        // Three leases later the claim would have lapsed twice over, were it not renewed.
        await new Promise((resolve) => setTimeout(resolve, 900));
        const second = await claimNextJob(['worker.account.export'], 300);
        release();
        await until(async () => (await jobModel.countDocuments()) === 0);

        expect(second).toBeNull();
        expect(ran).toHaveLength(1);
    });
});

describe('parking', () => {
    it('counts a job parked after its last attempt in the dead-letter metric, by channel', async () => {
        const before = await deadLettered('worker.email.send');
        // One attempt already failed: the next failure is the last one `NODE_QUEUE_MAX_ATTEMPTS` allows.
        await jobModel.create({
            channel: 'worker.email.send',
            payload: { n: 1 },
            attempts: 1,
            nextAttemptAt: new Date()
        });

        startJobDrain([consumer('worker.email.send', new Error('smtp timeout'))], 'standard');

        await until(async () => (await jobModel.countDocuments({ status: 'dead' })) === 1);
        expect(await deadLettered('worker.email.send')).toBe(before + 1);
        const row = await jobModel.findOne().lean().exec();
        expect(row?.lastError).toBe('smtp timeout');
        // A parked row is kept for a week, then Mongo removes it.
        expect(row?.expiresAt).toBeInstanceOf(Date);
    });
});

describe('the urgent mail loop', () => {
    it('drains while the shared loop is stuck on a slow handler', async () => {
        await holdJob('worker.email.send', { n: 1 });
        await holdJob('worker.email.urgent', { n: 2 });
        const { gate, release } = deferred();
        const stuck: DrainConsumer = {
            queue: 'worker.email.send',
            schema: payloadSchema,
            handler: () => gate.then(() => true)
        };

        startJobDrain([stuck, consumer('worker.email.urgent')], 'standard');
        await until(
            async () => (await jobModel.countDocuments({ channel: 'worker.email.urgent' })) === 0
        );
        // The shared loop is still inside its handler: the ordinary row is still there.
        expect(await jobModel.countDocuments({ channel: 'worker.email.send' })).toBe(1);
        expect(ran).toEqual([{ n: 2 }]);

        release();
        await until(async () => (await jobModel.countDocuments()) === 0);
    });
});

describe('which jobs a role takes', () => {
    it('leaves a heavy channel to the heavy worker', async () => {
        await holdJob('worker.image.digest', { n: 1 });
        await holdJob('worker.email.send', { n: 2 });

        startJobDrain([consumer('worker.image.digest'), consumer('worker.email.send')], 'standard');

        await until(async () => (await jobModel.countDocuments()) === 1);
        expect(ran).toEqual([{ n: 2 }]);
        const left = await jobModel.findOne().lean().exec();
        expect(left?.channel).toBe('worker.image.digest');
    });
});

describe('the fallback sweep', () => {
    it('runs while the broker is down, so a worker sends what the delivery rows hold', async () => {
        queueStateMock.mockReturnValue('unavailable');
        const fallbackSweep = jest.fn().mockResolvedValue(undefined);

        startJobDrain([withSweep(fallbackSweep)], 'standard');

        await until(() => Promise.resolve(fallbackSweep.mock.calls.length > 0));
        expect(fallbackSweep).toHaveBeenCalled();
    });

    it('does not run while the broker is up', async () => {
        queueStateMock.mockReturnValue('ready');
        const fallbackSweep = jest.fn().mockResolvedValue(undefined);

        startJobDrain([withSweep(fallbackSweep)], 'standard');
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(fallbackSweep).not.toHaveBeenCalled();
    });

    it('does not run on the heavy worker, which does not take that channel', async () => {
        queueStateMock.mockReturnValue('unavailable');
        const fallbackSweep = jest.fn().mockResolvedValue(undefined);

        startJobDrain([withSweep(fallbackSweep)], 'heavy');
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(fallbackSweep).not.toHaveBeenCalled();
    });
});
