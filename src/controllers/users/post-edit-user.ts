import type { NextFunction, Request, Response } from "express";
import type { CastError } from "mongoose";
import { Types } from "mongoose";
import { ExtendedError } from "@utils/error-helpers";
import { rejectResponse, successResponse } from "@utils/response";
import type { CreateUserRequest, UpdateUserRequest, UpdateUserByIdRequest } from "@api/api";
import UserService from "@services/users";

/**
 * Path parameters for user-by-id endpoints
 */
export interface IUserIdParams {
    userId: string;
}

/**
 * Create a new user (admin only).
 * POST /users
 *
 * @param request
 * @param response
 * @param next
 */
export const postCreateUser = async (request: Request<unknown, unknown, CreateUserRequest>, response: Response, next: NextFunction) => {
    const {
        email,
        username,
        password,
        admin = false,
        imageUrl = "",
    } = request.body;

    /**
     * Data validation
     */
    const issues = UserService.validateData(
        { email, username, password, admin },
        { requirePassword: true },
    );

    if (issues.length > 0)
        return rejectResponse(response, 422, 'user - validation error', issues);

    return UserService.adminCreate({
        email,
        username,
        password,
        admin,
        imageUrl: imageUrl || undefined,
    })
        .then((user) => successResponse(response, user.toObject(), 201))
        .catch((error: CastError) =>
            next(new ExtendedError(error.kind, 500, false, [ error.message ]))
        );
};

/**
 * Update an existing user (admin only) — ID provided in request body.
 * PUT /users
 *
 * @param request
 * @param response
 * @param next
 */
export const putEditUser = async (request: Request<unknown, unknown, UpdateUserRequest>, response: Response, next: NextFunction) => {
    const { id } = request.body;

    if (!id || id === '')
        return rejectResponse(response, 422, 'user - missing id', ['User id is required']);

    return _updateUser(id, request.body, response, next);
};

/**
 * Update an existing user (admin only) — ID provided as path parameter.
 * PUT /users/:userId
 *
 * @param request
 * @param response
 * @param next
 */
export const putEditUserById = async (request: Request<IUserIdParams, unknown, UpdateUserByIdRequest>, response: Response, next: NextFunction) =>
    _updateUser(request.params.userId, request.body, response, next);

/**
 * Shared user update logic
 */
const _updateUser = async (
    id: string,
    data: Partial<UpdateUserRequest>,
    response: Response,
    next: NextFunction,
) => {
    const { email, password } = data;

    return UserService.adminUpdate(id, {
        ...(email !== undefined && { email }),
        ...(password !== undefined && password.trim().length > 0 && { password }),
    })
        .then((updatedUser) => successResponse(response, updatedUser.toObject()))
        .catch((error: CastError) => {
            if (error.message === '404')
                return rejectResponse(response, 404, 'user - not found', ['User not found']);
            return next(new ExtendedError(error.kind, 500, false, [ error.message ]));
        });
};
