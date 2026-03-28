import type { FastifyPluginAsync } from 'fastify';
import { successResponse } from '@utils/response-fastify';

/**
 * GET /
 * Health-check / welcome endpoint.
 */
const systemRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/', async (_request, reply) => {
        successResponse(reply, { status: 'ok' }, 200, 'API is running');
    });
};

export default systemRoutes;
