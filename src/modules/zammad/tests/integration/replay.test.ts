/**
 * @module
 * Replaying erasures after Zammad alone was restored from a dump: the jobs completed since the dump
 * go back to pending and the same worker files the tasks again. A customer the restored Zammad does
 * not hold (created after the dump) counts as done, and a restoration-log audit row is written.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { observePort } from '@tests/ports';
import * as auditPort from '@infrastructure/observability/audit';
import { createUser } from '@modules/users/tests/factories';
import { zammadService } from '../../services';
import { zammadAuditActions } from '../../audit';
import { zammadEraseJobModel } from '../../model';
import { upsertCustomer } from '../../repository';
import { eraseAccount, useZammad } from '../harness';

jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

/** The stub of the case that is running. */
const zammad = useZammad();

/** The state of the one erase job the case made. */
const jobState = (): Promise<string | undefined> =>
    zammadEraseJobModel
        .findOne()
        .lean()
        .then((job) => job?.state);

/** One day in milliseconds. */
const DAY_MS = 86_400_000;

/** An account with a Zammad customer, erased and swept: a completed job. */
const eraseAndComplete = async (zammadUserId: number, email: string) => {
    const user = await createUser({ email, verifiedAt: new Date() });
    await upsertCustomer(user.id, zammadUserId);
    zammad().addUser({ id: zammadUserId, email });
    await eraseAccount(user.id);
    await zammadService.sweepErasures();
};

/** The tasks filed so far, as `[type, id]`. */
const filed = () => zammad().privacyTasks.map((task) => [task.deletable_type, task.deletable_id]);

describe('replaying since a dump', () => {
    it('files the tasks again for jobs completed since, and only those', async () => {
        await eraseAndComplete(612, 'before@example.com');
        // Dump time: after the first erasure, before the second.
        const dump = new Date(Date.now() + 1000);
        await new Promise((resolve) => setTimeout(resolve, 1100));
        await eraseAndComplete(613, 'after@example.com');
        // The restored Zammad holds both customers again, as the dump had them.
        zammad().addUser({ id: 612, email: 'before@example.com' });
        zammad().addUser({ id: 613, email: 'after@example.com' });
        zammad().privacyTasks.length = 0;

        const reopened = await zammadService.replayErasures({ since: dump, by: 'andrea' });
        await zammadService.sweepErasures();

        expect(reopened).toBe(1);
        expect(filed()).toEqual([['User', 613]]);
        expect(zammad().users.has(612)).toBe(true);
        expect(zammad().users.has(613)).toBe(false);
    });

    it('counts a customer created after the dump as done: the restored database does not hold it', async () => {
        await eraseAndComplete(612, 'ada@example.com');
        // Restored Zammad: that customer id does not exist in the dump.
        zammad().privacyTasks.length = 0;

        await zammadService.replayErasures({ since: new Date(Date.now() - DAY_MS), by: 'andrea' });
        await zammadService.sweepErasures();

        expect(filed()).toEqual([]);
        expect(await jobState()).toBe('completed');
    });

    it('writes the restoration log: who restored, which snapshot, how many', async () => {
        await eraseAndComplete(612, 'ada@example.com');
        const auditSpy = observePort(auditPort.emitAuditEvent);
        auditSpy.mockClear();
        const since = new Date(Date.now() - DAY_MS);

        await zammadService.replayErasures({ since, by: 'andrea', snapshot: 'dump-7' });

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: zammadAuditActions.ZAMMAD_ERASURES_REPLAYED,
                metadata: {
                    by: 'andrea',
                    snapshot: 'dump-7',
                    since: since.toISOString(),
                    reopened: 1
                }
            })
        );
    });

    it('leaves a pending job alone and is safe to run twice', async () => {
        zammad().privacyTaskOutcome('in process');
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await upsertCustomer(user.id, 612);
        zammad().addUser({ id: 612, email: 'ada@example.com' });
        await eraseAccount(user.id);
        await zammadService.sweepErasures();
        const since = new Date(Date.now() - DAY_MS);

        const first = await zammadService.replayErasures({ since, by: 'andrea' });
        const second = await zammadService.replayErasures({ since, by: 'andrea' });

        expect([first, second]).toEqual([0, 0]);
        expect(zammad().privacyTasks).toHaveLength(1);
    });
});
