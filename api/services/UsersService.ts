/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateUserRequest } from '../models/CreateUserRequest';
import type { DeleteUserRequest } from '../models/DeleteUserRequest';
import type { Email } from '../models/Email';
import type { Id } from '../models/Id';
import type { MessageResponse } from '../models/MessageResponse';
import type { Page } from '../models/Page';
import type { PageSize } from '../models/PageSize';
import type { SearchUsersRequest } from '../models/SearchUsersRequest';
import type { Text } from '../models/Text';
import type { UpdateUserByIdRequest } from '../models/UpdateUserByIdRequest';
import type { UpdateUserRequest } from '../models/UpdateUserRequest';
import type { UserEnvelope } from '../models/UserEnvelope';
import type { UsersResponseEnvelope } from '../models/UsersResponseEnvelope';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class UsersService {
    /**
     * List users (paginated)
     * Returns a paginated list of user accounts.
     * @param page 1-based page index
     * @param pageSize
     * @param text
     * @param id
     * @param email
     * @param username
     * @param active
     * @returns UsersResponseEnvelope Users list page
     * @throws ApiError
     */
    public static listUsers(
        page?: Page,
        pageSize?: PageSize,
        text?: Text,
        id?: Id,
        email?: Email,
        username?: string,
        active?: boolean,
    ): CancelablePromise<UsersResponseEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users',
            query: {
                'page': page,
                'pageSize': pageSize,
                'text': text,
                'id': id,
                'email': email,
                'username': username,
                'active': active,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Create user
     * Creates a new user account with the supplied email, username, and password. Optional image can be uploaded.
     * @param requestBody
     * @returns UserEnvelope Created user
     * @throws ApiError
     */
    public static createUser(
        requestBody: CreateUserRequest,
    ): CancelablePromise<UserEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Edit user
     * Updates an existing user's email or password. Optional image can be uploaded.
     * @param requestBody
     * @returns UserEnvelope Updated user
     * @throws ApiError
     */
    public static updateUser(
        requestBody: UpdateUserRequest,
    ): CancelablePromise<UserEnvelope> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/users',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Delete user
     * Deletes the user identified by the `id` field in the request body. Set `hardDelete` to `true` to permanently remove the record.
     * @param requestBody
     * @returns MessageResponse Success
     * @throws ApiError
     */
    public static deleteUser(
        requestBody: DeleteUserRequest,
    ): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/users',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * User details
     * Returns the full profile of the user identified by `{id}`. Functionally equivalent to `GET /users?id={id}`.
     * @param id Resource identifier
     * @returns UserEnvelope User
     * @throws ApiError
     */
    public static getUserById(
        id: Id,
    ): CancelablePromise<UserEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Edit user
     * Updates the email or password of the user identified by `{id}` in the path. Optional image can be uploaded.
     * @param id Resource identifier
     * @param requestBody
     * @returns UserEnvelope Updated user
     * @throws ApiError
     */
    public static updateUserById(
        id: Id,
        requestBody: UpdateUserByIdRequest,
    ): CancelablePromise<UserEnvelope> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/users/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Resource not found`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Delete user
     * Deletes the user identified by `{id}` in the path. Pass the `hardDelete` query parameter as `true` to permanently remove the record. Functionally equivalent to `DELETE /users`.
     * @param id Resource identifier
     * @param hardDelete
     * @returns MessageResponse Success
     * @throws ApiError
     */
    public static deleteUserById(
        id: Id,
        hardDelete?: boolean,
    ): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/users/{id}',
            path: {
                'id': id,
            },
            query: {
                'hardDelete': hardDelete,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Search users (DTO-friendly)
     * Searches and filters users via a JSON request body. Functionally equivalent to `GET /users` with query parameters
     * @param requestBody
     * @returns UsersResponseEnvelope Users search results
     * @throws ApiError
     */
    public static searchUsers(
        requestBody: SearchUsersRequest,
    ): CancelablePromise<UsersResponseEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users/search',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
}
