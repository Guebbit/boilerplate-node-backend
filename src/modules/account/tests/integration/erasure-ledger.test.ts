/**
 * @module
 * The erasure ledger: written inside the erasure transaction (and absent after a rollback), noted
 * on a cancelled deletion, and replayed by `reapplyErasures` on a restored database — erasing
 * again exactly the `erased` rows since the snapshot, never a `cancelled` one, never twice.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { testCallerContext } from '@tests/callers';
import { observePort } from '@tests/ports';
import { resetDomainEvents } from '@kernel/events';
import { createUser, eraseAsScheduled, userRepository } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import * as auditPort from '@infrastructure/observability/audit';
import { accountService } from '../../services';
import { appIsAnswering, reapplyErasures, recordSchedule } from '../../services/erasure-ledger';
import { erasureLedgerModel } from '../../model';
import { accountAuditActions } from '../../audit';
import { plantToken } from '../factories';

jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/adapters/mailer'),
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));

setupTestDb();

beforeEach(() => {
    registerCheckoutModules();
});

afterEach(() => {
    jest.restoreAllMocks();
    resetDomainEvents();
});

/** One day, in milliseconds. */
const DAY = 24 * 60 * 60 * 1000;

/** Every ledger row, plain, oldest first. */
const ledger = () => erasureLedgerModel.find().sort({ at: 1 }).lean().exec();

/** The ledger rows of one account. */
const rowsOf = (userId: string) => erasureLedgerModel.find({ userId }).lean().exec();

/** Put a ledger row's date back in time, as a row written before a snapshot would carry. */
const backdate = (userId: string, kind: 'erased' | 'cancelled', at: Date) =>
    erasureLedgerModel.updateOne({ userId, kind }, { $set: { at } }).exec();

/**
 * Bring an erased account back as a restore of an older snapshot would: same id, same address.
 *
 * @param id - the erased account's id
 * @param email - its address
 */
const restoreFromSnapshot = (id: string, email: string) => createUser({ id, email });

