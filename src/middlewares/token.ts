import { sign, verify } from 'jsonwebtoken';
import { userModel as Users, ETokenType } from '@models/users';
import type { IToken } from '@models/users';
import type { CastError } from 'mongoose';
import {
    getAccessTokenSecret,
    getRefreshTokenSecret,
    getAccessTokenTTL,
    getExpiryTime,
    getExpiryTimeMilliseconds
} from '@utils/token-config';
import type { ERefreshTokenExpiryTime } from '@utils/token-config';

/*
 * Token Service — JWT creation and verification only.
 * Config (secrets, TTLs) is delegated to token-config.
 */

export interface ITokenData {
    id: string;
}

export {
    ERefreshTokenExpiryTime,
    getExpiryTime,
    getExpiryTimeMilliseconds
} from '@utils/token-config';

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
            const token = sign({ id } as ITokenData, getRefreshTokenSecret(), {
                expiresIn: getExpiryTime(remember),
                algorithm: 'HS256'
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
