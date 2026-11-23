// requires-module: notifications
/**
 * @module
 * What the data export holds of the notifications module: the account's own notifications, and
 * nobody else's. The rest of the export is `src/modules/account/tests/integration/export.test.ts`; this file goes with `notifications`
 * when that module is removed.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { testCallerContext } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createNotification } from '@modules/notifications/tests/factories';
import { requestExport, settleInlineExports } from '@modules/account/services/export';
/**
 * Importing the HTTP harness builds the app, which runs every module's `onRegistered` and so
 * installs the real section list and the real erasers.
 */
import '@tests/http';

jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual<typeof import('@infrastructure/adapters/mailer')>(
        '@infrastructure/adapters/mailer'
    ),
    enqueueEmail: jest.fn(() => Promise.resolve())
}));

setupTestDb();

/** The export directory of the current case. */
let root: string;

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'account-export-notifications-'));
    setEnvironment({ NODE_ACCOUNT_EXPORT_STORE_PATH: root });
});

afterEach(async () => {
    await settleInlineExports();
    jest.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
});

describe('what the export holds of the notifications module', () => {
    it('lists the account’s own notifications, and nobody else’s', async () => {
        // The real section list, as `@tests/http` installed it: nothing swapped in.
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        const stranger = await createUser({ email: 'stranger@example.com' });
        await createNotification({ userId: user.id });
        await createNotification({
            userId: user.id,
            body: {
                code: 'notifications.staff.outbox-dead',
                params: { eventName: 'user.updated', aggregateId: '64b7f1a2c3d4e5f607182930' }
            }
        });
        await createNotification({ userId: stranger.id });

        const result = await requestExport(user.id, testCallerContext);
        await settleInlineExports();

        if (!result.success) throw new Error('the request was refused');
        const document = JSON.parse(
            await readFile(path.join(root, `${result.data.id}.json`), 'utf8')
        ) as {
            notifications?: { code: string }[];
        };

        expect(document.notifications?.map(({ code }) => code).toSorted()).toEqual([
            'notifications.staff.outbox-dead',
            'notifications.staff.webhook-disabled'
        ]);
    });
});
