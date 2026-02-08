import type { IUser, IUserDocument, IUserMethods } from "../models/users";
import {Require_id} from "mongoose";

declare module "express-session" {
     
    interface SessionData  {
        user?: Require_id<IUser>
    }
}

declare module "express" {
     
    interface Request  {
        user?: IUserDocument & IUserMethods
    }
}
