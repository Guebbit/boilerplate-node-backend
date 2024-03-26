/**
 * WARNING: order of import and use is important.
 * - express
 * - express-session
 * - connect-flash
 */
import expressSession from "express-session";
import connectFlash from "connect-flash";
import db from '../utils/db';
import type { Request, Response, NextFunction } from "express";
import Users from "../models/users";

/**
 * Sequelize connection
 */
// eslint-disable-next-line
const SequelizeStore = require("connect-session-sequelize")(expressSession.Store);

/**
 *
 */
export const store = new SequelizeStore({
    db,
    // The interval at which to clean up expired sessions in milliseconds.
    checkExpirationInterval: 900000,
    // The maximum age (in milliseconds) of a valid session.
    expiration: process.env.NODE_SESSION_MAXAGE ? parseInt(process.env.NODE_SESSION_MAXAGE) : 86400000,
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
        // Cookie duration in milliseconds
        maxAge: process.env.NODE_COOKIE_MAXAGE ? parseInt(process.env.NODE_COOKIE_MAXAGE) : 86400000,
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
    res.locals.csrfToken = "0"; //TODO
    // flash messages
    res.locals.errorMessages = req.flash('error');
    res.locals.successMessages = req.flash('success');
    // only authorized
    if(!req.session.user){
        res.locals.currentUser = {};
        res.locals.isAuthenticated = false;
        res.locals.isAdmin = false;
        return next();
    }
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