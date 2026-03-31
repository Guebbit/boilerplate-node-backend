import Users from '@models/users';
import logger from '@utils/winston';

/**
 * Default cleanup interval: 1 hour (in milliseconds).
 */
const DEFAULT_INTERVAL_MS = 3_600_000;

/**
 * Parse the interval from an optional environment variable.
 * Falls back to DEFAULT_INTERVAL_MS if the variable is absent or invalid.
 */
const getIntervalMs = (): number => {
    const raw = process.env.NODE_TOKEN_CLEANUP_INTERVAL;
    if (!raw) return DEFAULT_INTERVAL_MS;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
};

/**
 * Run one cleanup cycle: remove every expired token from every user document.
 */
export const runTokenCleanup = async (): Promise<void> => {
    logger.info('Token cleanup: starting expired-token removal');
    const { status, success } = await Users.tokenRemoveExpired();
    if (success) {
        logger.info('Token cleanup: completed successfully');
    } else {
        logger.error(`Token cleanup: failed with status ${status}`);
    }
};

/**
 * Start a recurring cleanup job that removes expired tokens from all users.
 *
 * An initial cleanup is executed immediately so stale tokens left over from
 * a previous server run are cleared without waiting for the first interval.
 *
 * The interval can be configured via the `NODE_TOKEN_CLEANUP_INTERVAL`
 * environment variable (value in milliseconds). Defaults to one hour.
 *
 * @returns The `NodeJS.Timeout` handle, which can be passed to `clearInterval`
 *          to stop the job (e.g. during graceful shutdown or in tests).
 */
export const startTokenCleanup = (): NodeJS.Timeout => {
    const intervalMs = getIntervalMs();

    // Run once immediately to flush tokens that expired while the server was down
    runTokenCleanup().catch((error: unknown) =>
        logger.error({ message: 'Token cleanup: unexpected error during initial run', error })
    );

    const handle = setInterval(() => {
        runTokenCleanup().catch((error: unknown) =>
            logger.error({ message: 'Token cleanup: unexpected error', error })
        );
    }, intervalMs);

    logger.info(`Token cleanup: scheduled every ${intervalMs}ms`);
    return handle;
};
