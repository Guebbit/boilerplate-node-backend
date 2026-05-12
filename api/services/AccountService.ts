/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { User } from '../models/User';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AccountService {
    /**
     * Current user info
     * Returns the full profile of the currently authenticated user
     * @returns User Current user info
     * @throws ApiError
     */
    public static getAccount(): CancelablePromise<User> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/account',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
}
