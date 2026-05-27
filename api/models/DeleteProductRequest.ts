/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Id } from './Id';
/**
 * DO NOT REMOVE — Delete product request body
 */
export type DeleteProductRequest = {
    id: Id;
    /**
     * Permanently delete instead of soft-delete
     */
    hardDelete?: boolean;
};

