import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * DELETE /users/:id
 * Delete a user by path id (admin).
 */
const deleteUserById = async (request: Request, response: Response): Promise<void> => {
    const hardDelete = request.query.hardDelete === 'true';
    const result = await UserService.remove(String(request.params.id), hardDelete);
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, undefined, 200, result.message);
};

export default deleteUserById;
