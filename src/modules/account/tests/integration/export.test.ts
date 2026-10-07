/**
 * @module
 * The data export as a job: asking records a row and queues a build, the worker writes the file
 * and mails a link, a download streams it to its owner, and erasure and the reaper take row and
 * file away together. Real Mongo, a real temporary export directory, and the real services; the
 * only fakes are the mail queue (captured) and the audit port (captured).
 *
 * No broker in a test run, so every build runs inline after the request resolves, and
 * `settleInlineExports` is the "wait for the worker" step. The HTTP side of the same flow is
 * `contract/api.contract.test.ts`'s.
 */

import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment, withEnvironment } from '@tests/environment';
import { asReject } from '@tests/response';
import { testCallerContext } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { createNotification } from '@modules/notifications/tests/factories';
import type { PersonalDataSection } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { accountExportRepository } from '@modules/account/repository';
import { accountExportModel } from '@modules/account/model';
import {
    personalDataSections,
    setPersonalDataSections
} from '@modules/account/services/personal-data-registry';
import {
    EXPORT_BUILD_LIMIT_MS,
    openOwnExport,
    requestExport,
    settleInlineExports
} from '@modules/account/services/export';
import { runExportJob } from '@modules/account/services/export-job';
import { reapExpiredExports } from '@modules/account/services/export-rows';
// Importing the HTTP harness builds the app, which runs every module's `onRegistered` and so
// installs the real section list and the real erasers.
import '@tests/http';

/** Every mail the app queued, newest last. `mock*` so the hoisted `jest.mock` may close over it. */
const mockOutbox: { to: string; template: string; data: Record<string, unknown> }[] = [];

jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual<typeof import('@infrastructure/adapters/mailer')>(
        '@infrastructure/adapters/mailer'
    ),
    enqueueEmail: jest.fn(
        (envelope: { to: string }, template: string, data: Record<string, unknown>) => {
            mockOutbox.push({ to: envelope.to, template, data });
            return Promise.resolve();
        }
    )
}));

/** Every audit event recorded, newest last. */
const mockAudit: { action: string; target_id?: string; metadata?: Record<string, unknown> }[] = [];

jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    return {
        __esModule: true,
        ...actual,
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (context) mockAudit.push(fields);
        }
    };
});

setupTestDb();

/** The registered sections, put back after a case installs its own. */
let originalSections: readonly PersonalDataSection[];

/** The export directory of the current case. */
let root: string;

beforeAll(() => {
    originalSections = personalDataSections();
});

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'account-export-'));
    setEnvironment({ NODE_ACCOUNT_EXPORT_STORE_PATH: root });
    mockOutbox.length = 0;
    mockAudit.length = 0;
});

afterEach(async () => {
    await settleInlineExports();
    setPersonalDataSections(originalSections);
    jest.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
});

/** A section that answers with a fixed value. */
const section = (name: string, value: unknown): PersonalDataSection => ({
    section: name,
    collect: () => Promise.resolve(value)
});

/** The sections a minimal valid export needs: a profile and one more. */
const basicSections = (): PersonalDataSection[] => [
    section('profile', { email: 'ada@example.com' }),
    section('cart', [{ productId: 'p1' }])
];

/**
 * Ask for an export as a fresh verified account, unwrapping the success.
 *
 * @param overrides - fields for the account
 */
const requestFor = async (overrides: Parameters<typeof createUser>[0] = {}) => {
    const user = await createUser({
        email: 'ada@example.com',
        verifiedAt: new Date(),
        ...overrides
    });
    const result = await requestExport(user.id, user.email, testCallerContext);
    if (!result.success) throw new Error('the request was refused');
    return { user, result };
};

/** The finished export's text. */
const fileOf = (name: string): Promise<string> => readFile(path.join(root, name), 'utf8');

/** What a download of this export streams, or `undefined` when there is nothing to send. */
const downloadOf = (userId: string, exportId: string): Promise<string | undefined> =>
    openOwnExport(userId, exportId, testCallerContext).then((stream) =>
        stream ? text(stream) : undefined
    );

