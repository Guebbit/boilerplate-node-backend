import type { FastifyReply } from 'fastify';
import { generateSuccess, generateReject } from './response';

export type { IResponseNeutral, IResponseSuccess, IResponseReject } from './response';
export { generateSuccess, generateReject } from './response';

/**
 * Send a successful JSON response via Fastify.
 */
export const successResponse = <T>(
    reply: FastifyReply,
    data: T,
    status = 200,
    message = '',
): FastifyReply =>
    reply.status(status).send(generateSuccess(data, status, message));

/**
 * Send an error JSON response via Fastify.
 */
export const rejectResponse = (
    reply: FastifyReply,
    status = 400,
    message = '',
    errors: string[] = [],
): FastifyReply =>
    reply.status(status).send(generateReject(status, message, errors));
