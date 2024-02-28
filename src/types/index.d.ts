import type { IUser, IUserDocument, IUserMethods } from "../models/users";
import { Types } from "mongoose";

declare module "express-session" {
    interface SessionData  {
        user?: IUser & { _id: Types.ObjectId },
        csrfToken?: string,
    }
}

declare module "express" {
    interface Request  {
        user?: IUserDocument & IUserMethods
    }
}
