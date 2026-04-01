import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { rejectResponse, successResponse } from '@utils/response';
import { databaseErrorInterpreter } from '@utils/helpers-errors';
import { userModel as Users } from '@models/users';

/**
 * DELETE /account/tokens/expired
 * Remove all expired tokens from the database (admin only).
 * Useful for periodic cleanup of stale refresh tokens.
 */
export const deleteExpiredTokens = (request: Request, response: Response) => {
    /**
     * Remove all expired tokens stored in the server
     */
    return Users.tokenRemoveExpired()
        .then(({ status, success }) => {
            if (!success) return rejectResponse(response, status);
            return successResponse(response, undefined, status);
        })
        .catch((error: CastError | Error) => {
            const [status, message] = databaseErrorInterpreter(error);
            return rejectResponse(response, status, message);
        });
};
