/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Email } from './Email';
import type { Password } from './Password';
export type SignupRequest = {
    email: Email;
    username: string;
    password: Password;
    passwordConfirm: Password;
    imageUrl?: string;
};

