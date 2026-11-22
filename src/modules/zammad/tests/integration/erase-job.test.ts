/**
 * @module
 * The erase job through its public doors: a hard delete writes the row inside the erasure's
 * transaction, the leased sweep (the job the cron runs) files Zammad's deletion task and follows it
 * to `completed`. Every state a task can be in, and the one rule that keeps a stranger's address
 * out of it: only a verified address is looked up.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { logger } from '@infrastructure/adapters/logger';
import { metricsRegistry } from '@infrastructure/observability/metrics-registry';
import { erasureLedgerRetentionMs } from '@modules/account';
import { createUser } from '@modules/users/tests/factories';
import { zammadJobs } from '../../jobs';
import { zammadEraseJobModel, zammadSetupModel } from '../../model';
import { markGroupsVerified, upsertCustomer } from '../../repository';
import { eraseAccount, useZammad } from '../harness';

setupTestDb();

/** The stub of the case that is running. */
const zammad = useZammad();

beforeEach(async () => {
    // Zammad was set up here: `zammad:setup` left its marker, so a verified address is looked up.
    await markGroupsVerified(new Date());
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** The state of the one erase job the case made. */
const jobState = (): Promise<string | undefined> =>
    zammadEraseJobModel
        .findOne()
        .lean()
        .then((job) => job?.state);

/**
 * Run the erase sweep the way the cron does: through the declared job.
 * @throws {Error} when the job is not declared
 */
const runSweep = (): Promise<unknown> => {
    const job = zammadJobs.find(({ name }) => name === 'sweep:zammad-erasures');
    if (!job) throw new Error('the erase sweep is not declared');
    return job.run();
};

/** The deletion tasks the stub was asked for. */
const taskRequests = () =>
    zammad().requests.filter(
        ({ method, path }) => method === 'POST' && path === '/data_privacy_tasks'
    );

/** An account with a Zammad customer, erased: the erase job it leaves. */
const eraseMapped = async (zammadUserId: number, email = 'ada@example.com') => {
    const user = await createUser({ email, verifiedAt: new Date() });
    await upsertCustomer(user.id, zammadUserId);
    zammad().addUser({ id: zammadUserId, email });
    await eraseAccount(user.id);
    return user;
};

describe('the row the erasure writes', () => {
    it('carries the mapped customer and the verified address, inside the erasure', async () => {
        await eraseMapped(612);

        const [job] = await zammadEraseJobModel.find().lean();
        expect(job).toMatchObject({
            state: 'pending',
            email: 'ada@example.com',
            targets: [{ zammadUserId: 612, done: false }]
        });
    });

    it('carries no address for an account that never proved it', async () => {
        const user = await createUser({ email: 'ada@example.com' });
        await upsertCustomer(user.id, 612);

        await eraseAccount(user.id);

        const [job] = await zammadEraseJobModel.find().lean();
        expect(job.email).toBeUndefined();
        expect(job.targets).toMatchObject([{ zammadUserId: 612 }]);
    });

    it('queues no address lookup, and keeps no address, where Zammad was never set up', async () => {
        await zammadSetupModel.deleteMany({});
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });

        await eraseAccount(user.id);

        expect(await zammadEraseJobModel.countDocuments()).toBe(0);
    });

    it('still queues the address lookup while the helpdesk URL is unset, once Zammad was set up here', async () => {
        setEnvironment({ NODE_ZAMMAD_URL: undefined });
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });

        await eraseAccount(user.id);

        expect(await zammadEraseJobModel.find().lean()).toMatchObject([
            { email: 'ada@example.com', emailResolved: false, state: 'pending' }
        ]);
    });

    it('writes nothing for an unverified account that was never a customer', async () => {
        const user = await createUser({ email: 'ada@example.com' });

        await eraseAccount(user.id);

        expect(await zammadEraseJobModel.countDocuments()).toBe(0);
    });
});

