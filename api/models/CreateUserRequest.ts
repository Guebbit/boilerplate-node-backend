/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Email } from './Email';
import type { Password } from './Password';
export type CreateUserRequest = {
    email: Email;
    username: string;
    password: Password;
    admin?: boolean;
    active?: boolean;
    imageUrl?: string;
};

