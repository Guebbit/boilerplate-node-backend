/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AccountDeleteConfirmRequest } from '../models/AccountDeleteConfirmRequest';
import type { MessageResponse } from '../models/MessageResponse';
import type { UserEnvelope } from '../models/UserEnvelope';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AccountService {
    /**
     * Current user info
     * Returns the full profile of the currently authenticated user
     * @returns UserEnvelope Current user info
     * @throws ApiError
     */
    public static getAccount(): CancelablePromise<UserEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/account',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Request account deletion
     * Initiates the account-deletion flow for the authenticated user. A one-time confirmation token is sent to the user's email address. The token must then be submitted to `/account/delete-confirm` to complete the deletion.
     * @returns MessageResponse Success
     * @throws ApiError
     */
    public static requestAccountDelete(): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/account',
            errors: {
                401: `Unauthorized`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Confirm account deletion
     * Completes the account-deletion flow. Validates the one-time token issued by `DELETE /account` and, if valid, permanently removes the user account.
     * @param requestBody
     * @returns MessageResponse Success
     * @throws ApiError
     */
    public static confirmAccountDelete(
        requestBody: AccountDeleteConfirmRequest,
    ): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/account/delete-confirm',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
}
