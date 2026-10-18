/**
 * @module
 * `POST /account/export` and `GET /account/export/{id}` — "give me my data" (Art. 15, 20), as a job
 * rather than a request: asking records a row and queues the build, the worker (`./export-job.ts`)
 * writes the file, and a mailed link downloads it. Its own file, beside the other
 * account services: it is neither proving identity (that's `requireFreshAuth`'s job, mounted on
 * both routes) nor changing the account.
 *
 * One live export per account. A `building` one is returned as it is; a `ready` or `failed` one is
 * REPLACED by a new request, its file and row deleted first. The nightly `reap:account-exports`
 * (`./export-rows.ts`) deletes what has passed `NODE_ACCOUNT_EXPORT_TTL_DAYS`, and a hard account
 * delete takes the row and the file with the rest of the account (`eraseExports`).
 *
 * Every section comes from the OWNING module's own `collect`, never a repository or model type
 * reached around it — see `kernel/registry.ts`'s `PersonalDataSection` and
 * `./personal-data-registry.ts` for how the list gets here without this module importing every
 * sibling that contributes to it.
 *
 * See: docs/modules/account.md#data-export
 */

import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import type { Readable } from 'node:stream';
import { generateSuccess } from '@infrastructure/http/response';
import type { ResponseSuccess, ResponseReject } from '@infrastructure/http/response';
import { logger } from '@infrastructure/adapters/logger';
import { openExport, removeExport } from '@infrastructure/adapters/export-store';
import { publishToQueue } from '@infrastructure/adapters/queue';
import { settleWithin } from '@infrastructure/runtime/settle';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import { recordAudit } from '@infrastructure/observability/audit';
import { t } from '@infrastructure/i18n';
import { userService } from '@modules/users';
import { withOwnAccount } from './caller';
import { WORKER_CHANNELS } from '@types';
import type { AccountExportJobPayload, CallerContext } from '@types';
import type { AfterErase } from '@kernel/registry';
import { exportRetentionMs } from '../config';
import { recipientLocale } from '../emails';
import { accountAuditActions } from '../audit';
import { accountExportRepository, type AccountExportRow } from '../repository';
import { mailRecipientRefusal } from '../mail-budget';
import { runExportJob } from './export-job';
import { removeRow } from './export-rows';

/**
 * How long a `building` row is waited on. Past it the row counts as `failed`, so a build that died
 * with its process (no broker redelivers an inline job) cannot hold the account's one slot for
 * ever. The build itself is not killed at the limit: a late finish finds its row gone and deletes
 * its own file.
 */
const EXPORT_BUILD_LIMIT_MS = 30 * 60 * 1000;

/** What `POST /account/export` answers, and what a request resolves to. */
export interface AccountExportRequestResult {
    id: string;
    status: AccountExportRow['status'];
}

/**
 * Builds running in this process because no broker took the job. Only tests wait for them: a
 * deploy that cuts one off leaves its row `building` until {@link EXPORT_BUILD_LIMIT_MS} calls it
 * failed, and the person may then ask again.
 */
const inlineBuilds = new Set<Promise<unknown>>();

/** The longest {@link settleInlineExports} waits for the builds still running. */
const SETTLE_CEILING_MS = 30_000;

/** Wait for the builds running in this process, for a test that must see one finish. */
export const settleInlineExports = (): Promise<void> =>
    settleWithin(inlineBuilds, SETTLE_CEILING_MS);

/**
 * Whether a `building` row has waited past {@link EXPORT_BUILD_LIMIT_MS}.
 *
 * @param row - the row
 */
const isStale = (row: AccountExportRow): boolean =>
    Date.now() - row.createdAt.getTime() > EXPORT_BUILD_LIMIT_MS;

/**
 * Insert a fresh `building` row. When two requests race, the unique index lets one win and the
 * other gets that winner back instead of an error.
 *
 * @param userId - the account asking
 * @returns the row to answer with, and whether it is new (and so needs a job)
 */
const insertRow = (userId: string): Promise<ExportRowChoice> => {
    const _id = new Types.ObjectId();
    const now = new Date();
    const row: AccountExportRow = {
        _id,
        userId: new Types.ObjectId(userId),
        status: 'building',
        file: `${String(_id)}.json`,
        createdAt: now,
        expiresAt: new Date(now.getTime() + exportRetentionMs())
    };

    return accountExportRepository.insert(row).then(
        () => ({ row, created: true }),
        (error: unknown) => {
            if (!isDuplicateKey(error)) throw error;
            return accountExportRepository.findByUserId(userId).then((winner) => {
                // The winner vanished between the two reads (erased): treat it as a plain failure.
                if (!winner) throw error;
                return { row: winner, created: false };
            });
        }
    );
};

/**
 * Hand a job to the broker, or run it here after the response when none takes it.
 *
 * @param job - the queue message
 */
