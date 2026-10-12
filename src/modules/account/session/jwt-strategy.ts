/**
 * @module
 * `jwt` mode: a 10-minute access JWT the client holds in memory, plus a rotating refresh token in
 * an HttpOnly cookie, one `sessions` row per refresh token. The signing, rotation and reuse
 * detection live in `./jwt.ts`; this file is the adapter that puts them behind
 * {@link SessionStrategy}, so nothing above it knows tokens are involved.
 *
 * See: docs/modules/account-sessions.md
 */

import type { Request, Response } from 'express';
import { readSessionCookie } from '@kernel/cookies';
import type { Resolution } from '@kernel/authentication';
import { logger } from '@infrastructure/adapters/logger';
import { hashToken } from '@infrastructure/security/hash-token';
import type { AuthContext } from '@types';
import { sessionRepository } from '../repository';
import {
    createRefreshToken,
    createAccessToken,
    rememberOfRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    TokenRejection,
    type TokenData
} from './jwt';
import { createSessionCookie, createLoggedCookie } from './cookies';
import { getCookieMaxAgeMilliseconds } from './config';
import { resolveProof } from './auth-context';
import { listSessions } from './listing';
import type {
    IssuedSession,
    IssueOptions,
    SessionRequest,
    SessionSnapshot,
    SessionStrategy
} from './strategy';

/**
 * Mint a refresh token, set its cookies, and exchange it for an access token.
 *
 * @param response - the live response to set the refresh/logged cookies on
 * @param userId - whose session this is
 * @param options - the login's tier, proof and mint kind
 * @returns the access token to hand back in the body
 */
const mintSession = (
    response: Response,
    userId: string,
    { remember, amr, mint = 'first' }: IssueOptions
): Promise<IssuedSession> =>
    createRefreshToken(userId, remember, amr, mint).then((refreshToken) => {
        const maxAgeMs = getCookieMaxAgeMilliseconds(remember);
        createSessionCookie(response, refreshToken, maxAgeMs);
        createLoggedCookie(response, maxAgeMs);
        return createAccessToken(refreshToken).then((token) => ({ token }));
    });

/**
 * Delete the refresh row a re-mint replaced, so a re-authentication leaves one live session
 * behind rather than two. A no-op when nothing was presented or a password change already
 * removed it. Its failure is logged, not raised: the new session exists, and a leftover old one
 * only expires on its own schedule.
 *
 * @param refreshToken - the refresh cookie the request carried, if any
 */
const retireRefreshToken = (refreshToken: string | undefined): Promise<void> =>
    refreshToken
        ? sessionRepository
              .removeByHash(hashToken(refreshToken))
              .then(() => undefined)
              .catch((error: unknown) => {
                  logger.warn({ message: 'Could not retire the replaced refresh token.', error });
              })
        : Promise.resolve();

/**
 * The tier of the session behind a refresh cookie, so a re-mint keeps its persistence instead of
 * resetting it. Signature and expiry only, no database read: a password change has already deleted
 * the row by the time it re-mints.
 */
const snapshotOf = (request: SessionRequest, userId: string): Promise<SessionSnapshot> =>
    rememberOfRefreshToken(readSessionCookie(request), userId).then((remember) => ({
        ...(remember && { remember })
    }));

/**
 * A claims resolver in the port's answer shape: a refused token becomes a `{ miss }`, a resolved
 * (or no-longer-existing) user becomes `{ ok }`, and anything else — an outage — still rejects, so
 * the guard can tell "your token is bad" from "we are down".
 */
const resolveWith =
    (verify: (token: string) => Promise<TokenData>) =>
    (token: string): Promise<Resolution<AuthContext | undefined>> =>
        verify(token)
            .then((claims) =>
                resolveProof(claims.id, { authTime: claims.auth_time, amr: claims.amr })
            )
            .then(
                (ok): Resolution<AuthContext | undefined> => ({ ok }),
                (error: unknown): Resolution<AuthContext | undefined> => {
                    if (error instanceof TokenRejection) return { miss: error.reason };
                    throw error;
                }
            );

/** The `jwt` adapter. */
export const jwtStrategy: SessionStrategy = {
    mode: 'jwt',
    // The refresh cookie opens the two SSE streams and nothing else: every other route takes the
    // access token as a bearer.
    cookieAuthenticates: false,

    issue: (_request, response, userId, options = {}) => mintSession(response, userId, options),

    snapshot: snapshotOf,

    reissue: (request: SessionRequest & Pick<Request, 'get'>, response, userId, options = {}) => {
        const previous = readSessionCookie(request);
        const ready = options.snapshot
            ? Promise.resolve(options.snapshot)
            : snapshotOf(request, userId);
        return ready
            .then(({ remember }) =>
                mintSession(response, userId, { remember, amr: options.amr, mint: 'remint' })
            )
            .then((issued) => retireRefreshToken(previous).then(() => issued));
    },

    remint: (request, response, userId, { amr, snapshot }) =>
        (snapshot ? Promise.resolve(snapshot) : snapshotOf(request, userId))
            .then(({ remember }) => {
                const maxAgeMs = getCookieMaxAgeMilliseconds(remember);
                return createRefreshToken(userId, remember, [...amr], 'remint').then(
                    (refreshToken) => {
                        createSessionCookie(response, refreshToken, maxAgeMs);
                        createLoggedCookie(response, maxAgeMs);
                    }
                );
            })
            .catch((error: unknown) => {
                logger.warn({
                    message: 'The session change succeeded, but the re-mint failed.',
                    userId,
                    error
                });
            }),

    resolveBearer: resolveWith(verifyAccessToken),
    resolveCookie: resolveWith(verifyRefreshToken),

    credentialOf: readSessionCookie,

    list: (userId, credential) => listSessions('jwt', userId, credential)
};
