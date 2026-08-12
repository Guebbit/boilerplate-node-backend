import { randomUUID } from 'node:crypto';
import { sign, verify } from 'jsonwebtoken';
import { userModel as Users, ETokenType } from '@modules/users';
import type { IToken } from '@modules/users';
import type { CastError } from 'mongoose';
import {
    getAccessTokenSecret,
    getRefreshTokenSecret,
    getAccessTokenTTL,
    getExpiryTime,
    getExpiryTimeMilliseconds
} from './tokens';
import type { ERefreshTokenExpiryTime } from './tokens';

/*
 * JWT creation and verification. Secrets and TTLs come from `./tokens`, which owns the policy.
 *
 * This was app-level middleware until the domains became modules, and it never belonged there:
 * issuing and verifying this application's tokens is what `account` IS. It reaches `users` for the
 * stored refresh tokens, which is exactly the dependency the manifest already declares.
 */

export interface ITokenData {
    id: string;
}

export { ERefreshTokenExpiryTime, getExpiryTime, getExpiryTimeMilliseconds } from './tokens';

/*
 * Verify an access token (stateless JWT check only).
 * @param token - signed JWT string
 * @returns decoded payload
 */
export const verifyAccessToken = (token: string): Promise<ITokenData> =>
    new Promise((resolve, reject) => {
        verify(token, getAccessTokenSecret(), (error, data) => {
            if (error) return reject(error);
            resolve(data as ITokenData);
        });
    });

/*
 * Verify a refresh token — JWT check + DB revocation lookup.
 * Rejects with 'Forbidden' if the token is not in the user document.
 * @param token - refresh JWT string
 * @returns decoded payload
 */
export const verifyRefreshToken = (token: string): Promise<ITokenData> =>
    new Promise((resolve, reject) => {
        verify(token, getRefreshTokenSecret(), (error, data) => {
            if (error) {
                reject(error);
                return;
            }
            Users.findOne({
                'tokens.token': token
            })
                .then((user) => {
                    if (!user) {
                        reject(new Error('Forbidden'));
                        return;
                    }
                    resolve(data as ITokenData);
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
export const createRefreshToken = (id: string, remember?: ERefreshTokenExpiryTime) =>
    Users.findById(id)
        .select('+tokens')
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
            const token = sign({ id } as ITokenData, getRefreshTokenSecret(), {
                expiresIn: getExpiryTime(remember),
                algorithm: 'HS256',
                jwtid: randomUUID()
            }) as IToken['token'];
            return user.tokenAdd(ETokenType.REFRESH, getExpiryTimeMilliseconds(remember), token);
        });

/*
 * Exchange a valid refresh token for a short-lived access token.
 * @param refreshToken - previously issued refresh JWT
 * @returns signed access JWT string
 */
export const createAccessToken = (refreshToken: string) =>
    verifyRefreshToken(refreshToken).then(({ id }) =>
        sign({ id } as ITokenData, getAccessTokenSecret(), {
            expiresIn: getAccessTokenTTL(),
            algorithm: 'HS256'
        })
    );
