import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { rejectResponse, successResponse } from '@utils/response';
import { databaseErrorInterpreter } from '@utils/helpers-errors';
import Users from '@models/users';


/**
 * DELETE /account/tokens/expired
 * Remove all expired tokens from the database.
 */
const deleteExpiredTokens = async (request: Request, response: Response) => {
    /**
     * Remove expired tokens from the server
     */
    await Users.tokenRemoveExpired()
        .then(({status, success}) => {
                if (!success)
                    return rejectResponse(response, status);
            return successResponse(response, undefined, status)
        })
        .catch((error: CastError | Error) => {
            const [status, message] = databaseErrorInterpreter(error);
            return rejectResponse(response, status, message);
        })
};

export default deleteExpiredTokens;
