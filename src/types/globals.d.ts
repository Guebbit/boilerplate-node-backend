import type { IUser, IUserDocument, IUserMethods } from "../models/users";
import { Types } from "mongoose";

declare module "express-session" {
    // eslint-disable-next-line
    interface SessionData  {
        user?: IUser & { _id: Types.ObjectId },
        csrfToken?: string,
    }
}

declare module "express" {
    // eslint-disable-next-line
    interface Request  {
        user?: IUserDocument & IUserMethods
    }
}
