/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AuthTokens = {
    /**
     * Access JWT
     */
    token: string;
    /**
     * Refresh token if returned by backend
     */
    refreshToken?: string;
    /**
     * Access token expiry in seconds
     */
    expiresIn?: number;
};

