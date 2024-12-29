import {Response} from 'express';

export interface IResponseNeutral {
    success: boolean;
    status: number;
    message: string;
}

export interface IResponseSuccess<T> extends IResponseNeutral{
    // message: "ok"
    data?: T;
    errors: never;
}

export interface IResponseReject extends IResponseNeutral{
    // message: Technical error name or code
    data: never;
    // UI friendly error message
    errors: string[];
}

/**
 * Success Response Function
 * @param data
 * @param status
 * @param message
 */
export const generateSuccess = <T>(
    data: T,
    status = 200,
    message = '',
) => ({
    success: true,
    status,
    message,
    data,
} as IResponseSuccess<T>)

/**
 * Success Response wrapped and ready to be sent
 * @param res
 * @param data
 * @param status
 * @param message
 */
export const successResponse = <T>(
    res: Response,
    data: T,
    status = 200,
    message = '',
) =>
    res.status(status).json(generateSuccess(data, status, message)) as Response<IResponseSuccess<T>>

/**
 *
 * @param status
 * @param message
 * @param errors
 */
export const generateReject = (
    status = 400,
    message = '',
    errors: string[] = [],
) => ({
    success: false,
    status,
    message,
    errors,
} as IResponseReject)

/**
 *
 * @param res
 * @param status
 * @param message
 * @param errors
 */
export const rejectResponse = (
    res: Response,
    status = 400,
    message = '',
    errors: string[] = [],
) =>
    res.status(status).json(generateReject(status, message, errors)) as Response<IResponseReject>