describe('the ledger is written with the erasure', () => {
    it('adds one row — id, kind, date, expiry and nothing personal — when an account is erased', async () => {
        const user = await createUser({ email: 'gone@example.com' });
        const before = Date.now();

        await eraseAsScheduled(user);

        const rows = await rowsOf(user.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual(
            expect.objectContaining({ userId: user._id, kind: 'erased', at: expect.any(Date) })
        );
        expect(rows[0].at.getTime()).toBeGreaterThanOrEqual(before);
        // 220 days by default: past the oldest backup.
        expect(rows[0].expiresAt.getTime() - rows[0].at.getTime()).toBe(220 * DAY);
        // Nothing but these fields: no address, ip or agent.
        expect(Object.keys(rows[0]).toSorted()).toEqual([
            '_id',
            'at',
            'expiresAt',
            'kind',
            'userId'
        ]);
    });

    it('writes none when the erasure fails and rolls back, and the account stays', async () => {
        const user = await createUser({ email: 'stays@example.com' });
        // The user document's delete is the LAST write of the cascade, after the ledger's.
        jest.spyOn(userRepository, 'deleteOne').mockRejectedValueOnce(new Error('simulated'));

        await expect(eraseAsScheduled(user)).rejects.toThrow('simulated');

        expect(await rowsOf(user.id)).toEqual([]);
        expect(await userRepository.findById(user.id)).not.toBeNull();
    });

    it('writes one for an admin hard delete as well', async () => {
        const user = await createUser({ email: 'admin-deleted@example.com' });

        await userService.removeById(user.id, true, testCallerContext);

        const rows = await rowsOf(user.id);
        expect(rows.map((row) => row.kind)).toEqual(['erased']);
    });

    it('notes a cancelled deletion, once, however often it is cancelled', async () => {
        const user = await createUser({
            email: 'changed-mind@example.com',
            verifiedAt: new Date(),
            deletedAt: new Date(Date.now() - DAY),
            deletedBy: 'owner',
            purgeAt: new Date(Date.now() + 5 * DAY)
        });
        await plantToken(user.id, 'account-restore', 'restore-link');

        const restored = await accountService.restoreAccountByLink(
            'restore-link',
            testCallerContext
        );

        expect(restored.success).toBe(true);
        const rows = await rowsOf(user.id);
        expect(rows.map((row) => row.kind)).toEqual(['cancelled']);
    });
});

describe('reapplyErasures', () => {
    it('erases again exactly the erased rows since the snapshot, and leaves an unlocked account as it is', async () => {
        const since = new Date(Date.now() - 10 * DAY);
        const recent = await createUser({ email: 'recent@example.com' });
        const old = await createUser({ email: 'old@example.com' });
        const cancelled = await createUser({ email: 'cancelled@example.com' });
        await eraseAsScheduled(recent);
        await eraseAsScheduled(old);
        // Erased before the snapshot: the snapshot already lacks it, so it is not replayed.
        await backdate(old.id, 'erased', new Date(Date.now() - 20 * DAY));
        await erasureLedgerModel.create({
            userId: cancelled._id,
            kind: 'cancelled',
            at: new Date(),
            expiresAt: new Date(Date.now() + DAY)
        });
        // The restore brings all three back.
        await restoreFromSnapshot(recent.id, 'recent@example.com');
        await restoreFromSnapshot(old.id, 'old@example.com');

        const report = await reapplyErasures({ since });

        expect(report).toEqual({
            erased: 1,
            alreadyGone: 0,
            rescheduled: 0,
            unscheduled: 0,
            unchanged: 1,
            failed: 0
        });
        expect(await userRepository.findById(recent.id)).toBeNull();
        expect(await userRepository.findById(old.id)).not.toBeNull();
        expect(await userRepository.findById(cancelled.id)).not.toBeNull();
    });

    it('keeps the original date and adds no second row', async () => {
        const user = await createUser({ email: 'dated@example.com' });
        await eraseAsScheduled(user);
        const original = new Date(Date.now() - 3 * DAY);
        await backdate(user.id, 'erased', original);
        await restoreFromSnapshot(user.id, 'dated@example.com');

        await reapplyErasures({ since: new Date(Date.now() - 5 * DAY) });

        const rows = await rowsOf(user.id);
        expect(rows).toHaveLength(1);
        expect(rows[0].at).toEqual(original);
    });

    it('counts an account the restored database never held, and a second run changes nothing', async () => {
        const user = await createUser({ email: 'never-restored@example.com' });
        await eraseAsScheduled(user);
        const since = new Date(Date.now() - DAY);

        const first = await reapplyErasures({ since });
        const second = await reapplyErasures({ since });

        expect(first).toEqual({
            erased: 0,
            alreadyGone: 1,
            rescheduled: 0,
            unscheduled: 0,
            unchanged: 0,
            failed: 0
        });
        expect(second).toEqual(first);
    });

    it('counts a failed erasure, leaves the account for the next run, and then finishes it', async () => {
        const user = await createUser({ email: 'stubborn@example.com' });
        await eraseAsScheduled(user);
        await restoreFromSnapshot(user.id, 'stubborn@example.com');
        const since = new Date(Date.now() - DAY);
        jest.spyOn(userService, 'eraseAgain').mockRejectedValueOnce(new Error('simulated'));

        const failed = await reapplyErasures({ since });
        expect(failed.failed).toBe(1);
        expect(await userRepository.findById(user.id)).not.toBeNull();

        const retried = await reapplyErasures({ since });
        expect(retried.erased).toBe(1);
        expect(await userRepository.findById(user.id)).toBeNull();
    });

    it('writes the restoration log: who restored, which snapshot, how many', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ email: 'logged@example.com' });
        await eraseAsScheduled(user);
        await restoreFromSnapshot(user.id, 'logged@example.com');
        auditSpy.mockClear();

        await reapplyErasures({
            since: new Date(Date.now() - DAY),
            by: 'andrea',
            snapshot: 'abc123'
        });

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_ERASURES_REAPPLIED,
                outcome: 'success',
                metadata: expect.objectContaining({
                    by: 'andrea',
                    snapshot: 'abc123',
                    erased: 1,
                    failed: 0
                })
            })
        );
    });

    it('leaves the ledger itself as it found it', async () => {
        const user = await createUser({ email: 'ledger-intact@example.com' });
        await eraseAsScheduled(user);
        await restoreFromSnapshot(user.id, 'ledger-intact@example.com');
        const before = await ledger();

        await reapplyErasures({ since: new Date(Date.now() - DAY) });

        expect(await ledger()).toEqual(before);
    });
});

/** A ledger row as `recordSchedule` / `recordCancellation` write it. */
const plantRow = (userId: string, kind: 'scheduled' | 'cancelled', at: Date, purgeAt?: Date) =>
    erasureLedgerModel.create({
        userId,
        kind,
        at,
        ...(purgeAt ? { purgeAt } : {}),
        expiresAt: new Date(at.getTime() + 220 * DAY)
    });

/** What the restored snapshot shows: the account locked by its owner. */
const lockedInSnapshot = (email: string, purgeAt: Date) =>
    createUser({
        email,
        deletedAt: new Date(Date.now() - 40 * DAY),
        deletedBy: 'owner',
        purgeAt
    });

const since = () => new Date(Date.now() - 10 * DAY);