const dispatch = (job: AccountExportJobPayload): Promise<void> =>
    publishToQueue<AccountExportJobPayload>({
        queue: WORKER_CHANNELS.ACCOUNT_EXPORT,
        payload: job
    }).then((published) => {
        if (published) return;

        // Not awaited: the caller is told "queued" now, and the build outlives the response. Tracked
        // so shutdown and tests can wait for it; the catch keeps a rejection from going unhandled.
        const running = runExportJob(job)
            .catch((error: unknown) => {
                logger.error({
                    message: 'account export (inline) failed',
                    exportId: job.exportId,
                    error
                });
            })
            .finally(() => inlineBuilds.delete(running));
        inlineBuilds.add(running);
    });

/** A row to answer a request with, and whether it is new (and so needs a job). */
interface ExportRowChoice {
    row: AccountExportRow;
    created: boolean;
}

/**
 * The row to answer a request with, or the 429 that refuses it. A `building` row that has not gone
 * stale is answered as it is, uncharged. Anything else means a NEW build, which costs one mail from
 * the mailbox budget because the build ends in a mailed link. The budget is asked BEFORE the old
 * export is deleted, so a refused request leaves the ready one downloadable.
 *
 * @param userId - the account asking
 * @param email - the mailbox the finished export's link goes to, charged for a new build
 * @param context - who asked; a refusal is counted against them
 * @returns the row and whether it is new, or the budget's refusal
 */
const rowOrRefusal = (
    userId: string,
    email: string,
    context: CallerContext
): Promise<ExportRowChoice | ResponseReject> =>
    accountExportRepository.findByUserId(userId).then((existing) => {
        if (existing?.status === 'building' && !isStale(existing)) {
            return { row: existing, created: false };
        }

        return mailRecipientRefusal(email, context).then(
            (refusal) =>
                refusal ??
                (existing ? removeRow(existing) : Promise.resolve()).then(() => insertRow(userId))
        );
    });

/**
 * Whether a request resolved to a row rather than to the budget's refusal.
 *
 * @param outcome - what {@link rowOrRefusal} resolved to
 */
const isRow = (outcome: ExportRowChoice | ResponseReject): outcome is ExportRowChoice =>
    'row' in outcome;

/**
 * Ask for the caller's own data. Answers at once; the file is built in the background and a link
 * is mailed when it is ready.
 *
 * @param userId - the authenticated caller's own id; this never reads anyone else's data
 * @param context - for the audit event this call itself is, and the request's language
 * @returns `202` with the export's `id` and `status`, `401` when the account is gone, or `429`
 *   when a new build would exceed the mailbox budget
 */
export const requestExport = (
    userId: string,
    context: CallerContext
): Promise<ResponseSuccess<AccountExportRequestResult> | ResponseReject> =>
    withOwnAccount(
        userId,
        (user) =>
            rowOrRefusal(userId, user.email, context).then((outcome) => {
                if (!isRow(outcome)) return outcome;
                const { row, created } = outcome;

                recordAudit(context, {
                    action: accountAuditActions.AUTH_DATA_EXPORT_REQUESTED,
                    outcome: 'success',
                    targetType: 'account_export',
                    targetId: String(row._id),
                    ...(created ? {} : { metadata: { reused: true } })
                });

                // `email` is the key the `feedback` section matches by, handed to the job together
                // with whether the account has proved it, since an unproven address is anyone's.
                const job: AccountExportJobPayload = {
                    exportId: String(row._id),
                    userId,
                    email: user.email,
                    emailVerified: Boolean(user.verifiedAt),
                    locale: recipientLocale(user.locale, context)
                };

                return (created ? dispatch(job) : Promise.resolve()).then(() =>
                    generateSuccess<AccountExportRequestResult>(
                        { id: String(row._id), status: row.status },
                        202,
                        t('account.export.requested')
                    )
                );
            }),
        // No credentials needed: the export reads the profile, never a secret.
        userService.getById
    );

/**
 * Open the caller's finished export for download. The ownership check is the query, so another
 * account's export, a `building` or `failed` one, one past its retention and one that is simply
 * gone are all the same `undefined`.
 *
 * @param userId - the authenticated caller
 * @param exportId - the export's id, already checked to be one of this backend's own
 * @param context - for the audit event: the moment the data actually leaves
 * @returns the file as a stream, or `undefined` when there is nothing to send
 */
export const openOwnExport = (
    userId: string,
    exportId: string,
    context: CallerContext
): Promise<Readable | undefined> =>
    accountExportRepository.findOwned(userId, exportId).then((row) => {
        if (row?.status !== 'ready' || row.expiresAt.getTime() <= Date.now()) return undefined;

        return openExport(row.file).then((stream) => {
            if (!stream) return undefined;

            recordAudit(context, {
                action: accountAuditActions.AUTH_DATA_EXPORT_DOWNLOADED,
                outcome: 'success',
                targetType: 'account_export',
                targetId: exportId
            });
            return stream;
        });
    });

/**
 * Delete the export an erased account owned — this module's `personalData.erase`. The row goes in
 * the erasure's transaction; the file is not a row and cannot roll back, so it goes in the
 * returned step, which runs only after a commit.
 *
 * @param userId - the account being erased
 * @param session - the erasure's transaction
 */
export const eraseExports = (userId: string, session: ClientSession): Promise<AfterErase> =>
    accountExportRepository
        .deleteByUserId(userId, session)
        .then(
            (files) => () =>
                Promise.all(files.map((file) => removeExport(file))).then(() => undefined)
        );
