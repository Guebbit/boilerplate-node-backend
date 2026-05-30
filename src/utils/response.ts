import type { Response } from 'express';

export interface IResponseNeutral {
    success: boolean;
    status: number;
    message: string;
}

export interface IResponseSuccess<T> extends IResponseNeutral {
    // message: "ok"
    data?: T;
    errors: never;
}

export interface IResponseErrorItem {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

export interface IResponseReject extends IResponseNeutral {
    // explicit undefined keeps `result.data` union-safe
    data: undefined;
    // structured errors for machines and UIs
    errors: IResponseErrorItem[];
}

/**
 * Build the canonical success envelope so every endpoint speaks the same response dialect.
 */
export const generateSuccess = <T>(data: T, status = 200, message = '') =>
    ({
        success: true,
        status,
        message,
        data
    }) as IResponseSuccess<T>;

/**
 * Serialize the success envelope immediately when a controller is done with its work.
 */
export const successResponse = <T>(response: Response, data: T, status = 200, message = '') =>
    response.status(status).json(generateSuccess(data, status, message)) as Response<
        IResponseSuccess<T>
    >;

/**
 * Build the canonical error envelope so clients can parse failures predictably.
 */
/**
 * Maps HTTP status codes to stable machine-readable error codes.
 * @param status
 * @returns
 */
const resolveErrorCode = (status: number) => {
    if (status === 400) return 'BAD_REQUEST';
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status >= 500) return 'INTERNAL_ERROR';
    return 'REQUEST_ERROR';
};

/**
 * Normalizes mixed error inputs into the structured API error item shape.
 * @param status
 * @param message
 * @param errors
 * @returns
 */
const normalizeErrors = (
    status: number,
    message: string,
    errors: Array<string | IResponseErrorItem>
): IResponseErrorItem[] => {
    const fallbackMessage = message || 'Request failed';
    const inputErrors = errors.length > 0 ? errors : [fallbackMessage];

    return inputErrors.map((error) => {
        if (typeof error === 'string') {
            return {
                code: resolveErrorCode(status),
                message: error
            };
        }

        return {
            code: error.code || resolveErrorCode(status),
            message: error.message || fallbackMessage,
            ...(error.details ? { details: error.details } : {})
        };
    });
};

export const generateReject = (
    status = 400,
    message = '',
    errors: Array<string | IResponseErrorItem> = []
) =>
    ({
        success: false,
        status,
        message,
        data: undefined,
        errors: normalizeErrors(status, message, errors)
    }) as IResponseReject;

/**
 * Send a normalized error payload instead of leaking framework-specific response shapes.
 */
export const rejectResponse = (
    response: Response,
    status = 400,
    message = '',
    errors: Array<string | IResponseErrorItem> = []
) =>
    response
        .status(status)
        .json(generateReject(status, message, errors)) as Response<IResponseReject>;
