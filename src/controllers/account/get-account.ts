import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@utils/response';

/**
 * GET /account
 * Returns the full profile of the authenticated user.
 * Uses authContext DTO when available (DIP), falls back to user document.
 */
export const getAccount = (request: Request, response: Response): void => {
    if (!request.user) {
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }
    /** Prefer transport-safe DTO over Mongoose document method. */
    successResponse(response, request.authContext ?? request.user.toObject());
};
