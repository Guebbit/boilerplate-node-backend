/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type RefreshTokenResponse = {
    /**
     * New access JWT
     */
    token: string;
    /**
     * New refresh token if returned by backend
     */
    refreshToken?: string;
    /**
     * New access token expiry in seconds
     */
    expiresIn?: number;
};

