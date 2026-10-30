/**
 * @module
 * The erasure ledger: who was erased, and when, kept longer than the oldest backup. A restore of
 * an old snapshot brings erased accounts back; the ledger is what lets `ops:reapply-erasures`
 * erase them again before the app opens.
 *
 * Owns:  the `erasureledgers` rows and the repeat erasure that replays them.
 * Why:   the `auditlogs` trail (90 days) and Loki (7 days) are shorter than the backups.
 *
 * See: docs/theory/data-retention.md#backups-and-erasure
 */

import os from 'node:os';
import type { ClientSession } from 'mongoose';
import type { PersonalDataSubject } from '@kernel/registry';
import { systemCallerContext } from '@kernel/permissions';
import { userService } from '@modules/users';
import { logger } from '@infrastructure/adapters/logger';
import { recordAudit } from '@infrastructure/observability/audit';
import { extractErrorMessage } from '@guebbit/js-toolkit';
import { accountAuditActions } from '../audit';
import { erasureLedgerRetentionMs } from '../config';
import { erasureLedgerRepository } from '../repository';
import type { ErasureLedgerKind } from '../model';

/**
 * Write one ledger row, expiring `retention` after the event it records.
 *
 * @param userId - the account
 * @param kind - what happened to it
 * @param at - when it happened
 * @param session - the erasure's transaction, when there is one
 */
const writeRow = (
    userId: string,
    kind: ErasureLedgerKind,
    at: Date,
    session?: ClientSession
): Promise<void> =>
    erasureLedgerRepository.upsert(
        userId,
        kind,
        at,
        new Date(at.getTime() + erasureLedgerRetentionMs()),
        session
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
): Promise<void> => writeRow(subject.userId, 'erased', subject.erasedAt ?? new Date(), session);

/**
 * Note that a scheduled deletion was cancelled, so a restored snapshot that still shows the
 * account as scheduled can be told apart from one the owner meant to delete.
 *
 * Never rejects: the cancellation has already happened and a ledger hiccup must not undo or
 * fail it. A missed row costs the operator a manual check after a restore, never a wrong erasure.
 *
 * @param userId - the restored account
 */
export const recordCancellation = (userId: string): Promise<void> =>
    writeRow(userId, 'cancelled', new Date()).catch((error: unknown) => {
        logger.error({
            message: 'Could not note a cancelled deletion in the erasure ledger.',
            userId,
            error: extractErrorMessage(error, String(error))
        });
    });

/** What `ops:reapply-erasures` was asked, besides the time. */
export interface ReapplyOptions {
    /** The snapshot time the restore went back to: ledger rows at or after it are replayed. */
    since: Date;
    /** Who restored, for the restoration log. Defaults to the operating-system user. */
    by?: string;
    /** Which snapshot was restored, for the restoration log. */
    snapshot?: string;
}

/** What one run did. Every ledger row since `since` lands in exactly one count. */
export interface ReapplyReport {
    /** Accounts the restore had brought back, now erased again. */
    erased: number;
    /** Accounts the restored database never held (the snapshot predates them) or already lacks. */
    alreadyGone: number;
    /** `cancelled` rows: left alone, listed so the operator can look at those accounts. */
    cancelledSeen: number;
    /** Accounts whose erasure threw; they stay in the ledger and a rerun retries them. */
    failed: number;
}

/**
 * Replay the ledger: erase again every account it says was erased at or after `since`, keeping
 * the original erasure date, then write the restoration-log audit row.
 *
 * Idempotent: an account already erased is `alreadyGone`, so a rerun after a failure only does
 * what is left. A `cancelled` row never erases anything; an account erased after a cancel has its
 * own `erased` row, which wins because only `erased` rows are replayed.
 *
 * @param options - the snapshot time and the restoration-log fields
 */
export const reapplyErasures = async (options: ReapplyOptions): Promise<ReapplyReport> => {
    const context = systemCallerContext('User');
    const report: ReapplyReport = { erased: 0, alreadyGone: 0, cancelledSeen: 0, failed: 0 };
    const rows = await erasureLedgerRepository.findSince(options.since);

    for (const row of rows) {
        if (row.kind === 'cancelled') {
            report.cancelledSeen += 1;
            continue;
        }
        const userId = String(row.userId);
        const outcome: 'erased' | 'alreadyGone' | 'failed' = await userService
            .eraseAgain(userId, row.at, context)
            .then((result) => (result === null ? 'alreadyGone' : 'erased'))
            .catch((error: unknown) => {
                logger.error({
                    message: 'Repeat erasure failed.',
                    userId,
                    error: extractErrorMessage(error, String(error))
                });
                return 'failed';
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
