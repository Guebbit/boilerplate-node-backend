/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

import { ErrorDetail } from './errorDetail';

export interface ErrorResponse {
    success: boolean;
    error: ErrorDetail;
    /**
    * Correlation ID for support/debugging
    */
    traceId?: string;
}

