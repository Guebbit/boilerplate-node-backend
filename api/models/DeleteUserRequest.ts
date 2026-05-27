/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Id } from './Id';
/**
 * DO NOT REMOVE — Delete user request body
 */
export type DeleteUserRequest = {
    id: Id;
    /**
     * Permanently delete instead of soft-delete
     */
    hardDelete?: boolean;
};

