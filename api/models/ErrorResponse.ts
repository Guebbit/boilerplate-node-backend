/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ErrorItem } from './ErrorItem';
export type ErrorResponse = {
    success: boolean;
    status: number;
    /**
     * Human-readable summary for this failure
     */
    message: string;
    /**
     * Structured machine-friendly errors
     */
    errors: Array<ErrorItem>;
};

