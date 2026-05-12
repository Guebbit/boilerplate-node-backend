/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Email } from './Email';
import type { Id } from './Id';
import type { Password } from './Password';
export type UpdateUserRequestMultipart = {
    id: Id;
    email?: Email;
    username?: string;
    password?: Password;
    /**
     * Optional user profile image
     */
    imageUpload?: Blob;
};

