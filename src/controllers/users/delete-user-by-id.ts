import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * URL parameters
 */
export interface IDeleteUserParameters {
    id?: string
}

/**
 * Query string
 */
export interface IDeleteUserQuery {
    hardDelete?: string
}

/**
 * DELETE /users/:id
 * Delete a user by path id (admin).
 * Pass ?hardDelete=true to permanently delete; otherwise soft-deletes.
 */
const deleteUserById = async (request: Request, response: Response): Promise<void> => {
    // true = hard-delete; false (default) = soft-delete (sets deletedAt)
    const hardDelete = request.query.hardDelete === 'true';
    const result = await UserService.remove(String(request.params.id), hardDelete);
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, undefined, 200, result.message);
};

export default deleteUserById;
