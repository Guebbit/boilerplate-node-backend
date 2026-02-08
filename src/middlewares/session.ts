/**
 * WARNING: order of import and use is important.
 * - express
 * - express-session
 * - connect-flash
 */
import expressSession from "express-session";
import initSessionSequelize from "connect-session-sequelize";
import connectFlash from "connect-flash";
import database from '../utils/database';
import type { Request, Response, NextFunction } from "express";
import Users from "../models/users";
import { generateToken } from "./csrf";
import {databaseErrorConverter} from "../utils/error-helpers";
import type {DatabaseError, ValidationError} from "sequelize";

/**
 * Sequelize connection
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
const SequelizeStore = initSessionSequelize(expressSession.Store);

/**
 *
 */
export const store = new SequelizeStore({
    db: database,
    // The interval at which to clean up expired sessions in milliseconds.
    // @ts-expect-error difficulties with sequelize inferred types
    checkExpirationInterval: 900_000,
    // The maximum age (in milliseconds) of a valid session.
    expiration: process.env.NODE_SESSION_MAXAGE ? Number.parseInt(process.env.NODE_SESSION_MAXAGE) : 86_400_000,
});

/**
 *
 */
export const session = expressSession({
    secret: process.env.NODE_SESSION_SECRET ?? "",
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
        maxAge: process.env.NODE_COOKIE_MAXAGE ? Number.parseInt(process.env.NODE_COOKIE_MAXAGE) : 86_400_000,
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
 * Store user model in request (don't like it, but seems the standard since session can't store the model)
 * @param request
 * @param response
 * @param next
 */
export const userConnect = (request: Request, response: Response, next: NextFunction) => {
    // it will be requested only on certain POST requests, but it is not a problem to put it here
    response.locals.csrfToken = generateToken(request)
    // flash messages
    response.locals.errorMessages = request.flash('error');
    response.locals.successMessages = request.flash('success');
    // only authorized
    if(!request.session.user){
        response.locals.currentUser = {};
        response.locals.isAuthenticated = false;
        response.locals.isAdmin = false;
        next();
        return;
    }
    return Users.findByPk(request.session.user.id)
        .then((user) => {
            if(!user)
                return request.session.destroy(() => response.redirect('/'));
            // to show user data through the UI
            response.locals.currentUser = request.session.user;
            response.locals.isAuthenticated = true;
            response.locals.isAdmin = request.session.user?.admin;
            // user model
            request.user = user;
            // return user;
        })
        // proceed
        .then(() => next())
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))
};