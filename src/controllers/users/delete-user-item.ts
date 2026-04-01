import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * DELETE /users/:id
 * Delete a user by path id (admin).
 * Pass ?hardDelete=true to permanently delete; otherwise soft-deletes.
 */
const deleteUserItem = (request: Request, response: Response) => {
    // true = hard-delete; false (default) = soft-delete (sets deletedAt)
    const hardDelete = request.query.hardDelete === 'true';
    return UserService.remove(String(request.params.id), hardDelete).then((result) => {
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, undefined, 200, result.message);
    });
};

export default deleteUserItem;
