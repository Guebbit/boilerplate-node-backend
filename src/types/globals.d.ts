import Users from "../models/users";

declare module "express-session" {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    interface SessionData  {
        user?: Users,
        csrfToken?: string,
    }
}

declare module "express" {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    interface Request  {
        user?: Users
    }
}