describe('reapplyErasures — deletion locks', () => {
    it('clears a lock the owner cancelled after the snapshot, even when its purgeAt has passed', async () => {
        const user = await lockedInSnapshot(
            'cancelled-late@example.com',
            new Date(Date.now() - DAY)
        );
        await plantRow(user.id, 'cancelled', new Date(Date.now() - 2 * DAY));

        const report = await reapplyErasures({ since: since() });

        expect(report.unscheduled).toBe(1);
        const reloaded = await userRepository.findById(user.id);
        expect(reloaded!.purgeAt).toBeUndefined();
        expect(reloaded!.deletedBy).toBeUndefined();
        expect(reloaded!.deletedAt).toBeUndefined();
    });

    it('locks an account the owner scheduled after the snapshot, at the stored purgeAt', async () => {
        const user = await createUser({ email: 'asked-late@example.com' });
        const requestedAt = new Date(Date.now() - 3 * DAY);
        const stored = new Date(Date.now() + 5 * DAY);
        await plantRow(user.id, 'scheduled', requestedAt, stored);

        const report = await reapplyErasures({ since: since() });

        expect(report.rescheduled).toBe(1);
        const reloaded = await userRepository.findById(user.id);
        expect(reloaded!.purgeAt).toEqual(stored);
        expect(reloaded!.deletedBy).toBe('owner');
        expect(reloaded!.deletedAt).toEqual(requestedAt);
        // The request ended every session, so a restore must not bring old tokens back.
        expect(reloaded!.tokensValidAfter).toEqual(requestedAt);
    });

    it('keeps an account scheduled when the owner cancelled and then asked again', async () => {
        const user = await createUser({ email: 'asked-twice@example.com' });
        const stored = new Date(Date.now() + 9 * DAY);
        await plantRow(user.id, 'cancelled', new Date(Date.now() - 5 * DAY));
        await plantRow(user.id, 'scheduled', new Date(Date.now() - 1 * DAY), stored);

        await reapplyErasures({ since: since() });

        const reloaded = await userRepository.findById(user.id);
        expect(reloaded!.deletedBy).toBe('owner');
        expect(reloaded!.purgeAt).toEqual(stored);
    });

    it('lets erased win over a later cancel or schedule', async () => {
        const user = await createUser({ email: 'erased-wins@example.com' });
        await eraseAsScheduled(user);
        await restoreFromSnapshot(user.id, 'erased-wins@example.com');
        await plantRow(user.id, 'cancelled', new Date(Date.now() + 1000));
        await plantRow(
            user.id,
            'scheduled',
            new Date(Date.now() + 2000),
            new Date(Date.now() + DAY)
        );

        const report = await reapplyErasures({ since: since() });

        expect(report.erased).toBe(1);
        expect(await userRepository.findById(user.id)).toBeNull();
    });

    it('does nothing on a second run', async () => {
        const late = await createUser({ email: 'second-run-a@example.com' });
        await plantRow(
            late.id,
            'scheduled',
            new Date(Date.now() - DAY),
            new Date(Date.now() + DAY)
        );
        const kept = await lockedInSnapshot('second-run-b@example.com', new Date(Date.now() - DAY));
        await plantRow(kept.id, 'cancelled', new Date(Date.now() - 2 * DAY));
        await reapplyErasures({ since: since() });

        const again = await reapplyErasures({ since: since() });

        expect(again).toEqual(
            expect.objectContaining({ rescheduled: 0, unscheduled: 0, failed: 0, unchanged: 2 })
        );
    });

    it('stores the promised purgeAt when the owner schedules, and an older event never overwrites a newer one', async () => {
        const user = await createUser({ email: 'promised@example.com', verifiedAt: new Date() });

        const schedule = await accountService.scheduleAccountDeletion(user, testCallerContext);
        // A stale write (an older request arriving late) must not move the stored date.
        await recordSchedule(user.id, new Date(schedule.requestedAt.getTime() - DAY), new Date(0));

        const rows = await rowsOf(user.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual(
            expect.objectContaining({
                kind: 'scheduled',
                at: schedule.requestedAt,
                purgeAt: schedule.purgeAt
            })
        );
    });
});

describe('appIsAnswering', () => {
    it('is true while something answers HTTP, whatever the status', async () => {
        const server = http.createServer((_request, response) => {
            response.statusCode = 503;
            response.end();
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address() as AddressInfo;

        try {
            expect(await appIsAnswering(`http://127.0.0.1:${port}`)).toBe(true);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('is false when the connection is refused', async () => {
        const server = http.createServer();
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address() as AddressInfo;
        await new Promise((resolve) => server.close(resolve));

        expect(await appIsAnswering(`http://127.0.0.1:${port}`)).toBe(false);
    });
});
