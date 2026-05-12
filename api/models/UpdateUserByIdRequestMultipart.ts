/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Email } from './Email';
import type { Password } from './Password';
export type UpdateUserByIdRequestMultipart = {
    email?: Email;
    password?: Password;
    username?: string;
    /**
     * Optional user profile image
     */
    imageUpload?: Blob;
};

