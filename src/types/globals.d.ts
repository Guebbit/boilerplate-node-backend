import type { IUser, IUserDocument, IUserMethods } from "../models/users";
import {Require_id} from "mongoose";

declare module "express-session" {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    interface SessionData  {
        user?: Require_id<IUser>
    }
}

declare module "express" {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    interface Request  {
        user?: IUserDocument & IUserMethods
    }
}
