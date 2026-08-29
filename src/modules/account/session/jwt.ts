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

/*
 * JWT creation and verification. Secrets and TTLs come from `./tokens`, which owns the policy.
 *
 * This was app-level middleware until the domains became modules, and it never belonged there:
 * issuing and verifying this application's tokens is what `account` IS. It reaches `users` for the
 * stored refresh tokens, which is exactly the dependency the manifest already declares.
 */

export interface TokenData {
    id: string;
}

/*
 * Verify an access token (stateless JWT check only).
 * @param token - signed JWT string
 * @returns decoded payload
 */
export const verifyAccessToken = (token: string): Promise<TokenData> =>
    new Promise((resolve, reject) => {
        verify(token, getAccessTokenSecret(), (error, data) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(data as TokenData);
        });
    });

/*
 * Verify a refresh token — JWT check + DB revocation lookup.
 * Rejects with 'Forbidden' if the token is not in the user document.
 * @param token - refresh JWT string
 * @returns decoded payload
 */
export const verifyRefreshToken = (token: string): Promise<TokenData> =>
    new Promise((resolve, reject) => {
        verify(token, getRefreshTokenSecret(), (error, data) => {
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

/*
 * Create a refresh token, sign it, and persist it on the user document.
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
             *
             * The payload is `{ id }` and the claims JWT adds are `iat`/`exp`, both at one-second
             * resolution — so signing twice within a second for one user produced byte-identical
             * tokens. Two devices signing in together therefore shared one credential, stored as
             * two rows holding the same string, and revoking either revoked both: logging out a
             * phone silently logged out the laptop that had signed in alongside it.
             *
             * A random `jti` gives every issued token its own identity, which is what the rest of
             * the token handling already assumes — `tokens.token` is queried as though it
             * addressed one session, and now it does. Verification is unaffected: `jti` is a
             * registered claim that `verify` carries through without checking.
             */
            const token = sign({ id } as TokenData, getRefreshTokenSecret(), {
                expiresIn: getExpiryTime(remember),
                algorithm: 'HS256',
                jwtid: randomUUID()
            });
            return user.tokenAdd(TokenType.REFRESH, getExpiryTimeMilliseconds(remember), token);
        });

/*
 * Stamp a refresh token as used, so `GET /account/sessions` can show which device is idle.
 *
 * Called from the REFRESH route only, never from `createAccessToken` — which login also uses, to
 * mint the first access token of a session. Stamping there would mark every session as used the
 * moment it was issued, and a field that always says "just now" distinguishes nothing. Issuing a
 * session is not the session using one.
 *
 * The write itself is `userRepository.tokenTouch`, which explains why it has to be a positional
 * update rather than a read-modify-write.
 *
 * Resolves even when it fails. This is bookkeeping: a refresh that was valid must not answer 401
 * because a stamp could not be written, which is the same reasoning `getRefreshToken` already
 * applies to `runTokenCleanup`.
 *
 * @param refreshToken - the refresh JWT that was just exchanged
 */
export const recordRefreshTokenUse = (refreshToken: string): Promise<void> =>
    userRepository
        .tokenTouch(refreshToken)
        .then(() => undefined)
        .catch(() => undefined);

/*
 * Exchange a valid refresh token for a short-lived access token.
 * @param refreshToken - previously issued refresh JWT
 * @returns signed access JWT string
 */
export const createAccessToken = (refreshToken: string) =>
    verifyRefreshToken(refreshToken).then(({ id }) =>
        sign({ id } as TokenData, getAccessTokenSecret(), {
            expiresIn: getAccessTokenTTL(),
            algorithm: 'HS256'
        })
    );
