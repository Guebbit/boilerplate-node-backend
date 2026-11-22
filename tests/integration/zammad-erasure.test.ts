/**
 * @module
 * The help desk inside the account's erasure and export, through the public doors with the module
 * ON (`erasure.test.ts` runs with it off): a hard delete leaves an erase job, the cron's sweep
 * files Zammad's deletion task for the mapped customer AND for the customer found by the verified
 * address, and the account export carries Zammad's copy, or fails whole when Zammad is down.
 */

import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { startZammadStub, type ZammadStub } from '@tests/zammad-stub';
import { callerContextAs, testCallerContext } from '@tests/callers';
import { resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { createUser } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { accountExportRepository } from '@modules/account/repository';
import { requestExport, settleInlineExports } from '@modules/account/services/export';
import { zammadService } from '@modules/zammad';
import { zammadEraseJobModel } from '@modules/zammad/model';
import { upsertCustomer } from '@modules/zammad/repository';
import { enabledModules } from '../../src/modules';
// Building the app installs the real personal-data sections and erasers, as production does.
import '@tests/http';

setupTestDb();

/** The stub of the case that is running. */
let zammad: ZammadStub;

/** The export directory of the case. */
let root: string;

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'zammad-export-'));
    zammad = await startZammadStub();
    setEnvironment({
        NODE_ZAMMAD_URL: zammad.url,
        NODE_ZAMMAD_API_TOKEN: zammad.token,
        NODE_ZAMMAD_GROUP: 'Support',
        NODE_ACCOUNT_EXPORT_STORE_PATH: root
    });
    resetDomainEvents();
    registerModules(enabledModules);
});

afterEach(async () => {
    await settleInlineExports();
    resetDomainEvents();
    await zammad.stop();
    await rm(root, { recursive: true, force: true });
});

/** The state of the one erase job the case made. */
const jobState = (): Promise<string | undefined> =>
    zammadEraseJobModel
        .findOne()
        .lean()
        .then((job) => job?.state);

describe('an account hard-deleted while the help desk is on', () => {
    it('has Zammad delete the mapped customer and the one found by the verified address', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        // Two customers: the one the account is mapped to, and one who wrote before the account existed.
        await upsertCustomer(user.id, 612);
        zammad.addUser({ id: 612, email: 'ada.work@example.com' });
        zammad.addUser({ id: 700, email: 'ada@example.com' });
        zammad.addUser({ id: 701, email: 'unrelated@example.com' });

        const erased = await userService.removeById(user.id, true, callerContextAs('admin'));
        const waiting = await zammadEraseJobModel.find().lean();
        await zammadService.sweepErasures();

        expect(erased.success).toBe(true);
        expect(waiting).toHaveLength(1);
        expect(
            zammad.privacyTasks.map(({ deletable_type: type, deletable_id: id }) => [type, id])
        ).toEqual([
            ['User', 612],
            ['User', 700]
        ]);
        expect(zammad.users.has(701)).toBe(true);
        expect(await jobState()).toBe('completed');
    });
});

/** Ask for an export as `user` and wait for the inline build. */
const exportFor = async (userId: string) => {
    const result = await requestExport(userId, testCallerContext);
    if (!result.success) throw new Error('the request was refused');
    await settleInlineExports();
    return accountExportRepository.findByUserId(userId);
};

describe('the account export while the help desk is on', () => {
    it('carries Zammad’s copy of the person', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await upsertCustomer(user.id, 612);
        zammad.addUser({ id: 612, email: 'ada@example.com' });
        zammad.addTicket({
            customerId: 612,
            createdAt: '2026-01-01T00:00:00.000Z',
            title: 'Parcel',
            articles: [{ sender: 'Customer', body: 'Where is it?' }]
        });

        const row = await exportFor(user.id);

        expect(row?.status).toBe('ready');
        const [name] = await readdir(root);
        const file = await readFile(path.join(root, name), 'utf8');
        const parsed = JSON.parse(file) as { zammad?: { customers?: { id: number }[] } };
        expect(parsed.zammad?.customers?.map(({ id }) => id)).toEqual([612]);
        expect(file).toContain('Where is it?');
    });

    it('fails whole, leaving no file, when Zammad is down', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await upsertCustomer(user.id, 612);
        zammad.goDown();

        const row = await exportFor(user.id);

        expect(row?.status).toBe('failed');
        expect(await readdir(root)).toEqual([]);
    });
});
