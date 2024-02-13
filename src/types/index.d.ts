import Users from "../models/users";
import Cart from "../models/cart";

declare module "express-session" {
    interface SessionData  {
        user?: Users.dataValues,
        csrfToken?: string,
    }
}

declare module "express" {
    interface Request  {
        user?: Users
    }
}
