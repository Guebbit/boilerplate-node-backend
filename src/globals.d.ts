import type { IUser, IUserDocument } from '@models/users';
import { Require_id } from 'mongoose';

/**
 * I put the whole user main data in the session to easily access it and for session management
 * (It is done in the controllers/account/post-login.ts)
 */
declare module 'express-session' {
    interface SessionData {
        user?: Require_id<IUser>;
    }
}

/**
 * In the request I put the whole Document, to be used to easily retrieve the cart and similar things
 * (It is done in the middleware/session.ts)
 */
declare module 'express' {
    interface Request {
        user?: IUserDocument;
    }
}
