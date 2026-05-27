/**
 * Auth JWT — barrel module.
 * Re-exports from focused token and cookie modules (SRP).
 * Consumers can import from here for backward compatibility,
 * or directly from @middlewares/token and @middlewares/cookie.
 */
export {
    type ITokenData,
    ERefreshTokenExpiryTime,
    getExpiryTime,
    getExpiryTimeMilliseconds,
    getTokenData,
    verifyAccessToken,
    verifyRefreshToken,
    createRefreshToken,
    createAccessToken
} from './token';

export {
    createRefreshCookie,
    destroyRefreshCookie,
    createLoggedCookie,
    destroyLoggedCookie
} from './cookie';
