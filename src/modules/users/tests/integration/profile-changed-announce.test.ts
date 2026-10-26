/**
 * @module
 * The `user.profile_changed` outbox event behind the `user.updated` webhook: written in the save's
 * own transaction for a real rectification, absent for a no-op, and never carrying a value.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import { outboxEventModel } from '@kernel/outbox';
import { createUser } from '@modules/users/tests/factories';
import { userService } from '@modules/users/services';
import { userModel } from '../../model';

setupTestDb();

/** Outbox rows for `user.profile_changed`, plain. */
const changedRows = () => outboxEventModel.find({ name: 'user.profile_changed' }).lean().exec();

/** The payload of every row, in order. */
const payloads = () => changedRows().then((rows) => rows.map((row) => row.payload));

describe('user.profile_changed', () => {
    it('is written once by an admin edit, naming the fields that moved', async () => {
        const user = await createUser({ email: 'admin-edit@example.com', username: 'adminedit' });

        await userService.updateById(
            user.id,
            { username: 'renamed', website: 'https://example.com' },
            callerContextAs('admin')
        );

        expect(await payloads()).toMatchObject([{ changed: ['username', 'website'] }]);
        expect(await changedRows()).toMatchObject([{ aggregateId: user.id }]);
    });

    it('is written by the owner’s own edit', async () => {
        const user = await createUser({ email: 'self-edit@example.com', username: 'selfedit' });

        await userService.updateOwnProfile(
            await userModel.findById(user.id).orFail(),
            { phone: '+391234567890' },
            callerContextAs('customer')
        );

        expect(await payloads()).toMatchObject([{ changed: ['phone'] }]);
    });

    it('is not written when the same values are sent again', async () => {
        const user = await createUser({ email: 'noop@example.com', username: 'noopuser' });
        await userService.updateById(user.id, { phone: '+391234567890' }, callerContextAs('admin'));

        // The phone is stored under a random IV: the stored text differs, the number does not.
        await userService.updateById(
            user.id,
            { username: 'noopuser', phone: '+391234567890' },
            callerContextAs('admin')
        );

        expect(await payloads()).toMatchObject([{ changed: ['phone'] }]);
    });

    it('is not written for a preference alone', async () => {
        const user = await createUser({ email: 'prefs@example.com', username: 'prefsuser' });

        await userService.updateById(user.id, { locale: 'it' }, callerContextAs('admin'));

        expect(await changedRows()).toHaveLength(0);
    });

    it('is written by an email-change confirmation and by its undo', async () => {
        const user = await createUser({ email: 'old@example.com', username: 'emailer' });
        const loaded = await userModel.findById(user.id).orFail();

        await userService.applyEmailChange(loaded, 'new@example.com');
        await userService.restorePreviousEmail(await userModel.findById(user.id).orFail());

        expect(await payloads()).toMatchObject([{ changed: ['email'] }, { changed: ['email'] }]);
    });

    it('never carries a value', async () => {
        const user = await createUser({ email: 'values@example.com', username: 'valuesuser' });

        await userService.updateById(
            user.id,
            { username: 'secretname', phone: '+391234567890' },
            callerContextAs('admin')
        );

        expect(JSON.stringify(await changedRows())).not.toMatch(/secretname|\+39123|values@/);
    });
});
