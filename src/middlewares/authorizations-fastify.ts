import type { FastifyRequest, FastifyReply } from 'fastify';
import Users from '@models/users';
import { verifyAccessToken } from '@middlewares/jwt-auth';
import { rejectResponse } from '@utils/response-fastify';
import { EUserRoles } from '@models/users';
import type { IUserDocument } from '@models/users';
import { Types } from 'mongoose';

/**
 * Extend FastifyRequest to carry the authenticated user.
 */
declare module 'fastify' {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    interface FastifyRequest {
        user?: IUserDocument;
    }
}

/**
 * Extract the Bearer token from the Authorization header.
 */
export const getTokenBearer = (request: FastifyRequest): string | undefined =>
    request.headers.authorization?.split(' ')[1];

/**
 * Fastify preHandler — populates request.user when a valid JWT is present.
 * Never blocks; invalid/missing tokens are silently ignored.
 */
export const getAuth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const token = getTokenBearer(request);
    if (!token)
        return;

    try {
        const { id } = await verifyAccessToken(token);
        const user = await Users.findById(id);
        if (user)
            request.user = user;
    } catch {
        // Invalid or expired token — proceed without authenticated user
    }
};

/**
 * Fastify preHandler — rejects the request with 401 when not authenticated.
 * Must be used after getAuth.
 */
export const isAuth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = getTokenBearer(request);
    if (!request.user || !token)
        rejectResponse(reply, 401, 'Unauthorized');
};

/**
 * Fastify preHandler — rejects the request with 403 when the user is not an admin.
 * Must be used after isAuth.
 */
export const isAdmin = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
        rejectResponse(reply, 403, 'Forbidden: Access denied.');
        return;
    }
    if (!request.user.roles.includes(EUserRoles.ADMIN)) {
        rejectResponse(reply, 403, "Forbidden: You don't have permission.");
    }
};

/**
 * Fastify preHandler — dynamically sets params.id to the authenticated user's id.
 * Useful for /me-style routes.
 */
export const isUser = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (request.user?.id)
        (request.params as Record<string, string>).id = (request.user._id as Types.ObjectId).toString();
};
