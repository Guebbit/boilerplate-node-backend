/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ErrorResponse } from './ErrorResponse';
export type ValidationErrorResponse = (ErrorResponse & {
    success: boolean;
    errors: Array<{
        field: string;
        message: string;
        code?: string;
    }>;
});

