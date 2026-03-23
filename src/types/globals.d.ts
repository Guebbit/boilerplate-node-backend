import type { IUser, IUserDocument } from "@models/users";

declare module "express-session" {
     
    interface SessionData  {
        user?: IUser
    }
}

declare module "express" {
     
    interface Request  {
        user?: IUserDocument
    }
}
