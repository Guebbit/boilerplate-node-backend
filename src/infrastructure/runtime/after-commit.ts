/**
 * @module
 * Work that follows a committed write: an audit row, an image hand-off, a file removed. The write
 * is already true, so a failure here must not turn it into an error response — it is logged, and
 * the caller carries on.
 */

import { logger } from '@infrastructure/adapters/logger';

/**
 * Run one post-commit step; on failure log it and answer `fallback`. Never rejects, and one step
 * failing does not stop the next.
 *
 * @param step - what the step is, for the log line
 * @param run - the step itself
 * @param fallback - what to answer when `run` fails (the value the caller would otherwise have got)
 * @param fields - ids that make the log line findable, e.g. `{ userId }`
 * @returns what `run` answered, or `fallback`
 */
export const afterCommit = <T>(
    step: string,
    run: () => T | Promise<T>,
    fallback: T,
    fields: Record<string, unknown> = {}
): Promise<T> =>
    Promise.resolve()
        .then(run)
        .catch((error: unknown) => {
            logger.error({ message: `Post-commit step failed: ${step}.`, ...fields, error });
            return fallback;
        });
