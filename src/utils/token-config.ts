/**
 * Token configuration utilities.
 * Single responsibility: parse and expose token expiry settings from env.
 */

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
 * Get the access token secret.
 */
export const getAccessTokenSecret = () => process.env.NODE_TOKEN_ACCESS ?? '';

/**
 * Get the refresh token secret.
 */
export const getRefreshTokenSecret = () => process.env.NODE_TOKEN_REFRESH ?? '';

/**
 * Get access token TTL in seconds.
 */
export const getAccessTokenTTL = () =>
    process.env.NODE_TOKEN_ACCESS_TIME
        ? Number.parseInt(process.env.NODE_TOKEN_ACCESS_TIME)
        : 0;
