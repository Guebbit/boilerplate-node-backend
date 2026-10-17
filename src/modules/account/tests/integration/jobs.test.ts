/**
 * @module
 * What each of `account`'s jobs resolves: the count of what it swept, which the demo profile's
 * `POST /__test/jobs/:name` hands back so a journey can assert the job did something.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { accountJobs } from '../../jobs';

setupTestDb();

/** Runs the declared job of this name. */
const run = (name: string): Promise<unknown> => {
    const job = accountJobs.find((candidate) => candidate.name === name);
    if (!job) throw new Error(`no such job: ${name}`);
    return job.run();
};

describe('account jobs', () => {
    it('reap:inactive-accounts resolves zero for every stage while both dials are off', async () => {
        setEnvironment({ NODE_INACTIVE_ACCOUNT_DAYS: '0', NODE_INACTIVE_MINIMISE_DAYS: '0' });

        await expect(run('reap:inactive-accounts')).resolves.toEqual({
            minimised: 0,
            warned: 0,
            softDeleted: 0,
            hardDeleted: 0
        });
    });

    it('reap:previous-emails resolves how many it cleared', async () => {
        await expect(run('reap:previous-emails')).resolves.toEqual({ cleared: 0 });
    });

    it('reap:account-exports resolves the rows and stray files it removed', async () => {
        await expect(run('reap:account-exports')).resolves.toEqual({ rows: 0, files: 0 });
    });
});
