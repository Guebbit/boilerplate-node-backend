/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Password } from './Password';
export type PasswordResetConfirmRequest = {
    /**
     * One-time password reset token (NOT a JWT).
     */
    token: string;
    password: Password;
    passwordConfirm: Password;
};

