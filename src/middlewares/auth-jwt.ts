import type { Response } from 'express';
import { sign, verify, decode } from 'jsonwebtoken';
import { userModel as Users, ETokenType, IToken } from '../models/users';
import type { CastError } from 'mongoose';

/**
 *
 * On login you receive an Access Token and a Refresh Token (as cookie).
 *
 * The Access Token ("Authorization" header)
 *  - Is short lived (minutes)
 *  - Is required to do authorize the user
 *  - Is STATELESS. Once issued remain valid but expires naturally
 * The Refresh Token (jwt cookie)
 *  - Is long lived (days)
 *  - Is required to generate a new Access Token
 *  - It can be revoked by removing it from the database
 *
 */

/**
 * Token data composition
 * Id is my custom data and it's the only I need for now
 *
 * exp: expiration time
 * nbf: not before
 * iat: issued at
 */
export interface ITokenData {
    id: string;
}

/**
 * Remember me with different expiry times
 */
export enum ERefreshTokenExpiryTime {
    SHORT = 'short',
    MEDIUM = 'medium',
    LONG = 'long'
}

/**
 * Get expiry time for the token
 *
 * @param remember
 */
const getExpiryTime = (remember?: ERefreshTokenExpiryTime) => {
    switch (remember) {
        // eslint-disable-next-line unicorn/switch-case-braces
        case ERefreshTokenExpiryTime.SHORT:
            return process.env.NODE_REFRESH_TOKEN_SECRET_TIME_SHORT
                ? Number.parseInt(process.env.NODE_REFRESH_TOKEN_SECRET_TIME_SHORT)
                : 0;
        // eslint-disable-next-line unicorn/switch-case-braces
        case ERefreshTokenExpiryTime.MEDIUM:
            return process.env.NODE_REFRESH_TOKEN_SECRET_TIME_MEDIUM
                ? Number.parseInt(process.env.NODE_REFRESH_TOKEN_SECRET_TIME_MEDIUM)
                : 0;
        // eslint-disable-next-line unicorn/switch-case-braces
        case ERefreshTokenExpiryTime.LONG:
            return process.env.NODE_REFRESH_TOKEN_SECRET_TIME_LONG
                ? Number.parseInt(process.env.NODE_REFRESH_TOKEN_SECRET_TIME_LONG)
                : 0;
    }
    // if undefined or none of the above: access time
    return process.env.NODE_ACCESS_TOKEN_SECRET_TIME
        ? Number.parseInt(process.env.NODE_ACCESS_TOKEN_SECRET_TIME)
        : 0;
};

/**
 * Get user info from token
 * NOT an authorization check
 *
 * @param token
 */
export const getTokenData = (token: string) => decode(token);

/**
 * Verify access token
 * Will be used to authenticate the user and create a new refresh token
 *
 * @param token
 */
export const verifyAccessToken = (token: string): Promise<ITokenData> =>
    new Promise((resolve, reject) => {
        verify(token, process.env.NODE_ACCESS_TOKEN_SECRET ?? '', (error, data) => {
            if (error) return reject(error);
            resolve(data as ITokenData);
        });
    });

/**
 * Verify refresh token
 *
 * @param token
 */
export const verifyRefreshToken = (token: string): Promise<ITokenData> =>
    new Promise((resolve, reject) => {
        verify(token, process.env.NODE_REFRESH_TOKEN_SECRET ?? '', (error, data) => {
            // check if token is not invalid by itself
            if (error) {
                reject(error);
                return;
            }
            // Check if token is still valid database-wise
            Users.findOne({
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'tokens.token': token
            })
                .then((user) => {
                    // No need to check if the id in data.id is the same,
                    // it has to be if I found here the token

                    // Check if user has this token or it was removed
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
 * Create a Refresh Token
 *
 * Long-lived token that is used to create Access Tokens.
 * Securely stored in the server.
 * User is not required to login again (unless the token is expired).
 *
 * @param id
 * @param remember
 */
export const createRefreshToken = (id: string, remember?: ERefreshTokenExpiryTime) =>
    Users.findById(id)
        .select('+tokens')
        .then((user) => {
            if (!user) throw new Error('User not found');
            const token = sign(
                {
                    id
                } as ITokenData,
                process.env.NODE_REFRESH_TOKEN_SECRET ?? '',
                {
                    /**
                     * TODO opzione scelta nel login
                     * Short: 604_800 = 7 days
                     * Medium: 2_592_000 = 30 days
                     * Long: 31_536_000 = 1 year
                     */
                    expiresIn: getExpiryTime(remember),
                    algorithm: 'HS256'
                }
            ) as IToken['token'];
            return user.tokenAdd(ETokenType.REFRESH, getExpiryTime(remember) * 1000, token);
        });

/**
 * Secure cookie token that store the refresh token
 *
 * @param response
 * @param token
 * @param remember
 */
export const createRefreshCookie = (
    response: Response,
    token: string,
    remember?: ERefreshTokenExpiryTime
) => {
    response.cookie('jwt', token, {
        // Prevent access to the cookie via JavaScript
        httpOnly: true,
        // Only sends cookie over HTTPS.
        secure: process.env.NODE_ENV === 'production',
        // maxAge is the expiration date from now in milliseconds, meanwhile "expires" is the exact date of expiration
        maxAge: getExpiryTime(remember),
        path: '/'
    });
};

/**
 * Destroy the refresh token cookie
 *
 * @param response
 */
export const destroyRefreshCookie = (response: Response) => {
    response.clearCookie('jwt', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    });
};

/**
 * NON-SECURE cookie just for UI purposes.
 * It just tells us if there is a refresh token and the user should be logged in automatically
 * (since javascript can't access secure tokens and we don't want to make useless calls)
 *
 * @param response
 * @param remember
 */
export const createLoggedCookie = (response: Response, remember?: ERefreshTokenExpiryTime) => {
    response.cookie('isAuth', 'true', {
        maxAge: getExpiryTime(remember),
        path: '/'
    });
};

/**
 * Destroy the logged cookie
 *
 * @param response
 */
export const destroyLoggedCookie = (response: Response) => {
    response.clearCookie('isAuth', {
        path: '/'
    });
};

/**
 * Create an Access Token
 *
 * Short-lived token that authorize users.
 * Stored in client's cookies or storages.
 * Need to be added in the Authorization header for requests.
 *
 * @param refreshToken
 */
export const createAccessToken = (refreshToken: string) =>
    verifyRefreshToken(refreshToken).then(({ id }) =>
        sign(
            {
                id
            } as ITokenData,
            process.env.NODE_ACCESS_TOKEN_SECRET ?? '',
            {
                // 600 = 10 minutes
                expiresIn: process.env.NODE_ACCESS_TOKEN_SECRET_TIME
                    ? Number.parseInt(process.env.NODE_ACCESS_TOKEN_SECRET_TIME)
                    : 0,
                algorithm: 'HS256'
            }
        )
    );
