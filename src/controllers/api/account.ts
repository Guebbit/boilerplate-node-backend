import type { Request, Response, NextFunction } from 'express';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * GET /account
 * Get current authenticated user information
 * Requires JWT authentication (request.user populated by jwtAuth middleware)
 */
export const getAccount = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!request.user) {
            rejectResponse(response, 401, 'Authentication required');
            return;
        }

        // Return user data (without password)
        const userObject = request.user.toObject();
        delete userObject.password;

        successResponse(response, userObject);
    } catch (error) {
        next(error);
    }
};
