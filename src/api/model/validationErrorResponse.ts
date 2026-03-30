/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

import { ErrorDetail } from './errorDetail';
import { ValidationErrorResponseAllOfErrors } from './validationErrorResponseAllOfErrors';

export interface ValidationErrorResponse {
    success: boolean;
    error: ErrorDetail;
    /**
    * Correlation ID for support/debugging
    */
    traceId?: string;
    errors: Array<ValidationErrorResponseAllOfErrors>;
}

