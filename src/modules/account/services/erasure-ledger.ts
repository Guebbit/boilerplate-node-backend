/**
 * @module
 * The erasure ledger: who was erased, and when, kept longer than the oldest backup. A restore of
 * an old snapshot brings erased accounts back; the ledger is what lets `ops:reapply-erasures`
 * erase them again before the app opens.
 *
 * Owns:  the `erasureledgers` rows and the replay that restores erasures and deletion locks.
 * Why:   the `auditlogs` trail (180 days) and Loki (7 days) are shorter than the backups.
 *
 * @see docs/understand/data-retention.md#backups-and-erasure
 */

import os from 'node:os';
import type { ClientSession } from 'mongoose';
import { settleOutboxNudges } from '@kernel/outbox';
import type { PersonalDataSubject } from '@kernel/registry';
import type { CallerContext } from '@types';
import { systemCallerContext } from '@kernel/permissions';
import { accountUserService } from '@modules/users/friends/account';
import { logger } from '@infrastructure/adapters/logger';
import { recordAudit } from '@infrastructure/observability/audit';
import { extractErrorMessage } from '@guebbit/js-toolkit';
import { accountAuditActions } from '../audit';
import { erasureLedgerRetentionMs } from '../config';
import { erasureLedgerRepository, type ErasureLedgerRow } from '../repository';
import type { ErasureLedgerKind } from '../model';

/**
 * Write one ledger row, expiring `retention` after the event it records.
 *
 * @param userId - the account
 * @param kind - what happened to it
 * @param at - when it happened
 * @param options - `session` for the erasure's transaction; `purgeAt` for a `scheduled` row
 */
const writeRow = (
    userId: string,
    kind: ErasureLedgerKind,
    at: Date,
    options: { session?: ClientSession | undefined; purgeAt?: Date } = {}
): Promise<void> =>
    erasureLedgerRepository.upsert(
        userId,
        kind,
        at,
        new Date(at.getTime() + erasureLedgerRetentionMs()),
        options
    );

/**
 * The `personalData.erase` hook: note the erasure inside the transaction that performs it, so the
 * ledger has the row exactly when the account is gone. A rollback takes the row with it.
 *
 * @param subject - the account being erased; `erasedAt` is set only on a repeat after a restore
 * @param session - the erasure's transaction
 */
export const recordErasure = (
    subject: PersonalDataSubject,
    session: ClientSession
): Promise<void> =>
    writeRow(subject.userId, 'erased', subject.erasedAt ?? new Date(), {
        session
    });

/**
 * Note that the owner scheduled a deletion, with the date they were promised, so a restore of an
 * older snapshot can lock the account again instead of forgetting the request.
 *
 * Joins the lock's own transaction and rejects with it: a schedule the ledger never heard of
 * would be forgotten by a restore, so the two commit together or not at all.
 *
 * @param userId - the locked account
 * @param requestedAt - when the owner asked
 * @param purgeAt - when the erasure falls due; stored, so a changed grace setting cannot move it
 * @param session - the lock's transaction
 */
export const recordSchedule = (
    userId: string,
    requestedAt: Date,
    purgeAt: Date,
    session?: ClientSession
): Promise<void> => writeRow(userId, 'scheduled', requestedAt, { purgeAt, session });

/**
 * Note that a scheduled deletion was canceled, so a restored snapshot that still shows the
 * account as scheduled is unlocked instead of purged.
 *
 * Joins the cancel's transaction where there is one (the owner's link and sign-in). A staff
 * cancel reaches here from the outbox handler, which retries a rejection until it lands.
 *
 * @param userId - the restored account
 * @param canceledAt - when it was canceled, not when this runs
 * @param session - the cancel's transaction, when there is one
 */
export const recordCancellation = (
    userId: string,
    canceledAt: Date,
    session?: ClientSession
): Promise<void> => writeRow(userId, 'canceled', canceledAt, { session });

/** What `ops:reapply-erasures` was asked, besides the time. */
export interface ReapplyOptions {
    /** The snapshot time the restore went back to: ledger rows at or after it are replayed. */
    since: Date;
    /** Who restored, for the restoration log. Defaults to the operating-system user. */
    by?: string;
    /** Which snapshot was restored, for the restoration log. */
    snapshot?: string;
}

/** The ways one account can end up after a replay. */
type ReapplyBucket =
    'erased' | 'alreadyGone' | 'rescheduled' | 'unscheduled' | 'unchanged' | 'failed';

/**
 * What one run did: the ids of the accounts in each bucket, since the restored audit log lost the
 * rows written after the snapshot and an operator has nothing else to check against. Every
 * account the ledger names since `since` lands in exactly one bucket.
 *
 * - `erased`:      the restore had brought it back; now erased again.
 * - `alreadyGone`: the restored database does not hold it (the snapshot predates it, or it is already erased).
 * - `rescheduled`: locked again at the stored `purgeAt` (the owner asked after the snapshot).
 * - `unscheduled`: unlocked (the owner canceled after the snapshot).
 * - `unchanged`:   its lock already matched the ledger.
 * - `failed`:      the write threw; a rerun retries it. An account whose held-jobs sweep threw is listed
 *                   here too (as well as under `erased`): a rerun cannot redo that sweep, so restore again.
 *
 * `heldJobsRemoved` is separate: the ids of the held jobs the final pass deleted. Ids, never the
 * addresses they were found by.
 */
