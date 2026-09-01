/**
 * @module
 * JWT creation and verification. Secrets and TTLs come from `./config`, which owns the policy.
 * This was app-level middleware until the domains became modules — issuing and verifying this
 * application's tokens is what `account` IS, and it reaches `users` for the stored refresh
 * tokens, exactly the dependency the manifest already declares. See
 * docs/modules/account-sessions.md.
 */

import { randomUUID } from 'node:crypto';
import { sign, verify } from 'jsonwebtoken';
import { userRepository, TokenType } from '@modules/users';
import type { CastError } from 'mongoose';
import {
    getAccessTokenSecret,
    getRefreshTokenSecret,
    getAccessTokenTTL,
    getExpiryTime,
    getExpiryTimeMilliseconds
} from './config';
import type { RefreshTokenExpiryTime } from './config';

/** The claims this app puts in every access/refresh JWT — just the subject's id. */
export interface TokenData {
    id: string;
}

/**
 * Verify an access token (stateless JWT check only).
 *
 * @param token - signed JWT string
 * @returns decoded payload
 */
export const verifyAccessToken = (token: string): Promise<TokenData> =>
    new Promise((resolve, reject) => {
        // jsonwebtoken: callback-style verify — signature and expiry only, no DB round trip.
        // `algorithms: ['HS256']` pins the accepted algorithm: without it a token whose header
        // claims `alg: none` or an asymmetric algorithm can pass verification under some library
        // configurations (the classic JWT "algorithm confusion" attack).
        verify(token, getAccessTokenSecret(), { algorithms: ['HS256'] }, (error, data) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(data as TokenData);
        });
    });

/**
 * Verify a refresh token — JWT check + DB revocation lookup.
 * Rejects with 'Forbidden' if the token is not in the user document.
 *
 * @param token - refresh JWT string
 * @returns decoded payload
 */
export const verifyRefreshToken = (token: string): Promise<TokenData> =>
    new Promise((resolve, reject) => {
        // `algorithms: ['HS256']` — same rationale as `verifyAccessToken` above.
        verify(token, getRefreshTokenSecret(), { algorithms: ['HS256'] }, (error, data) => {
            if (error) {
                reject(error);
                return;
            }
            userRepository
                .findByTokenValue(token)
                .then((user) => {
                    if (!user) {
                        reject(new Error('Forbidden'));
                        return;
                    }
                    resolve(data as TokenData);
                })
                .catch((error: Error | CastError) => reject(error));
        });
    });

/**
 * Create a refresh token, sign it, and persist it on the user document.
 *
 * @param id - user ID
 * @param remember - optional expiry tier
 * @returns updated user document
 */
export const createRefreshToken = (id: string, remember?: RefreshTokenExpiryTime) =>
    userRepository
        // Credentials included: minting a session pushes onto this document's `tokens`.
        .findByIdWithCredentials(id)
        .then((user) => {
            if (!user) throw new Error('User not found');
            /*
             * `jwtid` is what makes two refresh tokens minted in the same second different.
             * The payload is `{ id }` plus JWT's own `iat`/`exp`, both at one-second resolution —
             * so signing twice within a second for one user produced byte-identical tokens. Two
             * devices signing in together then shared one credential stored as two identical
             * rows, and revoking either revoked both: logging out a phone silently logged out the
             * laptop signed in alongside it. A random `jti` gives every token its own identity —
             * `tokens.token` is now queried as though it addressed one session, because it does;
             * `verify` carries `jti` through without checking it.
             */
            const token = sign({ id } as TokenData, getRefreshTokenSecret(), {
                expiresIn: getExpiryTime(remember),
                algorithm: 'HS256',
                jwtid: randomUUID()
            });
            return user.tokenAdd(TokenType.REFRESH, getExpiryTimeMilliseconds(remember), token);
        });

/**
 * Stamp a refresh token as used, so `GET /account/sessions` can show which device is idle.
 * Called from the REFRESH route only, never from `createAccessToken` (which login also uses to
 * mint a session's first access token) — stamping there would mark every session "just now" the
 * moment it's issued, distinguishing nothing.
 * Resolves even on failure: a valid refresh must not 401 because this bookkeeping write failed —
 * same reasoning `getRefreshToken` applies to `runTokenCleanup`.
 * @param refreshToken - the refresh JWT that was just exchanged
 */
export const recordRefreshTokenUse = (refreshToken: string): Promise<void> =>
    userRepository
        .tokenTouch(refreshToken)
        .then(() => undefined)
        .catch(() => undefined);

/**
 * Exchange a valid refresh token for a short-lived access token.
 *
 * @param refreshToken - previously issued refresh JWT
 * @returns signed access JWT string
 */
export const createAccessToken = (refreshToken: string) =>
    verifyRefreshToken(refreshToken).then(({ id }) =>
        sign({ id } as TokenData, getAccessTokenSecret(), {
            // Seconds, not ms — this app's own TTL config, not a jsonwebtoken magic number.
            expiresIn: getAccessTokenTTL(),
            algorithm: 'HS256'
        })
    );
