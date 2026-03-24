import jwt from 'jsonwebtoken';
import type { Require_id } from 'mongoose';
import type { IUser } from '@models/users';

/**
 * JWT payload shape — what gets embedded in the signed token.
 * Kept minimal to avoid stale data issues.
 */
export interface IJwtPayload {
    id: string;
    email: string;
    admin: boolean;
}

/**
 * Sign a JWT for the given user document.
 * Expiry is read from NODE_JWT_EXPIRES_IN env var (seconds, default 86400 = 24h).
 *
 * @param user
 */
export const generateToken = (user: Require_id<IUser>): string =>
    jwt.sign(
        {
            id: user._id.toString(),
            email: user.email,
            admin: user.admin,
        } satisfies IJwtPayload,
        process.env.NODE_JWT_SECRET ?? '',
        { expiresIn: Number(process.env.NODE_JWT_EXPIRES_IN ?? 86_400) },
    );

/**
 * Verify a JWT and return its payload.
 * Throws a JsonWebTokenError or TokenExpiredError on failure.
 *
 * @param token
 */
export const verifyToken = (token: string): IJwtPayload =>
    jwt.verify(token, process.env.NODE_JWT_SECRET ?? '') as IJwtPayload;
