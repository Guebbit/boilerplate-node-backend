import type { IUser, IUserDocument } from "@models/users";
import {Require_id} from "mongoose";

/**
 * I put the whole user main data in the session to easily access it and for session management
 * (It is done in the controllers/auth/post-login.ts)
 *
 * NOTE: Session is kept for backward compatibility but JWT auth is preferred for REST API
 */
declare module "express-session" {
    interface SessionData  {
        user?: Require_id<IUser>
    }
}

/**
 * In the request I put the whole Document, to be used to easily retrieve the cart and similar things
 * For REST API: populated by JWT middleware (middlewares/jwt-auth.ts)
 * For MVC: populated by session middleware (middlewares/session.ts)
 */
declare module "express" {
    interface Request  {
        user?: IUserDocument
    }
}
