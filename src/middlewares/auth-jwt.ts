/**
 * Auth JWT — barrel module.
 *
 * `./token` and `./cookie` hold the implementations (SRP); this is the import path everything
 * actually uses, and nothing imports those two directly. Not a compatibility shim — it is the
 * module's front door, so adding a third concern here means adding a file, not widening one.
 */
export {
    type ITokenData,
    ERefreshTokenExpiryTime,
    getExpiryTime,
    getExpiryTimeMilliseconds,
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
