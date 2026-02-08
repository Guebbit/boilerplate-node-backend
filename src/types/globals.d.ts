import Users from "../models/users";

declare module "express-session" {
     
    interface SessionData  {
        user?: Users,
        csrfToken?: string,
    }
}

declare module "express" {
     
    interface Request  {
        user?: Users
    }
}