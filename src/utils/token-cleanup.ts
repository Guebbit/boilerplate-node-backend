import { userModel as Users } from '@models/users';
import { logger } from '@utils/winston';

/**
 * Run one cleanup cycle: remove every expired token.
 */
export const runTokenCleanup = () => {
    logger.info('Token cleanup: starting expired-token removal');
    return Users.tokenRemoveExpired().then(({ status, success }) => {
        if (success) {
            logger.info('Token cleanup: completed successfully');
        } else {
            logger.error(`Token cleanup: failed with status ${status}`);
        }
    });
};
