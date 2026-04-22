import { HttpException } from '@nestjs/common';
import { generateReject, generateSuccess } from '@utils/response';

/**
 * Build a successful API envelope using the existing shared format.
 */
export const ok = <T>(data: T, status = 200, message = '') =>
    generateSuccess<T>(data, status, message);

/**
 * Throw a Nest HttpException with the shared error payload format.
 */
export const fail = (status = 400, message = '', errors: string[] = []): never => {
    throw new HttpException(generateReject(status, message, errors), status);
};