/** A section that holds the build until the case lets it go. */
const gate = () => {
    // Assigned by the executor, which runs synchronously: `release` is set before it is returned.
    let release!: () => void;
    const open = new Promise<undefined>((resolve) => {
        release = () => resolve(undefined);
    });
    const held: PersonalDataSection = { section: 'profile', collect: () => open.then(() => ({})) };
    return { held, release };
};

/**
 * Make a ready export and move its deadline.
 *
 * @param email - the account's address
 * @param millis - when the export falls due, from now (negative: already due)
 */
const exportDueIn = async (email: string, millis: number) => {
    setPersonalDataSections(basicSections());
    const user = await createUser({ email });
    const result = await requestExport(user.id, user.email, testCallerContext);
    await settleInlineExports();
    await accountExportModel.updateOne(
        { userId: user.id },
        { $set: { expiresAt: new Date(Date.now() + millis) } }
    );
    return { user, id: String(result.data?.id) };
};

describe('what the export holds of the notifications module', () => {
    it('lists the account’s own notifications, and nobody else’s', async () => {
        // The real section list, as `@tests/http` installed it: nothing swapped in.
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        const stranger = await createUser({ email: 'stranger@example.com' });
        await createNotification({ userId: user.id });
        await createNotification({
            userId: user.id,
            body: {
                code: 'notifications.wishlist-item-removed',
                params: { productId: '64b7f1a2c3d4e5f607182930', titles: { en: 'Red mug' } }
            }
        });
        await createNotification({ userId: stranger.id });

        const result = await requestExport(user.id, user.email, testCallerContext);
        await settleInlineExports();

        if (!result.success) throw new Error('the request was refused');
        const document = JSON.parse(await fileOf(`${result.data.id}.json`)) as {
            notifications?: { code: string }[];
        };

        expect(document.notifications?.map(({ code }) => code).toSorted()).toEqual([
            'notifications.cart-line-removed',
            'notifications.wishlist-item-removed'
        ]);
    });
});

describe('requestExport', () => {
    it('answers 202 with a building row, and the worker then makes it ready', async () => {
        setPersonalDataSections(basicSections());

        const { user, result } = await requestFor();

        expect(result.status).toBe(202);
        expect(result.data.status).toBe('building');
        await settleInlineExports();
        const row = await accountExportRepository.findByUserId(user.id);
        expect(row?.status).toBe('ready');
        expect(String(row?._id)).toBe(result.data.id);
    });

    it('writes one JSON object: every section that answered, then exportedAt', async () => {
        setPersonalDataSections([
            ...basicSections(),
            section('feedback', undefined),
            section('orders', [])
        ]);

        const { result } = await requestFor();
        await settleInlineExports();

        const document = JSON.parse(await fileOf(`${result.data.id}.json`)) as Record<
            string,
            unknown
        >;
        // `feedback` resolved `undefined`: omitted, not null.
        expect(Object.keys(document)).toEqual(['profile', 'cart', 'orders', 'exportedAt']);
        expect(document.profile).toEqual({ email: 'ada@example.com' });
        expect(new Date(document.exportedAt as string).toISOString()).toBe(document.exportedAt);
    });

    it('hands every section the subject the request saw, verified flag included', async () => {
        const seen: unknown[] = [];
        setPersonalDataSections([
            section('profile', {}),
            {
                section: 'feedback',
                collect: (subject) => {
                    seen.push(subject);
                    return Promise.resolve([]);
                }
            }
        ]);

        const { user } = await requestFor({ verifiedAt: undefined });
        await settleInlineExports();

        expect(seen).toEqual([{ userId: user.id, email: user.email, emailVerified: false }]);
    });

    it('mails a link to the account and never the data', async () => {
        setPersonalDataSections(basicSections());

        const { user, result } = await requestFor();
        await settleInlineExports();

        expect(mockOutbox).toHaveLength(1);
        const [mail] = mockOutbox;
        expect(mail.to).toBe(user.email);
        expect(mail.template).toBe('account.export-ready');
        expect(String(mail.data.linkUrl)).toContain(`/account-export/${result.data.id}`);
        // The mail names the link and the retention, and carries nothing of the export.
        expect(JSON.stringify(mail.data)).not.toContain('productId');
    });

    it('records the request in the audit trail, against the export', async () => {
        setPersonalDataSections(basicSections());

        const { result } = await requestFor();

        expect(mockAudit).toContainEqual(
            expect.objectContaining({
                action: 'auth.data_export.requested',
                target_id: result.data.id
            })
        );
    });

    it('answers 404 for an account that is gone', async () => {
        const result = await requestExport('0'.repeat(24), 'gone@example.com', testCallerContext);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });
});

