/**
 * @module
 * The erasure ledger: who was erased, and when, kept longer than the oldest backup. A restore of
 * an old snapshot brings erased accounts back; the ledger is what lets `ops:reapply-erasures`
 * erase them again before the app opens.
 *
 * Owns:  the `erasureledgers` rows and the replay that restores erasures and deletion locks.
 * Why:   the `auditlogs` trail (90 days) and Loki (7 days) are shorter than the backups.
 *
 * See: docs/theory/data-retention.md#backups-and-erasure
 */

import os from 'node:os';
import type { ClientSession } from 'mongoose';
import type { PersonalDataSubject } from '@kernel/registry';
import type { CallerContext } from '@types';
import { systemCallerContext } from '@kernel/permissions';
import { userService } from '@modules/users';
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
    options: { session?: ClientSession; purgeAt?: Date } = {}
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
 * Log a ledger write that failed after the thing it records already happened. Never rethrown: a
 * ledger hiccup must not undo or fail a schedule or a cancel. A missed row costs a stale lock on
 * a restored account, never a wrong erasure.
 *
 * @param message - what was being noted
 * @param userId - the account
 */
const logLedgerFailure =
    (message: string, userId: string) =>
    (error: unknown): void => {
        logger.error({ message, userId, error: extractErrorMessage(error, String(error)) });
    };

/**
 * Note that the owner scheduled a deletion, with the date they were promised, so a restore of an
 * older snapshot can lock the account again instead of forgetting the request.
 *
 * Never rejects (see {@link logLedgerFailure}).
 *
 * @param userId - the locked account
 * @param requestedAt - when the owner asked
 * @param purgeAt - when the erasure falls due; stored, so a changed grace setting cannot move it
 */
export const recordSchedule = (userId: string, requestedAt: Date, purgeAt: Date): Promise<void> =>
    writeRow(userId, 'scheduled', requestedAt, { purgeAt }).catch(
        logLedgerFailure('Could not note a scheduled deletion in the erasure ledger.', userId)
    );

/**
 * Note that a scheduled deletion was cancelled, so a restored snapshot that still shows the
 * account as scheduled can be unlocked. Never rejects (see {@link logLedgerFailure}).
 *
 * @param userId - the restored account
 */
export const recordCancellation = (userId: string): Promise<void> =>
    writeRow(userId, 'cancelled', new Date()).catch(
        logLedgerFailure('Could not note a cancelled deletion in the erasure ledger.', userId)
    );

/** What `ops:reapply-erasures` was asked, besides the time. */
export interface ReapplyOptions {
    /** The snapshot time the restore went back to: ledger rows at or after it are replayed. */
    since: Date;
    /** Who restored, for the restoration log. Defaults to the operating-system user. */
    by?: string;
    /** Which snapshot was restored, for the restoration log. */
    snapshot?: string;
}

/** What one run did. Every account the ledger names since `since` lands in exactly one count. */
export interface ReapplyReport {
    /** Accounts the restore had brought back, now erased again. */
    erased: number;
    /** Accounts the restored database does not hold (the snapshot predates them, or already erased). */
    alreadyGone: number;
    /** Accounts locked again at the stored `purgeAt`: the owner asked after the snapshot. */
    rescheduled: number;
    /** Accounts unlocked: the owner cancelled after the snapshot. */
    unscheduled: number;
    /** Accounts whose lock already matched the ledger, or whose latest event left nothing to do. */
    unchanged: number;
    /** Accounts whose erasure or lock write threw; a rerun retries them. */
    failed: number;
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

/**
 * Bring one account back to what the ledger says. `erased` beats everything; otherwise the later
 * of `scheduled` and `cancelled` wins (cancel, then ask again, stays scheduled).
 *
 * @param userId - the account
 * @param rows - its ledger rows since the snapshot
 * @param context - the operator's system context
 */
const reapplyOne = (
    userId: string,
    rows: RowsByKind,
    context: CallerContext
): Promise<keyof ReapplyReport> => {
    if (rows.erased)
        return userService
            .eraseAgain(userId, rows.erased.at, context)
            .then((result) => (result === null ? 'alreadyGone' : 'erased'));

    const { scheduled, cancelled } = rows;
    const schedule =
        scheduled?.purgeAt && (!cancelled || scheduled.at > cancelled.at)
            ? { requestedAt: scheduled.at, purgeAt: scheduled.purgeAt }
            : null;
    return userService.restoreDeletionState(userId, schedule).then((changed) => {
        if (changed === null) return 'alreadyGone';
        if (!changed) return 'unchanged';
        return schedule ? 'rescheduled' : 'unscheduled';
    });
};

/**
 * Replay the ledger on a restored database: erase again every account it says was erased since
 * `since`, keeping the original date; lock or unlock the others as their latest schedule or
 * cancel says; then write the restoration-log audit row.
 *
 * Idempotent: a second run finds every account already in its ledger state. One account failing
 * is counted and logged, and the rest go on.
 *
 * @param options - the snapshot time and the restoration-log fields
 */
export const reapplyErasures = async (options: ReapplyOptions): Promise<ReapplyReport> => {
    const context = systemCallerContext('User');
    const report: ReapplyReport = {
        erased: 0,
        alreadyGone: 0,
        rescheduled: 0,
        unscheduled: 0,
        unchanged: 0,
        failed: 0
    };
    const rows = await erasureLedgerRepository.findSince(options.since);

    for (const [userId, userRows] of groupByUser(rows)) {
        const outcome = await reapplyOne(userId, userRows, context).catch((error: unknown) => {
            logger.error({
                message: 'Reapplying the ledger failed.',
                userId,
                error: extractErrorMessage(error, String(error))
            });
            return 'failed' as const;
        });
        report[outcome] += 1;
    }

    recordAudit(context, {
        action: accountAuditActions.AUTH_ERASURES_REAPPLIED,
        outcome: report.failed === 0 ? 'success' : 'failure',
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
 * Whether something answers HTTP at the app's address. The one guard on the command: a repeat
 * erasure racing live traffic breaks consistency (a cart, an order, a session written
 * mid-cascade). Any answer counts; only a refused or silent connection means the app is down.
 *
 * @param appUrl - where the app would listen, e.g. `http://127.0.0.1:3000`
 */
export const appIsAnswering = (appUrl: string): Promise<boolean> =>
    // Node's global fetch (https://nodejs.org/api/globals.html#fetch): resolves on ANY HTTP
    // status, rejects on a refused connection. The 2 s abort covers a silent one.
    fetch(new URL('/livez', appUrl), { signal: AbortSignal.timeout(2000) }).then(
        () => true,
        () => false
    );
