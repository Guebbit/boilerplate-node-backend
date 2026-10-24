/**
 * @module
 * The purge behind `reap:scheduled-deletions`: it erases what is due, with the real cascade, and
 * nothing else. Not-yet-due rows, an admin's soft delete and the inactivity reaper's rows are
 * left alone; a second run finds nothing; the trail says the system erased it.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { resetDomainEvents } from '@kernel/events';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { accountService } from '@modules/account/services';
import { plantSession, plantToken, sessionRowsOf, tokenRowsOf } from '../factories';
import { accountAuditActions } from '../../audit';
import { observePort } from '@tests/ports';
import * as auditPort from '@infrastructure/observability/audit';
import * as mailerPort from '@infrastructure/adapters/mailer';

/* The audit port is replaced, not spied on: see `tests/support/ports.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

// The queue, not the copy: what the purge mails is read back from here.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/adapters/mailer'),
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));

setupTestDb();

// The real cascade needs every module's erase hook registered, the way a boot does it.
beforeEach(() => {
    registerCheckoutModules();
    (mailerPort.enqueueEmail as jest.Mock).mockClear();
});

afterEach(() => resetDomainEvents());

/** The moment `days` days from now (negative: ago). */
const daysFromNow = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

/** An account its owner asked to delete, with a session and a restore link of its own. */
const scheduled = async (email: string, purgeAt: Date) => {
    const user = await createUser({
        email,
        verifiedAt: new Date(),
        deletedAt: daysFromNow(-30),
        deletedBy: 'owner',
        purgeAt
    });
    await plantSession(user.id, `session-${email}`);
    await plantToken(user.id, 'account-restore', `restore-${email}`);
    return user;
};

describe('purgeScheduledDeletions', () => {
    it('erases a due account with its sessions and links, and leaves the rest alone', async () => {
        const due = await scheduled('due@example.com', daysFromNow(-1));
        const early = await scheduled('early@example.com', daysFromNow(3));
        const adminDeleted = await createUser({
            email: 'admin-deleted@example.com',
            deletedAt: daysFromNow(-90)
        });
        const reaped = await createUser({
            email: 'reaped@example.com',
            deletedAt: daysFromNow(-90),
            deletedBy: 'reaper'
        });

        const counts = await accountService.purgeScheduledDeletions();

        expect(counts).toEqual({ purged: 1, skipped: 0, failed: 0 });
        expect(await userRepository.findById(due.id)).toBeNull();
        expect(await sessionRowsOf(due.id)).toEqual([]);
        expect(await tokenRowsOf(due.id)).toEqual([]);
        for (const kept of [early, adminDeleted, reaped])
            expect(await userRepository.findById(kept.id)).not.toBeNull();
        expect(await tokenRowsOf(early.id)).toHaveLength(1);
    });

    it('does nothing on a second run', async () => {
        await scheduled('once@example.com', daysFromNow(-1));
        await accountService.purgeScheduledDeletions();

        const again = await accountService.purgeScheduledDeletions();

        expect(again).toEqual({ purged: 0, skipped: 0, failed: 0 });
    });

    it('says goodbye to the address the account had, and records who erased it', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await scheduled('goodbye@example.com', daysFromNow(-1));

        await accountService.purgeScheduledDeletions();

        const mails = (mailerPort.enqueueEmail as jest.Mock).mock.calls as [
            { to: string },
            string
        ][];
        expect(mails.map(([envelope, template]) => [envelope.to, template])).toEqual([
            ['goodbye@example.com', 'account.deleted']
        ]);
        const actions = auditSpy.mock.calls.map(([event]) => (event as { action: string }).action);
        expect(actions).toContain('system.user.erased');
        expect(actions).not.toContain('admin.user.erased');
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_ACCOUNT_DELETE_COMPLETED,
                actorUserId: user.id
            })
        );
    });

    it('skips an account restored after the job read it', async () => {
        const user = await scheduled('changed-mind@example.com', daysFromNow(-1));
        await userRepository.updateMany({ _id: user.id }, { $set: { purgeAt: daysFromNow(5) } });

        const counts = await accountService.purgeScheduledDeletions();

        expect(counts.purged).toBe(0);
        expect(await userRepository.findById(user.id)).not.toBeNull();
    });
});
