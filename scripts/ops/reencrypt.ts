/**
 * Re-encrypt every stored secret onto the newest key of its ring — `npm run reencrypt`.
 *
 * Why: a key rotation prepends a new key and keeps the old one so old rows still decrypt. Nothing
 * else moves those rows, so without this the old key can never be dropped. Run it after the
 * rotation deploy, then drop the old entry (see docs/tools/security.md#database-credential-and-key-rotation).
 *
 * What: every enabled module's `reencrypt` walk (`AppModule.reencrypt`), so this file names no
 * module and a removed module takes its walk with it.
 * Safe to repeat: a value already on the newest key is not touched, so a second run writes nothing.
 *
 * `--dry-run` writes nothing and prints, per field, how many values sit on each key version.
 *
 * Not scheduled: a rotation is an event, not a cadence, so there is no `docker/crontab` line.
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import {
    emptyReport,
    mergeReports,
    type ReencryptReport
} from '@infrastructure/security/reencrypt';
import { enabledModules } from '../../src/modules';
import { runScript } from '../run-script';
import { hasFlag } from '../cli';

/** True when invoked with `--dry-run`. */
const dryRun = hasFlag('dry-run');

/** Every enabled module's walk, in registration order. */
const walks = enabledModules.flatMap((appModule) =>
    appModule.reencrypt ? [appModule.reencrypt] : []
);

/**
 * Runs the walks one after another, so two never contend for the same collection.
 *
 * @param remaining - the walks still to run
 * @param total - what the finished ones found and moved
 */
const runAll = (
    remaining: typeof walks,
    total: ReencryptReport = emptyReport()
): Promise<ReencryptReport> => {
    if (remaining.length === 0) return Promise.resolve(total);
    const [next, ...rest] = remaining;
    return next(dryRun).then((report) => runAll(rest, mergeReports(total, report)));
};

/** Connect, re-encrypt everything, and log the per-field, per-version counts. */
const main = (): Promise<void> =>
    startJob()
        .then(() => runAll(walks))
        .then((report) => {
            logger.info({ message: 'Re-encryption finished.', dryRun, ...report });
        });

// Entry point: no job name, because this is run by hand after a rotation, never on a schedule.
// See `scripts/run-script.ts`.
void runScript(undefined, main, stopDatabase);
