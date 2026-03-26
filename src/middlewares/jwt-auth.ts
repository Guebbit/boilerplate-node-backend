import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { IUserDocument } from '@models/users';
import UserRepository from '@repositories/users';

/**
 * JWT payload structure
 */
export interface IJwtPayload {
    userId: string;
    admin: boolean;
    iat?: number;
    exp?: number;
}

/**
 * Get JWT secret from environment or use a default (for development only)
 */
const getJwtSecret = (): string => {
    const secret = process.env.NODE_JWT_SECRET || process.env.NODE_SESSION_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET or SESSION_SECRET must be defined in environment variables');
    }
    return secret;
};

/**
 * Generate a JWT token for a user
 *
 * @param userId - User's database ID
 * @param admin - Whether user is admin
 * @param expiresIn - Token expiration (default: 24h)
 * @returns JWT token string
 */
export const generateToken = (userId: string, admin: boolean, expiresIn: string | number = '24h'): string => {
    const payload: IJwtPayload = {
        userId,
        admin,
    };

    // Type cast to satisfy TypeScript's strict StringValue type checking
    return jwt.sign(payload, getJwtSecret(), { expiresIn });
};

/**
 * Verify and decode a JWT token
 *
 * @param token - JWT token string
 * @returns Decoded JWT payload or null if invalid
 */
export const verifyToken = (token: string): IJwtPayload | null => {
    try {
        return jwt.verify(token, getJwtSecret()) as IJwtPayload;
    } catch {
        return undefined;
    }
};

/**
 * Middleware to extract and verify JWT token from Authorization header
 * Populates request.user with the full user document if token is valid
 *
 * This is optional - the route can still proceed without authentication
 * Use isAuth or isAdmin middleware to enforce authentication
 */
export const jwtAuth = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // Extract token from Authorization header (Bearer <token>)
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token provided - continue without user context
            next();
            return;
        }

        const token = authHeader.slice(7); // Remove 'Bearer ' prefix
        const payload = verifyToken(token);

        if (!payload) {
            // Invalid token - continue without user context
            next();
            return;
        }

        // Load full user document from database
        const user = await UserRepository.findById(payload.userId);

        if (!user) {
            // User no longer exists - continue without user context
            next();
            return;
        }

        // Attach user to request
        request.user = user as IUserDocument;

        next();
    } catch {
        // On any error, just continue without user context
        // Don't fail the request
        next();
    }
};
