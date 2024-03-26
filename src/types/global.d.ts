import Users from "../models/users";

declare module "express-session" {
    // eslint-disable-next-line
    interface SessionData  {
        user?: Users.dataValues,
        csrfToken?: string,
    }
}

declare module "express" {
    // eslint-disable-next-line
    interface Request  {
        user?: Users
    }
}