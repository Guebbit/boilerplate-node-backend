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
import type { Types } from 'mongoose';
import { readSessionCookie } from '@kernel/cookies';
import type { Resolution } from '@kernel/authentication';
import { logger } from '@infrastructure/adapters/logger';
import { hashToken } from '@infrastructure/security/hash-token';
import type { AuthContext } from '@types';
import { sessionRepository } from '../repository';
import {
    startSession,
    continueSession,
    createAccessToken,
    rememberOfRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    TokenRejection,
    type TokenData
} from './jwt';
import { createSessionCookie, createLoggedCookie } from './cookies';
import { getCookieMaxAgeMilliseconds, type RefreshTokenExpiryTime } from './config';
import { resolveProof } from './auth-context';
import { listSessions } from './listing';
import type { IssuedSession, SessionRequest, SessionSnapshot, SessionStrategy } from './strategy';

/**
 * Mint a refresh token, set its cookies, and exchange it for an access token.
 *
 * @param response - the live response to set the refresh/logged cookies on
 * @param userId - whose session this is
 * @param amr - the proofs the session claims
 * @param remember - the tier, absent for a browser-session login
 * @param mint - {@link startSession} (guarded) for a login, {@link continueSession} for a re-mint
 * @param continued - what the replaced session carried, so the cookie lasts as long as it would have
 * @returns the access token to hand back in the body, and the refresh token behind it
 */
const mintSession = (
    response: Response,
    userId: string,
    amr: readonly string[],
    remember: RefreshTokenExpiryTime | undefined,
    mint: (
        id: string,
        amr: readonly string[],
        remember?: RefreshTokenExpiryTime,
        continued?: SessionSnapshot
    ) => Promise<string>,
    continued?: SessionSnapshot
): Promise<{ issued: IssuedSession; refreshToken: string }> =>
    mint(userId, amr, remember, continued).then((refreshToken) => {
        const maxAgeMs = cookieMaxAgeOf(remember, continued);
        createSessionCookie(response, refreshToken, maxAgeMs);
        createLoggedCookie(response, maxAgeMs);
        return createAccessToken(refreshToken).then((token) => ({
            issued: { token },
            refreshToken
        }));
    });

/**
 * How long the session cookie lives: the tier's length for a new session, what is left of the
 * continued one otherwise. `undefined` stays a browser-session cookie.
 */
const cookieMaxAgeOf = (
    remember: RefreshTokenExpiryTime | undefined,
    continued: SessionSnapshot | undefined
): number | undefined =>
    remember && continued?.expiresAt
        ? Math.max(continued.expiresAt.getTime() - Date.now(), 1000)
        : getCookieMaxAgeMilliseconds(remember);

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
 * After a re-proof, delete every row of the session's family except the successor just stored.
 * Logged, not raised, like {@link retireRefreshToken}: the new session exists.
 */
const retireRestOfFamily = (
    userId: string,
    familyId: Types.ObjectId,
    successor: string
): Promise<void> =>
    sessionRepository
        .removeFamilyExcept(userId, String(familyId), hashToken(successor))
        .then(() => undefined)
        .catch((error: unknown) => {
            logger.warn({ message: 'Could not retire the replaced session rows.', error });
        });

/**
 * A sign-in on top of a live session ends that session, whole family included: the browser is no
 * longer using it. Stored-first like `reissue`; a failure is logged, the new session exists.
 *
 * @param refreshToken - the refresh cookie the request carried, if any
 */
const retirePresentedSession = (refreshToken: string | undefined): Promise<void> =>
    refreshToken
        ? sessionRepository
              .removeFamilyByHash(hashToken(refreshToken))
              .then(() => undefined)
              .catch((error: unknown) => {
                  logger.warn({
                      message: 'Could not retire the session this sign-in replaced.',
                      error
                  });
              })
        : Promise.resolve();

/**
 * What the session behind a refresh cookie carries — its tier, family, start and expiry — so a
 * re-mint continues it instead of starting a fresh one. Read BEFORE the change that ends it: a
 * password change deletes the row. Without a live row of this account the answer is the tier alone.
 */
const snapshotOf = (request: SessionRequest, userId: string): Promise<SessionSnapshot> => {
    const credential = readSessionCookie(request);
    return rememberOfRefreshToken(credential, userId).then((remember) =>
        (credential
            ? sessionRepository.findByHash(hashToken(credential))
            : Promise.resolve(undefined)
        ).then((row) => ({
            ...(remember && { remember }),
            ...(row?.mode === 'jwt' &&
                String(row.userId) === userId && {
                    familyId: row.familyId,
                    startedAt: row.startedAt,
                    expiresAt: row.expiresAt
                })
        }))
    );
};

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

/**
 * The bearer's resolver: the token must verify, and the session family it names must still be
 * alive, so revoking a session stops its access tokens at once, not when they expire. The `sid` is
 * ours (the signature vouches for it), so it is always a well-formed id.
 */
const resolveBearer = (token: string): Promise<Resolution<AuthContext | undefined>> =>
    verifyAccessToken(token).then(
        (claims) =>
            Promise.all([
                sessionRepository.familyIsLive(claims.id, claims.sid, new Date()),
                resolveProof(claims.id, { authTime: claims.auth_time, amr: claims.amr })
            ]).then(
                ([live, ok]): Resolution<AuthContext | undefined> =>
                    live ? { ok } : { miss: 'revoked' }
            ),
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

    issue: (request, response, userId, { amr, remember, provedAt }) =>
        mintSession(response, userId, amr, remember, (id, proofs, tier) =>
            startSession(id, proofs, tier, provedAt)
        ).then(({ issued }) =>
            retirePresentedSession(readSessionCookie(request)).then(() => issued)
        ),

    snapshot: snapshotOf,

    reissue: (request: SessionRequest & Pick<Request, 'get'>, response, userId, options) => {
        const previous = readSessionCookie(request);
        const ready = options.snapshot
            ? Promise.resolve(options.snapshot)
            : snapshotOf(request, userId);
        return ready.then((snapshot) =>
            mintSession(
                response,
                userId,
                options.amr,
                snapshot.remember,
                continueSession,
                snapshot
            ).then(({ issued, refreshToken }) =>
                // The successor joined the family: drop its other rows, never the family.
                (snapshot.familyId
                    ? retireRestOfFamily(userId, snapshot.familyId, refreshToken)
                    : retireRefreshToken(previous)
                ).then(() => issued)
            )
        );
    },

    remint: (request, response, userId, { amr, snapshot }) =>
        (snapshot ? Promise.resolve(snapshot) : snapshotOf(request, userId))
            .then((snapshot) => {
                const { remember } = snapshot;
                const maxAgeMs = cookieMaxAgeOf(remember, snapshot);
                return continueSession(userId, amr, remember, snapshot).then((refreshToken) => {
                    createSessionCookie(response, refreshToken, maxAgeMs);
                    createLoggedCookie(response, maxAgeMs);
                });
            })
            .catch((error: unknown) => {
                logger.warn({
                    message: 'The session change succeeded, but the re-mint failed.',
                    userId,
                    error
                });
            }),

    resolveBearer,
    resolveCookie: resolveWith(verifyRefreshToken),

    credentialOf: readSessionCookie,

    list: (userId, credential) => listSessions('jwt', userId, credential)
};
