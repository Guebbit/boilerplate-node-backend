<<<<<<< HEAD
import type { Response } from 'express';
import { sign, verify, decode } from 'jsonwebtoken';
import { userModel as Users, ETokenType, type IToken } from '@models/users';
import type { CastError } from 'mongoose';

=======
>>>>>>> origin/main
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
