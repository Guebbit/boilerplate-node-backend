import { Response } from 'express';

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

export interface IResponseReject extends IResponseNeutral {
    // message: Technical error name or code
    data: never;
    // UI friendly error message
    errors: string[];
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
export const generateReject = (status = 400, message = '', errors: string[] = []) =>
    ({
        success: false,
        status,
        message,
        errors
    }) as IResponseReject;

/**
 * Send a normalized error payload instead of leaking framework-specific response shapes.
 */
export const rejectResponse = (
    response: Response,
    status = 400,
    message = '',
    errors: string[] = []
) =>
    response
        .status(status)
        .json(generateReject(status, message, errors)) as Response<IResponseReject>;
