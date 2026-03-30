import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@utils/response';

/**
 * GET /account
 * Returns the full profile of the authenticated user.
 */
const getAccount = (request: Request, response: Response): void => {
    if (!request.user) {
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }
    successResponse(response, request.user.toObject());
};

export default getAccount;
