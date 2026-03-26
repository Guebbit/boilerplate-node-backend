import type { IUser } from "@models/users";
import type UserModel from "@models/users";

/**
 * I put the whole user main data in the session to easily access it and for session management
 * (It is done in the controllers/auth/post-login.ts)
 */
declare module "express-session" {
    interface SessionData  {
        user?: IUser & { id: number }
    }
}

/**
 * In the request I put the whole Model instance, to be used to easily retrieve the cart and similar things
 * (It is done in the middleware/session.ts)
 */
declare module "express" {
    interface Request  {
        user?: UserModel
    }
}
