/*
 * Entry-point wrapper for the one-shot scripts in `db/` and `ops/`. Four things a bare promise chain does
 * not give them:
 *
 *   - A NON-ZERO EXIT CODE on failure, so CI and shell `&&` chains notice. An unhandled
 *     rejection does exit non-zero, but only via a deprecation-warning path, and it prints the
 *     raw rejection rather than anything the script chose to say.
 *   - CLEANUP ON THE FAILURE PATH. Closing the Mongo/Redis handles as the last statement of the
 *     happy path means a throw skips it, and the process hangs on an open socket.
 *   - A READABLE ERROR, logged through the same logger as everything else.
 *   - AN OUTCOME `GET /observability/health` and `job_last_success_timestamp_seconds` can see —
 *     every crontab line (`docker/crontab`) goes through this one function, and passes its own
 *     npm script name so this records it. `reap:inactive-accounts` is the one exception: it
 *     passes `undefined` and records through its own `withLease` document instead, since that is
 *     where its "exactly one runner" guarantee already lives.
 *
 * `process.exitCode` rather than `process.exit()`: setting the code lets Node drain stdout and
 * finish pending handles, where `exit()` truncates in-flight log writes.
 */
import { logger } from '@infrastructure/adapters/logger';
import { recordJobOutcome } from '@infrastructure/persistence/lease';

/**
 * Run a script body to completion, then always clean up.
 *
 * @param name    - this job's identity, the same string across every run — the npm script name
 *                  (`reap:orders`), so it reads the same in `docker/crontab`,
 *                  `job_last_success_timestamp_seconds{job="…"}` and an operator's own shell
 *                  history. `undefined` for a one-off `db:*`/`access:*` setup script: it has no
 *                  scheduled interval to alert on, and `db:cache:clear` never opens Mongo at all,
 *                  so writing a lease row for it would fail outright
 * @param main    - the script's work; throwing marks the run as failed
 * @param cleanup - close whatever `main` opened. Runs on both the success and failure paths.
 *                  Required, not defaulted: every script here opens a connection, and a silent
 *                  no-op default is how one of them would quietly stop closing it
 * @returns a promise that always resolves — failure is reported via `process.exitCode`, so
 *          callers do not need their own `.catch`
 */
export const runScript = async (
    name: string | undefined,
    main: () => Promise<void>,
    cleanup: () => Promise<unknown>
): Promise<void> => {
    try {
        await main();
        if (name) await recordJobOutcome(name, { failed: false });
    } catch (error: unknown) {
        logger.error({
            message: 'Script failed.',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        process.exitCode = 1;
        if (name) await recordJobOutcome(name, { failed: true, error });
    } finally {
        try {
            await cleanup();
        } catch (error: unknown) {
            /*
             * A cleanup failure is not a job failure: the work either happened or it did not,
             * and that verdict is already recorded above. Log it and leave `exitCode` alone —
             * a failed `quit()` on an already-dead socket must not turn a successful run red.
             */
            logger.warn({
                message: 'Script cleanup failed.',
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
};
