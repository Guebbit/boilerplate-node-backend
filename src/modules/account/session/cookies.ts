/**
 * @module
 * Cookie service — HTTP cookie creation and destruction, decoupled from JWT logic. Two cookies,
 * two jobs: `jwt` carries the refresh token and is the credential, `isAuth` is a non-secret UI
 * hint so the client shell can render the right chrome before its first request answers. See
 * docs/modules/account-sessions.md for the flag-by-flag rationale.
 */

import type { Response } from 'express';
import { type RefreshTokenExpiryTime, getExpiryTimeMilliseconds } from './config';

/**
 * Set a secure httpOnly cookie containing the refresh token.
 */
export const createRefreshCookie = (
    response: Response,
    token: string,
    remember?: RefreshTokenExpiryTime
) => {
    response.cookie('jwt', token, {
        // Unreadable from script: the refresh token is the long-lived credential.
        httpOnly: true,
        // Only over HTTPS in production, so local http development still works.
        secure: process.env.NODE_ENV === 'production',
        // Survives a top-level navigation back into the app; refuses cross-site form posts.
        sameSite: 'lax',
        // Expires when the token does, rather than outliving it.
        maxAge: getExpiryTimeMilliseconds(remember),
        // The refresh and logout endpoints are on different paths — send it everywhere.
        path: '/'
    });
};

/**
 * Destroy the refresh token cookie.
 */
export const destroyRefreshCookie = (response: Response) => {
    response.clearCookie('jwt', {
        // Must match the flags `createRefreshCookie` set — a browser matches a clear by
        // path/domain/attributes, not by name alone.
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
        // No `httpOnly`/`secure`: this cookie holds no credential, only a hint the client may read.
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
