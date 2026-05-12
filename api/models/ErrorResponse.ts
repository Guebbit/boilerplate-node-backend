/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ErrorDetail } from './ErrorDetail';
export type ErrorResponse = {
    success: boolean;
    error: ErrorDetail;
    /**
     * Correlation ID for support/debugging
     */
    traceId?: string;
};

