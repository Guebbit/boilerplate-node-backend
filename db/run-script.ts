/*
 * Entry-point wrapper for the one-shot scripts in `db/` and `ops/`. Three things a bare promise chain does
 * not give them:
 *
 *   - A NON-ZERO EXIT CODE on failure, so CI and shell `&&` chains notice. An unhandled
 *     rejection does exit non-zero, but only via a deprecation-warning path, and it prints the
 *     raw rejection rather than anything the script chose to say.
 *   - CLEANUP ON THE FAILURE PATH. Closing the Mongo/Redis handles as the last statement of the
 *     happy path means a throw skips it, and the process hangs on an open socket.
 *   - A READABLE ERROR, logged through the same logger as everything else.
 *
 * `process.exitCode` rather than `process.exit()`: setting the code lets Node drain stdout and
 * finish pending handles, where `exit()` truncates in-flight log writes.
 */
import { logger } from '@infrastructure/adapters/logger';

/**
 * Run a script body to completion, then always clean up.
 *
 * @param main    - the script's work; throwing marks the run as failed
 * @param cleanup - close whatever `main` opened. Runs on both the success and failure paths.
 *                  Required, not defaulted: every script here opens a connection, and a silent
 *                  no-op default is how one of them would quietly stop closing it
 * @returns a promise that always resolves — failure is reported via `process.exitCode`, so
 *          callers do not need their own `.catch`
 */
export const runScript = async (
    main: () => Promise<void>,
    cleanup: () => Promise<unknown>
): Promise<void> => {
    try {
        await main();
    } catch (error: unknown) {
        logger.error({
            message: 'Script failed.',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        process.exitCode = 1;
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
