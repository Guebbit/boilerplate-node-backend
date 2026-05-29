/*
 * Token configuration — parse and expose token expiry settings from env.
 */

export enum ERefreshTokenExpiryTime {
    SHORT = 'short',
    MEDIUM = 'medium',
    LONG = 'long'
}

/* Map each token tier to its corresponding env var name. */
const TOKEN_EXPIRY_ENV: Record<ERefreshTokenExpiryTime | 'default', string> = {
    [ERefreshTokenExpiryTime.SHORT]: 'NODE_TOKEN_REFRESH_TIME_SHORT',
    [ERefreshTokenExpiryTime.MEDIUM]: 'NODE_TOKEN_REFRESH_TIME_MEDIUM',
    [ERefreshTokenExpiryTime.LONG]: 'NODE_TOKEN_REFRESH_TIME_LONG',
    default: 'NODE_TOKEN_ACCESS_TIME'
};

/*
 * Get expiry time in seconds for the given token duration tier.
 * Falls back to NODE_TOKEN_ACCESS_TIME when no tier is given.
 * @param remember - optional tier (short/medium/long)
 * @returns seconds as integer, 0 if env var is unset
 */
export const getExpiryTime = (remember?: ERefreshTokenExpiryTime) => {
    const environmentKey = TOKEN_EXPIRY_ENV[remember ?? 'default'];
    const value = process.env[environmentKey];
    return value ? Number.parseInt(value, 10) : 0;
};

/*
 * Millisecond wrapper around getExpiryTime.
 * @param remember - optional tier
 * @returns expiry in ms
 */
export const getExpiryTimeMilliseconds = (remember?: ERefreshTokenExpiryTime) =>
    getExpiryTime(remember) * 1000;

/* Get the access token secret. */
export const getAccessTokenSecret = () => process.env.NODE_TOKEN_ACCESS ?? '';

/* Get the refresh token secret. */
export const getRefreshTokenSecret = () => process.env.NODE_TOKEN_REFRESH ?? '';

/*
 * Get access token TTL in seconds.
 * @returns seconds as integer, 0 if env var is unset
 */
export const getAccessTokenTTL = () =>
    process.env.NODE_TOKEN_ACCESS_TIME
        ? Number.parseInt(process.env.NODE_TOKEN_ACCESS_TIME, 10)
        : 0;
