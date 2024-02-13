/**
 * WARNING: order of import and use is important.
 * - express
 * - express-session
 * - connect-flash
 */
import expressSession from "express-session";
import connectFlash from "connect-flash";
import db from './db';
import type { Request, Response, NextFunction } from "express";
import Users from "../models/users";

/**
 * Sequelize connection
 */
const SequelizeStore = require("connect-session-sequelize")(expressSession.Store);

/**
 *
 */
export const store = new SequelizeStore({
    db,
    // The interval at which to clean up expired sessions in milliseconds.
    checkExpirationInterval: 15 * 60 * 1000,
    // The maximum age (in milliseconds) of a valid session.
    expiration: 24 * 60 * 60 * 1000,
});

/**
 *
 */
export const session = expressSession({
    secret: process.env.NODE_SESSION_SECRET || "",
    resave: false,
    saveUninitialized: false,
    /**
     *  If you do SSL outside of node, like using NGINX, X-Forwarded-Proto cookie, etc
     *  WARNING: If Proxy is false and every refresh of page create a new session,
     *           then proxy has to be true
     */
    proxy: true,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 1 month
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: true,
    },
    store,
});

/**
 *
 */
export const flash = connectFlash();

/**
 * Store user model in req (don't like it, but seems the standard since session can't store the model)
 * @param req
 * @param res
 * @param next
 */
export const userConnect = (req: Request, res: Response, next: NextFunction) => {
    // flash messages
    res.locals.errorMessages = req.flash('error');
    res.locals.successMessages = req.flash('success');
    // only authorized
    if(!req.session.user)
        return next();
    Users.findByPk(req.session.user.id)
        .then((user) => {
            if(!user)
                throw "error";
            // to show user data through the UI
            res.locals.currentUser = req.session.user;
            res.locals.isAuthenticated = true;
            res.locals.isAdmin = req.session.user?.admin;
            // user model
            req.user = user;
            return user;
        })
        // proceed
        .then(() => next())
};