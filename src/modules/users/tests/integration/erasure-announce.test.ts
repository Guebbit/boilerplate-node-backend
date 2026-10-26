/**
 * @module
 * The `user.erased` outbox event: written in the erasure transaction on every hard-delete path,
 * absent when the erasure is abandoned, and answered by the analytics provider forgetting the id.
 * PostHog itself is never called: `forget` is observed on the resolved provider.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import { systemCallerContext } from '@kernel/permissions';
import { markDomainEventsWired, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { resolveAnalyticsProvider } from '@infrastructure/observability/analytics';
import { createUser } from '@modules/users/tests/factories';
import { userService } from '@modules/users/services';
import { userModel } from '../../model';
import usersModule from '../../module';

setupTestDb();

/** Outbox rows for `user.erased`, plain. */
const erasedRows = () => outboxEventModel.find({ name: 'user.erased' }).lean().exec();

/** A day, in ms, for placing `purgeAt` either side of now. */
const DAY_MS = 86_400_000;

/** An account its owner scheduled for erasure at `purgeAt`. */
const scheduled = async (email: string, purgeAt: Date) => {
    const user = await createUser({ email, username: email.split('@', 1)[0] });
    await userService.scheduleOwnDeletion(user, new Date(), purgeAt);
    return user;
};

afterEach(() => {
    jest.restoreAllMocks();
    resetDomainEvents();
});

describe('user.erased', () => {
    it('is written once by the admin hard delete', async () => {
        const user = await createUser({ email: 'admin-path@example.com', username: 'adminpath' });

        await userService.removeById(user.id, true, callerContextAs('admin'));

        expect(await erasedRows()).toMatchObject([
            { aggregateId: user.id, payload: { userId: user.id } }
        ]);
    });

    it('is written once by the scheduled purge', async () => {
        const user = await scheduled('purge-path@example.com', new Date(Date.now() - DAY_MS));

        await userService.eraseScheduledDeletion(user, systemCallerContext('User'));

        expect(await erasedRows()).toMatchObject([
            { aggregateId: user.id, payload: { userId: user.id } }
        ]);
    });

    it('is not written when the purge claim is lost', async () => {
        const user = await scheduled('lost-claim@example.com', new Date(Date.now() + 5 * DAY_MS));

        const result = await userService.eraseScheduledDeletion(user, systemCallerContext('User'));

        expect(result).toMatchObject({
            success: false,
            status: 409,
            errors: [{ code: 'USER_ERASURE_NOT_DUE' }]
        });
        expect(await erasedRows()).toHaveLength(0);
        expect(await userModel.countDocuments({ _id: user.id })).toBe(1);
    });

    it('is not written by a soft delete', async () => {
        const user = await createUser({ email: 'soft@example.com', username: 'softdel' });

        await userService.removeById(user.id, false, callerContextAs('admin'));

        expect(await erasedRows()).toHaveLength(0);
    });

    it('makes the analytics provider forget the erased id', async () => {
        const forget = jest.spyOn(resolveAnalyticsProvider(), 'forget').mockResolvedValue();
        markDomainEventsWired();
        usersModule.subscribe();
        const user = await createUser({ email: 'forgotten@example.com', username: 'forgotten' });

        await userService.removeById(user.id, true, callerContextAs('admin'));
        await settleOutboxNudges();

        expect(forget.mock.calls).toEqual([[user.id]]);
    });

    it('keeps the row pending when the provider fails, so the erasure is retried', async () => {
        jest.spyOn(resolveAnalyticsProvider(), 'forget').mockRejectedValue(new Error('down'));
        markDomainEventsWired();
        usersModule.subscribe();
        // An unrelated listener proves the failure is the provider's, not the bus's.
        onDomainEvent('user.erased', () => undefined);
        const user = await createUser({ email: 'retried@example.com', username: 'retried' });

        const result = await userService.removeById(user.id, true, callerContextAs('admin'));
        await settleOutboxNudges();

        expect(result.success).toBe(true);
        expect(await erasedRows()).toMatchObject([{ status: 'pending', attempts: 1 }]);
    });
});
