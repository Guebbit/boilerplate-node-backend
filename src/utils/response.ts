import { Response } from 'express';
import { Types } from 'mongoose';

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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Object.prototype.toString.call(value) === '[object Object]' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const serializeResponseData = (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    if (value instanceof Date || Buffer.isBuffer(value)) return value;
    if (value instanceof Types.ObjectId) return value.toString();
    if (Array.isArray(value)) return value.map((item) => serializeResponseData(item));

    const jsonSerializable = value as { toJSON?: () => unknown };
    const toJson = jsonSerializable.toJSON;
    const shouldApplyToJson = typeof toJson === 'function' && !isPlainObject(value);

    // Apply toJSON only to non-plain objects so plain objects still go through `_id` → `id`.
    if (shouldApplyToJson) return serializeResponseData(toJson.call(value));

    if (!isPlainObject(value)) return value;

    const serialized: Record<string, unknown> = {};

    for (const [key, propertyValue] of Object.entries(value)) {
        if (key === '__v') continue;

        const normalizedValue = serializeResponseData(propertyValue);

        if (key === '_id') {
            serialized.id = normalizedValue;
            continue;
        }

        serialized[key] = normalizedValue;
    }

    return serialized;
};

/**
 * Build the canonical success envelope so every endpoint speaks the same response dialect.
 */
export const generateSuccess = <T>(data: T, status = 200, message = '') =>
    ({
        success: true,
        status,
        message,
        data: serializeResponseData(data) as T
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