describe('one live export per account', () => {
    it('returns the building export again, and starts no second build', async () => {
        const { held, release } = gate();
        const collect = jest.spyOn(held, 'collect');
        setPersonalDataSections([held]);
        const user = await createUser({ email: 'ada@example.com' });

        const first = await requestExport(user.id, user.email, testCallerContext);
        const second = await requestExport(user.id, user.email, testCallerContext);

        expect(first.success && second.success).toBe(true);
        expect(second.data?.id).toBe(first.data?.id);
        expect(second.data?.status).toBe('building');
        release();
        await settleInlineExports();
        expect(collect).toHaveBeenCalledTimes(1);
        expect(mockOutbox).toHaveLength(1);
        expect(mockAudit.at(-1)?.metadata).toEqual({ reused: true });
    });

    it('replaces a ready export: the old file and row are gone, the new one has its own id', async () => {
        setPersonalDataSections(basicSections());
        const { user, result: first } = await requestFor();
        await settleInlineExports();

        const second = await requestExport(user.id, user.email, testCallerContext);
        await settleInlineExports();

        expect(second.data?.id).not.toBe(first.data.id);
        expect(await readdir(root)).toEqual([`${String(second.data?.id)}.json`]);
        await expect(accountExportRepository.findById(first.data.id)).resolves.toBeNull();
    });

    it('replaces a building export that has outlived the build limit', async () => {
        const { held, release } = gate();
        setPersonalDataSections([held]);
        const user = await createUser({ email: 'ada@example.com' });
        const first = await requestExport(user.id, user.email, testCallerContext);
        // Age the row past the limit, as a build lost with its process would be.
        await accountExportModel.updateOne(
            { userId: user.id },
            { $set: { createdAt: new Date(Date.now() - EXPORT_BUILD_LIMIT_MS - 1000) } }
        );

        const second = await requestExport(user.id, user.email, testCallerContext);

        expect(second.data?.id).not.toBe(first.data?.id);
        release();
        await settleInlineExports();
    });

    it('lets only one of two simultaneous requests create the row', async () => {
        setPersonalDataSections(basicSections());
        const user = await createUser({ email: 'ada@example.com' });

        const [one, two] = await Promise.all([
            requestExport(user.id, user.email, testCallerContext),
            requestExport(user.id, user.email, testCallerContext)
        ]);

        expect(one.data?.id).toBe(two.data?.id);
        await settleInlineExports();
        await expect(accountExportModel.countDocuments({ userId: user.id })).resolves.toBe(1);
    });
});

/** Run `body` with a mailbox budget of `limit` mails a day. */
const withBudget = (limit: number, body: () => Promise<void>) =>
    withEnvironment('NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX', String(limit), body);

describe('the mailbox budget', () => {
    it('answers 429 once the mailbox is spent, and the ready export stays downloadable', () =>
        withBudget(1, async () => {
            setPersonalDataSections(basicSections());
            const { user, result: first } = await requestFor({ email: 'budget@example.com' });
            await settleInlineExports();

            const refused = await requestExport(user.id, user.email, testCallerContext);

            expect(asReject(refused).status).toBe(429);
            expect(asReject(refused).errors[0].code).toBe('RATE_LIMITED');
            expect(await downloadOf(user.id, first.data.id)).toContain('exportedAt');
        }));

    it('does not charge a request that finds an export still building', () =>
        withBudget(1, async () => {
            const { held, release } = gate();
            setPersonalDataSections([held]);
            const user = await createUser({ email: 'building@example.com' });

            const first = await requestExport(user.id, user.email, testCallerContext);
            const second = await requestExport(user.id, user.email, testCallerContext);

            expect(first.success && second.success).toBe(true);
            expect(second.status).toBe(202);
            expect(second.data?.id).toBe(first.data?.id);
            release();
            await settleInlineExports();
        }));
});

