import { sign, verify } from 'jsonwebtoken';
import { userModel as Users, ETokenType } from '@models/users';
import type { IToken } from '@models/users';
import type { CastError } from 'mongoose';

/**
 * Token Service
 * Single responsibility: JWT token creation and verification.
 * Decoupled from cookie/transport behavior.
 */

export interface ITokenData {
    id: string;
}

export enum ERefreshTokenExpiryTime {
    SHORT = 'short',
    MEDIUM = 'medium',
    LONG = 'long'
}

/**
 * Get expiry time in seconds for the given token duration tier.
 */
export const getExpiryTime = (remember?: ERefreshTokenExpiryTime) => {
    switch (remember) {
        // eslint-disable-next-line unicorn/switch-case-braces
        case ERefreshTokenExpiryTime.SHORT:
            return process.env.NODE_TOKEN_REFRESH_TIME_SHORT
                ? Number.parseInt(process.env.NODE_TOKEN_REFRESH_TIME_SHORT)
                : 0;
        // eslint-disable-next-line unicorn/switch-case-braces
        case ERefreshTokenExpiryTime.MEDIUM:
            return process.env.NODE_TOKEN_REFRESH_TIME_MEDIUM
                ? Number.parseInt(process.env.NODE_TOKEN_REFRESH_TIME_MEDIUM)
                : 0;
        // eslint-disable-next-line unicorn/switch-case-braces
        case ERefreshTokenExpiryTime.LONG:
            return process.env.NODE_TOKEN_REFRESH_TIME_LONG
                ? Number.parseInt(process.env.NODE_TOKEN_REFRESH_TIME_LONG)
                : 0;
    }
    return process.env.NODE_TOKEN_ACCESS_TIME
        ? Number.parseInt(process.env.NODE_TOKEN_ACCESS_TIME)
        : 0;
};

/**
 * Convert token expiry from seconds to milliseconds.
 */
export const getExpiryTimeMilliseconds = (remember?: ERefreshTokenExpiryTime) =>
    getExpiryTime(remember) * 1000;

/**
 * Verify an access token (stateless).
 */
export const verifyAccessToken = (token: string): Promise<ITokenData> =>
    new Promise((resolve, reject) => {
        verify(token, process.env.NODE_TOKEN_ACCESS ?? '', (error, data) => {
            if (error) return reject(error);
            resolve(data as ITokenData);
        });
    });

/**
 * Verify a refresh token (stateful — checks DB revocation).
 */
export const verifyRefreshToken = (token: string): Promise<ITokenData> =>
    new Promise((resolve, reject) => {
        verify(token, process.env.NODE_TOKEN_REFRESH ?? '', (error, data) => {
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

/**
 * Create a refresh token and persist it on the user document.
 */
export const createRefreshToken = (id: string, remember?: ERefreshTokenExpiryTime) =>
    Users.findById(id)
        .select('+tokens')
        .then((user) => {
            if (!user) throw new Error('User not found');
            const token = sign(
                { id } as ITokenData,
                process.env.NODE_TOKEN_REFRESH ?? '',
                {
                    expiresIn: getExpiryTime(remember),
                    algorithm: 'HS256'
                }
            ) as IToken['token'];
            return user.tokenAdd(ETokenType.REFRESH, getExpiryTime(remember) * 1000, token);
        });

/**
 * Create an access token from a valid refresh token.
 */
export const createAccessToken = (refreshToken: string) =>
    verifyRefreshToken(refreshToken).then(({ id }) =>
        sign(
            { id } as ITokenData,
            process.env.NODE_TOKEN_ACCESS ?? '',
            {
                expiresIn: process.env.NODE_TOKEN_ACCESS_TIME
                    ? Number.parseInt(process.env.NODE_TOKEN_ACCESS_TIME)
                    : 0,
                algorithm: 'HS256'
            }
        )
    );
