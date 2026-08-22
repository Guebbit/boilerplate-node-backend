import type { Response } from 'express';
import { type RefreshTokenExpiryTime, getExpiryTimeMilliseconds } from './config';

/**
 * Cookie Service
 * Single responsibility: HTTP cookie creation and destruction.
 * Decoupled from JWT token logic.
 */

/**
 * Set a secure httpOnly cookie containing the refresh token.
 */
export const createRefreshCookie = (
    response: Response,
    token: string,
    remember?: RefreshTokenExpiryTime
) => {
    response.cookie('jwt', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: getExpiryTimeMilliseconds(remember),
        path: '/'
    });
};

/**
 * Destroy the refresh token cookie.
 */
export const destroyRefreshCookie = (response: Response) => {
    response.clearCookie('jwt', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    });
};

/**
 * Non-secure UI-hint cookie indicating logged-in state.
 */
export const createLoggedCookie = (response: Response, remember?: RefreshTokenExpiryTime) => {
    response.cookie('isAuth', 'true', {
        maxAge: getExpiryTimeMilliseconds(remember),
        sameSite: 'lax',
        path: '/'
    });
};

/**
 * Destroy the logged-in indicator cookie.
 */
export const destroyLoggedCookie = (response: Response) => {
    response.clearCookie('isAuth', {
        path: '/'
    });
};
