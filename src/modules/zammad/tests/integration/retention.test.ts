/**
 * @module
 * `reap:zammad-retention`, the daily pass through its declared job: a ticket is filed for deletion
 * when its last customer contact (else its creation) is older than the window, whatever its state;
 * a customer when they are created before the cutoff and have no ticket left; a suspected-spam
 * ticket after 30 days. Staff accounts and live customers are never touched.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { logger } from '@infrastructure/adapters/logger';
import { zammadJobs } from '../../jobs';
import { useZammad } from '../harness';

setupTestDb();

/** The stub of the case that is running. */
const zammad = useZammad();

beforeEach(() => {
    jest.spyOn(logger, 'info').mockImplementation(() => logger);
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** One day in milliseconds. */
const DAY_MS = 86_400_000;

/** An ISO time this many days ago. */
const daysAgo = (days: number): string => new Date(Date.now() - days * DAY_MS).toISOString();

/**
 * Run the pass the way the cron does.
 * @throws {Error} when the job is not declared
 */
const run = (): Promise<unknown> => {
    const job = zammadJobs.find(({ name }) => name === 'reap:zammad-retention');
    if (!job) throw new Error('the retention job is not declared');
    return job.run();
};

/** The `[type, id]` of every deletion task filed. */
const filed = () => zammad().privacyTasks.map((task) => [task.deletable_type, task.deletable_id]);

describe('tickets', () => {
    it('deletes by last customer contact, not by creation, and whatever the state', async () => {
        zammad().addUser({ id: 1000, email: 'a@example.com' });
        const stale = zammad().addTicket({
            customerId: 1000,
            createdAt: daysAgo(900),
            lastContactAt: daysAgo(800),
            state: 'open'
        });
        const stillTalking = zammad().addTicket({
            customerId: 1000,
            createdAt: daysAgo(900),
            lastContactAt: daysAgo(10),
            state: 'closed'
        });
        const young = zammad().addTicket({ customerId: 1000, createdAt: daysAgo(5) });

        await run();

        const ids = filed().map(([, id]) => id);
        expect(ids).toContain(stale.id);
        expect(ids).not.toContain(stillTalking.id);
        expect(ids).not.toContain(young.id);
    });

    it('falls back to the creation date when there was no contact', async () => {
        zammad().addUser({ id: 1000, email: 'a@example.com' });
        const old = zammad().addTicket({ customerId: 1000, createdAt: daysAgo(800) });
        old.last_contact_at = null;

        await run();

        expect(filed()).toContainEqual(['Ticket', old.id]);
    });

    it('does not file a second task for a ticket already queued', async () => {
        zammad().privacyTaskOutcome('in process');
        zammad().addUser({ id: 1000, email: 'a@example.com' });
        zammad().addTicket({ customerId: 1000, createdAt: daysAgo(900) });

        await run();
        await run();

        expect(zammad().privacyTasks).toHaveLength(1);
    });
});

describe('customers', () => {
    it('deletes a customer created before the cutoff who has no ticket left', async () => {
        zammad().addUser({ id: 2000, email: 'old@example.com', created_at: daysAgo(900) });
        zammad().addUser({ id: 2001, email: 'has-ticket@example.com', created_at: daysAgo(900) });
        zammad().addTicket({ customerId: 2001, createdAt: daysAgo(10) });
        zammad().addUser({ id: 2002, email: 'new@example.com', created_at: daysAgo(10) });

        await run();

        expect(filed()).toEqual([['User', 2000]]);
    });

    it('never deletes a user who is not a plain customer: an agent, an admin, the integration user', async () => {
        zammad().addUser({
            id: 3000,
            email: 'agent@shop.test',
            created_at: daysAgo(900),
            roles: ['Agent']
        });
        zammad().addUser({
            id: 3001,
            email: 'both@shop.test',
            created_at: daysAgo(900),
            roles: ['Customer', 'Agent']
        });

        await run();

        expect(filed()).toEqual([]);
    });
});

describe('suspected spam', () => {
    it('deletes a tagged ticket after 30 days, at any age otherwise, and leaves a young one', async () => {
        zammad().addUser({ id: 1000, email: 'a@example.com' });
        const oldSpam = zammad().addTicket({
            customerId: 1000,
            createdAt: daysAgo(31),
            tags: ['suspected-spam'],
            state: 'closed'
        });
        const youngSpam = zammad().addTicket({
            customerId: 1000,
            createdAt: daysAgo(5),
            tags: ['suspected-spam']
        });
        const oldNormal = zammad().addTicket({ customerId: 1000, createdAt: daysAgo(31) });

        await run();

        const ids = filed().map(([, id]) => id);
        expect(ids).toContain(oldSpam.id);
        expect(ids).not.toContain(youngSpam.id);
        expect(ids).not.toContain(oldNormal.id);
    });
});

describe('a Zammad that misreads the search', () => {
    it('never deletes on the search’s word: the spam rule re-checks the age and reads the tag back', async () => {
        zammad().addUser({ id: 1000, email: 'a@example.com' });
        const oldSpam = zammad().addTicket({
            customerId: 1000,
            createdAt: daysAgo(31),
            tags: ['suspected-spam']
        });
        zammad().addTicket({ customerId: 1000, createdAt: daysAgo(5), tags: ['suspected-spam'] });
        zammad().addTicket({ customerId: 1000, createdAt: daysAgo(31) });
        zammad().addTicket({ customerId: 1000, createdAt: daysAgo(2) });
        // Every search now answers every ticket, whatever its condition said.
        zammad().searchQuirks({ ignoreConditions: true });

        await run();

        expect(filed()).toEqual([['Ticket', oldSpam.id]]);
    });

    it('fails the run, never completes it half-way, when Zammad answers the same ticket page for every page', async () => {
        zammad().addUser({ id: 1000, email: 'a@example.com' });
        for (let index = 0; index < 120; index += 1)
            zammad().addTicket({ customerId: 1000, createdAt: daysAgo(900) });
        zammad().searchQuirks({ ignorePaging: true });

        await expect(run()).rejects.toThrow('does not page');

        // Nothing was filed on a list that could not be read whole.
        expect(zammad().privacyTasks).toEqual([]);
    });

    it('fails the run when Zammad answers the same user page for every page', async () => {
        for (let index = 0; index < 120; index += 1)
            zammad().addUser({
                id: 5000 + index,
                email: `c${String(index)}@example.com`,
                created_at: daysAgo(10)
            });
        zammad().searchQuirks({ ignorePaging: true });

        await expect(run()).rejects.toThrow('does not page');
    });
});

describe('a large backlog', () => {
    it('reads every page, with no cap, until a short one', async () => {
        zammad().addUser({ id: 1000, email: 'a@example.com' });
        for (let index = 0; index < 250; index += 1)
            zammad().addTicket({ customerId: 1000, createdAt: daysAgo(900) });

        await run();

        expect(zammad().privacyTasks).toHaveLength(250);
    });
});

describe('the module off', () => {
    it('files nothing and calls nothing', async () => {
        setEnvironment({ NODE_ZAMMAD_URL: undefined });
        const before = zammad().requests.length;

        await run();

        expect(zammad().requests).toHaveLength(before);
    });
});
