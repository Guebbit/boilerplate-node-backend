/**
 * Erase again the accounts the erasure ledger names — `npm run ops:reapply-erasures -- --since <time>`.
 *
 * Why: a restore of an older snapshot brings back accounts that were erased after it. The ledger
 * (`erasureledgers`) outlives the oldest backup, so it still knows them.
 *
 * Run by a person, never on a schedule, on the RESTORED database with the app and cron STOPPED,
 * before the stack starts. The ledger in that database must be the live one or the newest
 * snapshot's, never the restored copy: docs/tools/backups.md#erasures-after-a-restore.
 *
 * Flags:
 *   --since <ISO time>   the snapshot's time (required); ledger rows from then on are replayed
 *   --snapshot <id>      the restic snapshot restored, for the restoration log
 *   --by <name>          who restored, for the restoration log (default: the OS user)
 *
 * Safe to repeat: an account already erased is skipped, and a failure is retried by running again.
 * Exits non-zero when any account could not be erased.
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { stopQueue } from '@infrastructure/adapters/queue';
import { logger } from '@infrastructure/adapters/logger';
import { bootI18n } from '@infrastructure/i18n';
import { settleOutboxNudges } from '@kernel/outbox';
import { registerModules } from '@kernel/registry';
import { enabledModules, enabledModuleDirectories } from '../../src/modules';
import {
    countsOf,
    reapplyErasures,
    type ReapplyReport
} from '../../src/modules/account/services/erasure-ledger';
import { runScript } from '../run-script';
import { flagValue } from '../cli';

/**
 * The `--since` time, or a thrown usage error. An unreadable date must stop the run: guessing one
 * would replay the wrong window of erasures.
 */
const requiredSince = (): Date => {
    const value = flagValue('since');
    const since = value ? new Date(value) : undefined;
    if (!since || Number.isNaN(since.getTime()))
        throw new Error(
            'Missing or unreadable --since <ISO time>, e.g. --since 2026-05-01T00:00:00Z'
        );
    return since;
};

/**
 * Let the restoration-log row reach Mongo before the connection closes: the audit sink is
 * fire-and-forget by contract and hands back nothing to await. The audit LOG line is written
 * synchronously and is the authoritative record either way.
 *
 * @param report - passed through
 */
const drainAuditSink = (report: ReapplyReport): Promise<ReapplyReport> =>
    new Promise((resolve) => {
        setTimeout(() => resolve(report), 1000);
    });

/**
 * Connect, replay the ledger and report. The modules are registered so the real erasure cascade
 * runs (every module's erase hook), exactly as the scheduled purge runs it.
 *
 * @returns what the replay did
 */
const replay = (since: Date): Promise<ReapplyReport> => {
    registerModules(enabledModules);
    return startJob()
        .then(() => bootI18n(enabledModuleDirectories('locales')))
        .then(() =>
            reapplyErasures({ since, by: flagValue('by'), snapshot: flagValue('snapshot') })
        )
        .then((report) => settleOutboxNudges().then(() => report))
        .then(drainAuditSink);
};

/** Check the guard, replay, log the counts, and fail the exit code when any erasure failed. */
const main = (): Promise<void> => {
    const since = requiredSince();
    return replay(since).then((report) => {
        // Counts for the headline, then every id: the audit log lost the rows written after the snapshot.
        logger.info({
            message: 'Erasures reapplied.',
            since: since.toISOString(),
            ...countsOf(report)
        });
        logger.info({ message: 'Accounts by outcome.', ...report });
        if (report.failed.length > 0) process.exitCode = 1;
    });
};

// Entry point: no job name, because this is run by hand after a restore, never on a schedule.
// See `scripts/run-script.ts`.
// eslint-disable-next-line @typescript-eslint/no-floating-promises -- runScript never rejects (failure is reported via process.exitCode)
void runScript(undefined, main, () => Promise.all([stopDatabase(), stopQueue()]));