describe('a build that fails', () => {
    it('marks the row failed, logs it, leaves no file and mails nothing', async () => {
        const error = jest.spyOn(logger, 'error').mockReturnValue(undefined);
        setPersonalDataSections([
            section('profile', {}),
            { section: 'orders', collect: () => Promise.reject(new Error('mongo went away')) }
        ]);

        const { user, result } = await requestFor();
        await settleInlineExports();

        const row = await accountExportRepository.findByUserId(user.id);
        expect(row?.status).toBe('failed');
        expect(await readdir(root)).toEqual([]);
        expect(mockOutbox).toEqual([]);
        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ exportId: result.data.id, message: 'account export failed' })
        );
    });

    it('fails an export with no profile section: that is not an answer to anyone', async () => {
        jest.spyOn(logger, 'error').mockReturnValue(undefined);
        setPersonalDataSections([section('cart', [])]);

        const { user } = await requestFor();
        await settleInlineExports();

        await expect(accountExportRepository.findByUserId(user.id)).resolves.toMatchObject({
            status: 'failed'
        });
    });

    it('is replaced by asking again', async () => {
        jest.spyOn(logger, 'error').mockReturnValue(undefined);
        setPersonalDataSections([section('cart', [])]);
        const { user, result: failed } = await requestFor();
        await settleInlineExports();
        setPersonalDataSections(basicSections());

        const retry = await requestExport(user.id, user.email, testCallerContext);
        await settleInlineExports();

        expect(retry.data?.id).not.toBe(failed.data.id);
        await expect(accountExportRepository.findByUserId(user.id)).resolves.toMatchObject({
            status: 'ready'
        });
    });
});

describe('running a job twice', () => {
    it('builds and mails once: only the run that settles the row announces it', async () => {
        const { held, release } = gate();
        setPersonalDataSections([held]);
        const user = await createUser({ email: 'ada@example.com' });
        const requested = await requestExport(user.id, user.email, testCallerContext);
        const job = {
            exportId: String(requested.data?.id),
            userId: user.id,
            email: user.email,
            emailVerified: false,
            locale: 'en'
        };

        // The inline run is already waiting on the gate; a redelivered copy joins it.
        const redelivered = runExportJob(job);
        release();
        await Promise.all([redelivered, settleInlineExports()]);

        expect(mockOutbox).toHaveLength(1);
        expect(await readdir(root)).toEqual([`${job.exportId}.json`]);
    });

    it('does nothing for a row that is gone or already settled', async () => {
        setPersonalDataSections(basicSections());
        const { user, result } = await requestFor();
        await settleInlineExports();
        mockOutbox.length = 0;
        const job = {
            exportId: result.data.id,
            userId: user.id,
            email: user.email,
            emailVerified: true,
            locale: 'en'
        };

        await expect(runExportJob(job)).resolves.toBe(true);
        await expect(runExportJob({ ...job, exportId: '0'.repeat(24) })).resolves.toBe(true);

        expect(mockOutbox).toEqual([]);
    });

    it('deletes its own file when the row was replaced while it ran', async () => {
        const { held, release } = gate();
        setPersonalDataSections([held]);
        const user = await createUser({ email: 'ada@example.com' });
        const first = await requestExport(user.id, user.email, testCallerContext);
        // The row goes away mid-build, as an erasure (or a replacement) would do it.
        await accountExportModel.deleteOne({ userId: user.id });

        release();
        await settleInlineExports();

        expect(await readdir(root)).toEqual([]);
        expect(mockOutbox).toEqual([]);
        expect(first.success).toBe(true);
    });
});

