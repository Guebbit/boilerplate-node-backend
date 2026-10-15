/**
 * @module
 * The inactivity reaper's stage order, through the real services and a real database: minimise
 * whatever each dial asks for, warn once, soft delete only after the grace that follows the
 * warning, hard delete only after the grace that follows the soft delete — and never two steps in
 * one run. The candidates each stage lists are `users/tests/integration/reaper.test.ts`'s.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import mongoose, { Types } from 'mongoose';
import { reapInactiveAccounts } from '../../services/reap-inactive';

setupTestDb();

/** The moment `days` days before now. */
const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** The accounts collection, through the raw driver: this suite reads what the reaper wrote, deleted or not. */
const users = () => mongoose.connection.collection('users');

/** Backdates an account, with whatever the case needs on top. */
const backdate = (id: string, fields: Record<string, unknown> = {}) =>
    users().updateOne(
        { _id: new Types.ObjectId(id) },
        { $set: { createdAt: daysAgo(400), ...fields } }
    );

/** What the reaper has written on an account, or `null` once it is gone. */
const stateOf = (id: string) =>
    users().findOne<{
        inactivityWarnedAt?: Date;
        inactivityMinimisedAt?: Date;
        deletedAt?: Date;
        deletedBy?: string;
    }>({ _id: new Types.ObjectId(id) });

beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
});

describe('reapInactiveAccounts', () => {
    it('warns an inactive customer once, and neither deletes them in the same run', async () => {
        const user = await createUser({ email: 'quiet@reaper.test' }, 'customer');
        await backdate(user.id);

        await reapInactiveAccounts({ inactiveDays: 365, minimiseDays: 0 });
        const afterFirst = await stateOf(user.id);
        await reapInactiveAccounts({ inactiveDays: 365, minimiseDays: 0 });
        const afterSecond = await stateOf(user.id);

        expect(afterFirst?.inactivityWarnedAt).toBeDefined();
        expect(afterFirst?.deletedAt).toBeUndefined();
        // The grace runs from the warning, so a second run straight after changes nothing.
        expect(afterSecond?.deletedAt).toBeUndefined();
        expect(afterSecond?.inactivityWarnedAt).toEqual(afterFirst?.inactivityWarnedAt);
    });

    it('soft deletes an account still quiet a grace after its warning, marking it the reaper’s', async () => {
        const user = await createUser({ email: 'warned@reaper.test' }, 'customer');
        await backdate(user.id, { inactivityWarnedAt: daysAgo(31) });

        await reapInactiveAccounts({ inactiveDays: 365, minimiseDays: 0 });

        const state = await stateOf(user.id);
        expect(state?.deletedAt).toBeDefined();
        expect(state?.deletedBy).toBe('reaper');
    });

    it('hard deletes a reaper soft delete a grace later', async () => {
        const user = await createUser({ email: 'gone@reaper.test' }, 'customer');
        await backdate(user.id, { deletedBy: 'reaper', deletedAt: daysAgo(31) });

        await reapInactiveAccounts({ inactiveDays: 365, minimiseDays: 0 });

        expect(await stateOf(user.id)).toBeNull();
    });

    it('minimises on its own dial, and deletes nothing while the deletion dial is off', async () => {
        const user = await createUser({ email: 'minimal@reaper.test' }, 'customer');
        await backdate(user.id, { inactivityWarnedAt: daysAgo(100) });

        await reapInactiveAccounts({ inactiveDays: 0, minimiseDays: 30 });

        const state = await stateOf(user.id);
        expect(state?.inactivityMinimisedAt).toBeDefined();
        expect(state?.deletedAt).toBeUndefined();
    });

    it('does nothing while both dials are off', async () => {
        const user = await createUser({ email: 'off@reaper.test' }, 'customer');
        await backdate(user.id);

        await reapInactiveAccounts({ inactiveDays: 0, minimiseDays: 0 });

        const state = await stateOf(user.id);
        expect(state?.inactivityWarnedAt).toBeUndefined();
        expect(state?.inactivityMinimisedAt).toBeUndefined();
    });
});
