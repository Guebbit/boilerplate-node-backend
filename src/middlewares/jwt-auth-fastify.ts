import type { FastifyReply } from 'fastify';
import { ERefreshTokenExpiryTime } from './jwt-auth';

export { ERefreshTokenExpiryTime } from './jwt-auth';

/**
 * Get expiry time for the token (in seconds).
 */
const getExpiryTime = (remember?: ERefreshTokenExpiryTime): number => {
    switch (remember) {
        // eslint-disable-next-line unicorn/switch-case-braces
        case ERefreshTokenExpiryTime.SHORT:
            return process.env.NODE_REFRESH_TOKEN_SECRET_TIME_SHORT ? Number.parseInt(process.env.NODE_REFRESH_TOKEN_SECRET_TIME_SHORT) : 0;
        // eslint-disable-next-line unicorn/switch-case-braces
        case ERefreshTokenExpiryTime.MEDIUM:
            return process.env.NODE_REFRESH_TOKEN_SECRET_TIME_MEDIUM ? Number.parseInt(process.env.NODE_REFRESH_TOKEN_SECRET_TIME_MEDIUM) : 0;
        // eslint-disable-next-line unicorn/switch-case-braces
        case ERefreshTokenExpiryTime.LONG:
            return process.env.NODE_REFRESH_TOKEN_SECRET_TIME_LONG ? Number.parseInt(process.env.NODE_REFRESH_TOKEN_SECRET_TIME_LONG) : 0;
    }
    return process.env.NODE_ACCESS_TOKEN_SECRET_TIME ? Number.parseInt(process.env.NODE_ACCESS_TOKEN_SECRET_TIME) : 0;
};

/**
 * Set the HttpOnly JWT refresh-token cookie on a Fastify reply.
 */
export const createRefreshCookie = (reply: FastifyReply, token: string, remember?: ERefreshTokenExpiryTime): void => {
    reply.setCookie('jwt', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: getExpiryTime(remember),
        path: '/',
    });
};

/**
 * Clear the JWT refresh-token cookie on a Fastify reply.
 */
export const destroyRefreshCookie = (reply: FastifyReply): void => {
    reply.clearCookie('jwt', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    });
};

/**
 * Set the non-secure isAuth cookie (UI hint) on a Fastify reply.
 */
export const createLoggedCookie = (reply: FastifyReply, remember?: ERefreshTokenExpiryTime): void => {
    reply.setCookie('isAuth', 'true', {
        maxAge: getExpiryTime(remember),
        path: '/',
    });
};

/**
 * Clear the isAuth cookie on a Fastify reply.
 */
export const destroyLoggedCookie = (reply: FastifyReply): void => {
    reply.clearCookie('isAuth', { path: '/' });
};
