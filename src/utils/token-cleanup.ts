import { userModel as Users } from '@models/users';
import { logger } from '@utils/winston';

/**
 * Run one cleanup cycle: remove every expired token.
 */
export const runTokenCleanup = async () => {
    logger.info('Token cleanup: starting expired-token removal');
    const { status, success } = await Users.tokenRemoveExpired();
    if (success) {
        logger.info('Token cleanup: completed successfully');
    } else {
        logger.error(`Token cleanup: failed with status ${status}`);
    }
};
