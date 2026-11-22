/**
 * Delete again, in Zammad, the customers erased since a Zammad dump — `npm run zammad:replay-erasures -- --since <time>`.
 *
 * Why: restoring Zammad alone from a dump brings back customers that were erased after it. Our
 * erase-job rows (`zammaderasejobs`) outlive the dump, so they still know the Zammad ids.
 *
 * Run by a person, never on a schedule, after the Zammad restore and before the channels are
 * restarted (the order is in the runbook). The database it runs against is OURS, the live one.
 *
 * Flags:
 *   --since <ISO time>   the dump's time (required); jobs completed from then on are replayed
 *   --snapshot <id>      the dump or snapshot restored, for the restoration log
 *   --by <name>          who restored, for the restoration log (default: the OS user)
 *
 * What it does: sets those jobs back to pending, runs one erase pass that files the deletion tasks
 * (a customer the restored Zammad does not hold counts as done), and writes a restoration-log
 * audit row. The scheduled `sweep:zammad-erasures` then follows the tasks to `completed`.
 * Safe to repeat: a job already pending is left alone, one already completed again is reopened.
 *
 * @see docs/operate/zammad.md#restore
 */
import os from 'node:os';
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { zammadService } from '../../src/modules/zammad';
import { runScript } from '../run-script';
import { flagValue } from '../cli';

/**
 * The `--since` time, or a thrown usage error. An unreadable date must stop the run: guessing one
 * would replay the wrong window of erasures.
 * @throws {Error} when `--since` is missing or unreadable
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
 * fire-and-forget and hands back nothing to await. The audit LOG line is written synchronously and
 * is the authoritative record either way.
 */
const drainAuditSink = (): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, 1000);
    });

/** Reopen the jobs, file their tasks once, and say how many there were. */
const main = (): Promise<void> => {
    const since = requiredSince();
    return startJob()
        .then(() =>
            zammadService.replayErasures({
                since,
                by: flagValue('by') ?? os.userInfo().username,
                snapshot: flagValue('snapshot')
            })
        )
        .then((reopened) =>
            zammadService.sweepErasures().then((handled) => {
                logger.info({
                    message: 'Zammad erasures replayed.',
                    since: since.toISOString(),
                    reopened,
                    handled
                });
            })
        )
        .then(drainAuditSink);
};

/**
 * Entry point: no job name, because this is run by hand after a restore, never on a schedule.
 * See `scripts/run-script.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-floating-promises -- runScript never rejects (failure is reported via process.exitCode)
void runScript(undefined, main, () => stopDatabase());