describe('openOwnExport', () => {
    it('streams a ready export to its owner and records the download', async () => {
        setPersonalDataSections(basicSections());
        const { user, result } = await requestFor();
        await settleInlineExports();

        const body = await downloadOf(user.id, result.data.id);

        expect(JSON.parse(body ?? '')).toHaveProperty('profile');
        expect(mockAudit).toContainEqual(
            expect.objectContaining({
                action: 'auth.data_export.downloaded',
                target_id: result.data.id
            })
        );
    });

    it('answers nothing for another account’s export', async () => {
        setPersonalDataSections(basicSections());
        const { result } = await requestFor();
        await settleInlineExports();
        const stranger = await createUser({ email: 'stranger@example.com' });

        await expect(downloadOf(stranger.id, result.data.id)).resolves.toBeUndefined();
    });

    it('answers nothing for an export still building', async () => {
        const { held, release } = gate();
        setPersonalDataSections([held]);
        const user = await createUser({ email: 'ada@example.com' });
        const requested = await requestExport(user.id, user.email, testCallerContext);

        await expect(downloadOf(user.id, String(requested.data?.id))).resolves.toBeUndefined();

        release();
        await settleInlineExports();
    });

    it('answers nothing for a failed one, one past its retention, or one whose file is gone', async () => {
        setPersonalDataSections(basicSections());
        const { user, result } = await requestFor();
        await settleInlineExports();

        await accountExportModel.updateOne({ userId: user.id }, { $set: { status: 'failed' } });
        await expect(downloadOf(user.id, result.data.id)).resolves.toBeUndefined();

        await accountExportModel.updateOne(
            { userId: user.id },
            { $set: { status: 'ready', expiresAt: new Date(Date.now() - 1000) } }
        );
        await expect(downloadOf(user.id, result.data.id)).resolves.toBeUndefined();

        await accountExportModel.updateOne(
            { userId: user.id },
            { $set: { expiresAt: new Date(Date.now() + 60_000) } }
        );
        await rm(path.join(root, `${result.data.id}.json`));
        await expect(downloadOf(user.id, result.data.id)).resolves.toBeUndefined();
    });
});

describe('erasing the account', () => {
    it('takes the export row and the file with it', async () => {
        setPersonalDataSections(basicSections());
        const { user, result } = await requestFor();
        await settleInlineExports();
        // The real section list again: erasure resolves its hooks from the registered modules.
        setPersonalDataSections(originalSections);
        const stored = await userService.getById(user.id);

        const removed = await userService.remove(stored!, true);

        expect(removed.success).toBe(true);
        await expect(accountExportRepository.findById(result.data.id)).resolves.toBeNull();
        expect(await readdir(root)).toEqual([]);
    });
});

describe('reapExpiredExports', () => {
    it('deletes the file and the row of an export past its deadline, and keeps the rest', async () => {
        const due = await exportDueIn('due@example.com', -1000);
        const live = await exportDueIn('live@example.com', 60_000);

        const reaped = await reapExpiredExports();

        expect(reaped.rows).toBe(1);
        await expect(accountExportRepository.findById(due.id)).resolves.toBeNull();
        await expect(accountExportRepository.findById(live.id)).resolves.not.toBeNull();
        expect(await readdir(root)).toEqual([`${live.id}.json`]);
    });

    it('also removes a file no row points at once it is older than the retention', async () => {
        const stray = path.join(root, 'orphan.json');
        await writeFile(stray, '{}');
        const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        await utimes(stray, eightDaysAgo, eightDaysAgo);
        await writeFile(path.join(root, 'fresh.json'), '{}');

        const reaped = await reapExpiredExports();

        expect(reaped.files).toBe(1);
        expect(await readdir(root)).toEqual(['fresh.json']);
    });

    it('does nothing when nothing is due', async () => {
        await expect(reapExpiredExports()).resolves.toEqual({ rows: 0, files: 0 });
    });
});