export interface ReapplyReport extends Record<ReapplyBucket, string[]> {
    heldJobsRemoved: string[];
}

/** The ledger rows of one account since the snapshot, by kind. */
type RowsByKind = Partial<Record<ErasureLedgerKind, ErasureLedgerRow>>;

/**
 * The ledger rows since the snapshot, grouped by account, one row per kind.
 *
 * @param rows - the rows, oldest first
 */
const groupByUser = (rows: readonly ErasureLedgerRow[]): Map<string, RowsByKind> => {
    const byUser = new Map<string, RowsByKind>();
    for (const row of rows) {
        const key = String(row.userId);
        byUser.set(key, { ...byUser.get(key), [row.kind]: row });
    }
    return byUser;
};

/** How one account ended, and for an erased one the addresses its held jobs are found by. */
interface ReapplyOutcome {
    bucket: ReapplyBucket;
    addresses: string[];
}

/**
 * Bring one account back to what the ledger says. `erased` beats everything; otherwise the later
 * of `scheduled` and `canceled` wins (cancel, then ask again, stays scheduled).
 *
 * @param userId - the account
 * @param rows - its ledger rows since the snapshot
 * @param context - the operator's system context
 */
const reapplyOne = (
    userId: string,
    rows: RowsByKind,
    context: CallerContext
): Promise<ReapplyOutcome> => {
    if (rows.erased)
        return accountUserService
            .eraseAgain(userId, rows.erased.at, context)
            .then((result) =>
                result === null
                    ? { bucket: 'alreadyGone', addresses: [] }
                    : { bucket: 'erased', addresses: result.addresses }
            );

    const { scheduled, canceled } = rows;
    const schedule =
        scheduled?.purgeAt && (!canceled || scheduled.at > canceled.at)
            ? { requestedAt: scheduled.at, purgeAt: scheduled.purgeAt }
            : null;
    return accountUserService.restoreDeletionState(userId, schedule, context).then((changed) => {
        if (changed === null) return { bucket: 'alreadyGone', addresses: [] };
        if (!changed) return { bucket: 'unchanged', addresses: [] };
        return { bucket: schedule ? 'rescheduled' : 'unscheduled', addresses: [] };
    });
};

/**
 * Replay the ledger on a restored database: erase again every account it says was erased since
 * `since`, keeping the original date; lock or unlock the others as their latest schedule or
 * cancel says; sweep the held jobs naming an erased account; then write the restoration-log
 * audit row.
 *
 * The sweep runs last because step 4 itself re-sends every restored pending outbox row, and a
 * handler may hold a new mail job for an address that was just erased. So it waits for the outbox
 * to settle first.
 *
 * Idempotent: a second run finds every account already in its ledger state. One account failing
 * is counted and logged, and the rest go on.
 *
 * @param options - the snapshot time and the restoration-log fields
 */
export const reapplyErasures = async (options: ReapplyOptions): Promise<ReapplyReport> => {
    const context = systemCallerContext('User');
    const report: ReapplyReport = {
        erased: [],
        alreadyGone: [],
        rescheduled: [],
        unscheduled: [],
        unchanged: [],
        failed: [],
        heldJobsRemoved: []
    };
    const addressesByUser = new Map<string, string[]>();
    const rows = await erasureLedgerRepository.findSince(options.since);

    for (const [userId, userRows] of groupByUser(rows)) {
        const { bucket, addresses } = await reapplyOne(userId, userRows, context).catch(
            (error: unknown) => {
                logger.error({
                    message: 'Reapplying the ledger failed.',
                    userId,
                    error: extractErrorMessage(error, String(error))
                });
                return { bucket: 'failed' as const, addresses: [] };
            }
        );
        report[bucket].push(userId);
        if (addresses.length > 0) addressesByUser.set(userId, addresses);
    }

    await settleOutboxNudges();
    for (const [userId, addresses] of addressesByUser) {
        // A failed sweep fails the run, but the restoration-log row below is still written.
        const removed = await accountUserService
            .purgeHeldJobsOf(addresses)
            .catch((error: unknown) => {
                logger.error({
                    message: 'Sweeping the held jobs of an erased account failed.',
                    userId,
                    error: extractErrorMessage(error, String(error))
                });
                report.failed.push(userId);
                return [];
            });
        report.heldJobsRemoved.push(...removed);
    }

    recordAudit(context, {
        action: accountAuditActions.AUTH_ERASURES_REAPPLIED,
        outcome: report.failed.length === 0 ? 'success' : 'failure',
        metadata: {
            by: options.by ?? os.userInfo().username,
            snapshot: options.snapshot ?? 'unspecified',
            since: options.since.toISOString(),
            ...report
        }
    });
    return report;
};

/**
 * The report as counts, for a log line that stays readable when the lists are long.
 *
 * @param report - what {@link reapplyErasures} returned
 */
export const countsOf = (report: ReapplyReport): Record<keyof ReapplyReport, number> => ({
    erased: report.erased.length,
    alreadyGone: report.alreadyGone.length,
    rescheduled: report.rescheduled.length,
    unscheduled: report.unscheduled.length,
    unchanged: report.unchanged.length,
    failed: report.failed.length,
    heldJobsRemoved: report.heldJobsRemoved.length
});