describe('completed', () => {
    it('files a task for the mapped customer, follows it, and drops the address', async () => {
        await eraseMapped(612);

        await runSweep();

        expect(taskRequests().map(({ body }) => body)).toEqual([
            { deletable_type: 'User', deletable_id: 612 }
        ]);
        expect(zammad().users.has(612)).toBe(false);
        const [job] = await zammadEraseJobModel.find().lean();
        expect(job).toMatchObject({
            state: 'completed',
            targets: [{ zammadUserId: 612, done: true }]
        });
        expect(job.email).toBeUndefined();
        expect(job.completedAt).toBeDefined();
    });

    it('keeps the row until the erasure ledger forgets, and no longer', async () => {
        await eraseMapped(612);

        await runSweep();

        const [job] = await zammadEraseJobModel.find().lean();
        expect(job.expireAt?.getTime()).toBeCloseTo(
            (job.completedAt?.getTime() ?? 0) + erasureLedgerRetentionMs(),
            -3
        );
    });

    it('also deletes a customer who wrote under the verified address before there was an account', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        zammad().addUser({ id: 700, email: 'ada@example.com' });
        zammad().addUser({ id: 701, email: 'someone-else@example.com' });
        await eraseAccount(user.id);

        await runSweep();

        expect(taskRequests().map(({ body }) => body?.deletable_id)).toEqual([700]);
        expect(zammad().users.has(701)).toBe(true);
    });

    it('erases the customer that holds the address, leaves an agent that shares it, and parks the job', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        zammad().addUser({ id: 700, email: 'ada@example.com' });
        zammad().addUser({ id: 800, email: 'ada@example.com', roles: ['Agent'] });
        const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
        await eraseAccount(user.id);

        await runSweep();

        expect(taskRequests().map(({ body }) => body?.deletable_id)).toEqual([700]);
        expect(zammad().users.has(700)).toBe(false);
        expect(zammad().users.has(800)).toBe(true);
        expect(await jobState()).toBe('failed');
        // Ids and role names only: the address is not in the log.
        expect(logged).toHaveBeenCalledWith(
            expect.objectContaining({ zammadUsers: [{ id: 800, roles: ['Agent'] }] })
        );
        expect(JSON.stringify(logged.mock.calls)).not.toContain('ada@example.com');
    });

    it('never files a deletion for a non-customer the mapping names, and parks the job', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        zammad().addUser({ id: 900, email: 'staff@example.com', roles: ['Agent'] });
        await upsertCustomer(user.id, 900);
        await eraseAccount(user.id);

        await runSweep();

        expect(taskRequests()).toEqual([]);
        expect(zammad().users.has(900)).toBe(true);
        expect(await jobState()).toBe('failed');
    });

    it('never looks an unverified address up: anyone can sign up with a stranger’s', async () => {
        const user = await createUser({ email: 'victim@example.com' });
        zammad().addUser({ id: 700, email: 'victim@example.com' });
        await upsertCustomer(user.id, 612);
        await eraseAccount(user.id);

        await runSweep();

        expect(zammad().requests.some(({ path }) => path.startsWith('/users/search'))).toBe(false);
        expect(zammad().users.has(700)).toBe(true);
    });
});

describe('a task that is still in process', () => {
    it('is followed on the next pass, not filed a second time', async () => {
        zammad().privacyTaskOutcome('in process');
        await eraseMapped(612);

        await runSweep();
        await zammadEraseJobModel.updateMany({}, { $set: { nextAttemptAt: new Date(0) } });
        await runSweep();

        expect(taskRequests()).toHaveLength(1);
        expect(await jobState()).toBe('pending');

        zammad().finishTasks('completed');
        await zammadEraseJobModel.updateMany({}, { $set: { nextAttemptAt: new Date(0) } });
        await runSweep();

        expect(await jobState()).toBe('completed');
    });

    it('raises the stuck gauge once it has waited past the hour', async () => {
        zammad().privacyTaskOutcome('in process');
        await eraseMapped(612);
        await runSweep();
        // `createdAt` is immutable through the model; the raw collection backdates it.
        await zammadEraseJobModel.collection.updateMany(
            {},
            { $set: { createdAt: new Date(Date.now() - 2 * 3_600_000) } }
        );

        const gauge = await metricsRegistry.getSingleMetricAsString(
            'zammad_erase_oldest_pending_seconds'
        );

        expect(
            Number(
                gauge
                    .split('\n')
                    .find((line) => line.startsWith('zammad_erase_oldest'))
                    ?.split(' ', 2)[1]
            )
        ).toBeGreaterThan(3600);
    });
});

describe('failed', () => {
    it('parks the job, keeps the address for a technician, and raises the failed gauge', async () => {
        zammad().privacyTaskOutcome('failed');
        await eraseMapped(612);

        await runSweep();
        await runSweep();

        const [job] = await zammadEraseJobModel.find().lean();
        expect(job).toMatchObject({ state: 'failed', email: 'ada@example.com' });
        // Parked: the second pass did not file another task.
        expect(taskRequests()).toHaveLength(1);
        const gauge = await metricsRegistry.getSingleMetricAsString('zammad_erase_jobs_failed');
        expect(gauge).toContain('zammad_erase_jobs_failed 1');
    });
});

describe('already queued', () => {
    it('looks the existing task up and follows it instead of filing another', async () => {
        await eraseMapped(612);
        // A technician filed the task by hand a moment ago; it has not run yet.
        zammad().privacyTasks.push({
            id: 5,
            state: 'in process',
            deletable_type: 'User',
            deletable_id: 612
        });

        await runSweep();

        expect(zammad().privacyTasks).toHaveLength(1);
        const [job] = await zammadEraseJobModel.find().lean();
        expect(job.targets).toMatchObject([{ zammadUserId: 612, taskId: 5 }]);
        expect(job.state).toBe('pending');
    });
});

describe('user gone', () => {
    it('counts a customer Zammad no longer has as done, without filing anything', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await upsertCustomer(user.id, 612);
        await eraseAccount(user.id);

        await runSweep();

        expect(taskRequests()).toHaveLength(0);
        expect(await jobState()).toBe('completed');
    });
});

describe('Zammad down', () => {
    it('keeps the job and retries later instead of giving up', async () => {
        await eraseMapped(612);
        zammad().goDown();

        await runSweep();

        const [job] = await zammadEraseJobModel.find().lean();
        expect(job).toMatchObject({ state: 'pending', attempts: 1 });
        expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    });
});
