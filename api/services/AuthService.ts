/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthTokensEnvelope } from '../models/AuthTokensEnvelope';
import type { LoginRequest } from '../models/LoginRequest';
import type { MessageResponse } from '../models/MessageResponse';
import type { PasswordResetConfirmRequest } from '../models/PasswordResetConfirmRequest';
import type { PasswordResetRequest } from '../models/PasswordResetRequest';
import type { RefreshTokenEnvelope } from '../models/RefreshTokenEnvelope';
import type { SignupRequest } from '../models/SignupRequest';
import type { UserEnvelope } from '../models/UserEnvelope';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthService {
    /**
     * Login
     * Authenticates a user with email and password credentials. On success, returns a JWT access token that must be passed as a Bearer token on subsequent authenticated requests.
     * @param requestBody
     * @returns AuthTokensEnvelope Auth tokens
     * @throws ApiError
     */
    public static login(
        requestBody: LoginRequest,
    ): CancelablePromise<AuthTokensEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/account/login',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Signup
     * Registers a new user account with optional image upload. Returns the newly created user profile on success.
     * @param requestBody
     * @returns UserEnvelope Created
     * @throws ApiError
     */
    public static signup(
        requestBody: SignupRequest,
    ): CancelablePromise<UserEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/account/signup',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Initiates the password-reset flow by sending a one-time reset token to the provided email address. The token should then be submitted to `/account/reset-confirm`.
     * @param requestBody
     * @returns MessageResponse Success
     * @throws ApiError
     */
    public static requestPasswordReset(
        requestBody: PasswordResetRequest,
    ): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/account/reset',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Completes the password-reset flow. Validates the one-time reset token issued by `/account/reset` and, if valid, updates the user's password to the supplied value.
     * @param requestBody
     * @returns MessageResponse Success
     * @throws ApiError
     */
    public static confirmPasswordReset(
        requestBody: PasswordResetConfirmRequest,
    ): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/account/reset-confirm',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Refresh access token
     * Creates a new short-lived access token using a refresh token. The refresh token can be provided as a query parameter, path parameter, or retrieved from the `jwt` cookie.
     * @returns RefreshTokenEnvelope New access token
     * @throws ApiError
     */
    public static refreshToken(): CancelablePromise<RefreshTokenEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/account/refresh',
            errors: {
                401: `Unauthorized`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Refresh access token with token in path
     * Creates a new short-lived access token using a refresh token provided in the URL path.
     * @param token Refresh token
     * @returns RefreshTokenEnvelope New access token
     * @throws ApiError
     */
    public static refreshTokenWithPath(
        token: string,
    ): CancelablePromise<RefreshTokenEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/account/refresh/{token}',
            path: {
                'token': token,
            },
            errors: {
                401: `Unauthorized`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Logout from all devices
     * Logs out the authenticated user from ALL devices by removing all refresh tokens from the database and clearing authentication cookies.
     * @returns MessageResponse Success
     * @throws ApiError
     */
    public static logoutAll(): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/account/logout-all',
            errors: {
                401: `Unauthorized`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Remove expired tokens
     * Removes all expired tokens (refresh, password-reset, etc.) from every user record in the database. Restricted to administrators.
     * @returns MessageResponse Success
     * @throws ApiError
     */
    public static deleteExpiredTokens(): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/account/tokens/expired',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                500: `Internal server error`,
            },
        });
    }
}
