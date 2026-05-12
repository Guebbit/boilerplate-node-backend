/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Email } from './Email';
import type { Id } from './Id';
export type User = {
    id: Id;
    email: Email;
    username: string;
    admin?: boolean;
    active?: boolean;
    imageUrl?: string;
    createdAt?: string;
    updatedAt?: string;
};

