/**
 * WARNING: order of import and use is important.
 * - express
 * - express-session
 * - connect-flash
 */
import expressSession from "express-session";
import connectFlash from "connect-flash";
import MongoStore from 'connect-mongo';
import type { Request, Response, NextFunction } from "express";
import { generateToken } from "./csrf";
import UserRepository from "@repositories/users";

/**
 * MongoDB session store
 */
export const store = MongoStore.create({
    mongoUrl: process.env.NODE_DB_URI ?? "",
    collectionName: "sessions",
});

/**
 * Session storage and cookies
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
        // In mongodb, session expiration is tied with the cookie expiration
        maxAge: process.env.NODE_SESSION_MAXAGE ? Number.parseInt(process.env.NODE_SESSION_MAXAGE) : 86_400_000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: true,
    },
    store,
});

/**
 * connect-flash
 */
export const flash = connectFlash();

/**
 * Store user model in req
 * (don't like it, but seems the standard since session can't store the model)
 *
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
    UserRepository.findById(request.session.user._id.toString())
        .then((user) => {
            if(!user)
                return request.session.destroy(() => response.redirect('/'));
            // to show user data through the UI
            response.locals.currentUser = request.session.user;
            response.locals.isAuthenticated = true;
            response.locals.isAdmin = request.session.user?.admin;
            // user model in the request to
            request.user = user;
            return user;
        })
        // proceed
        .then(() => next())
        .catch(() => response.status(500).redirect('/errors/unknown'))
};