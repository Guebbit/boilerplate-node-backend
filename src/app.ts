// import all models and their associations
// import "./models/users";
// import "./models/products";
// import "./models/orders";

import 'dotenv/config';
import path from 'path';
import express from 'express';
import type { ErrorRequestHandler, Request, Response, NextFunction } from "express";
import i18next from 'i18next';
import helmet from "helmet";
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { MulterError } from "multer";
import { ExtendedError } from "./utils/error-helpers";
import db from "./utils/db";
import logger from "./utils/winston";
import { session, flash, userConnect } from "./middlewares/session";
import { rateLimiter } from "./middlewares/security";

import productRoutes from "./routes/products";
import authRoutes from "./routes/auth";
import orderRoutes from "./routes/orders";
import cartRoutes from "./routes/cart";
import indexRoutes from "./routes";
import errorRoutes from "./routes/errors";

/**
 * Server start
 */
const app = express();

/**
 * Templating engine
 */
app.set('view engine', 'ejs');
app.set('views', './views');

/**
 * Sync database then start server
 * AFTER sync we can use the database, since it is initialized
 */
db
    .then(() => i18next.init({
        debug: true,
        lng: process.env.NODE_DEFAULT_LOCALE || 'en',
        fallbackLng: process.env.NODE_FALLBACK_LOCALE || 'en',
        resources: {
            en: {
                translation: require("./locales/en.json"),
            }
        }
    }))
    .then(() => {
        console.log("------------- SERVER START -------------");
        app.listen(process.env.NODE_PORT || 3000);
    })
    .catch(err => console.log("------------- SERVER START ERROR -------------", err));


/**
 * The files in /public folder will be served as static
 */
app.use(
    express.static(
        path.join(__dirname, '../public'),
        {
            maxAge: process.env.NODE_ENV === 'production' ? 0 : (process.env.NODE_STATIC_MAXAGE || 0)  // (expressed in seconds)
        }
    )
);

/**
 * Secure headers
 */
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: [
                "'self'"
            ],
            imgSrc: [
                "'self'",
                // allow external src on images
                "https://placekitten.com",
            ],
        }
    }
}));

/**
 * https://www.udemy.com/course/nodejs-the-complete-guide/learn/lecture/11561900#overview
 */
app.use(bodyParser.urlencoded({
    extended: true
}));
// app.use((req, res, next) => {
//     req.on("data", (chunk) => {
//         console.log("------------- REQUEST CHUNK DATA -------------", chunk)
//     });
//     req.on("end", () => {
//         console.log("------------- REQUEST END -------------")
//         // res.statusCode = 200;
//         // res.setHeader("Location", "/");
//         // res.end();
//         next();
//     });
// });


/**
 * Parse and secure cookies
 */
app.use(cookieParser());

/**
 * Session
 */
app.use(session);

/**
 * Flash
 */
app.use(flash);

/**
 * Connect user (optimize data retrieve)
 */
app.use(userConnect);

/**
 * Security
 * Limit user to access multiple times and overload the server
 */
app.use(rateLimiter);

/**
 * Generic middleware
 *
 * next() required to proceed in the chain,
 * otherwise response will be sent and connection with client closed
 */
app.use((req, res, next) => {
    console.log("------------- CONNECTION START -------------");
    next();
});

app.use('/products', productRoutes);
app.use('/account', authRoutes);
app.use('/orders', orderRoutes);
app.use('/', cartRoutes);
app.use('/', indexRoutes);
app.use('/error', errorRoutes);

/**
 * Error handler.
 * Distinguish operational error from critical programmer error
 * Operational error: User redirected to error page explaining the problem
 * Critical errors: Error documented for later study, then current worker is suppressed so a new one is born (from cluster management)
 */
app.use((error: ErrorRequestHandler | ExtendedError | MulterError, req: Request, res: Response, next: NextFunction) => {
    // If headers already has been sent (shouldn't happen) delegate to the default Express error handler
    if (res.headersSent)
        return next(error);

    // File upload error
    if(error instanceof MulterError){
        logger.info(error);
        req.flash('error-title', [error.code]);
        req.flash('error-description', [error.name + ": " + error.message + " on " + error.field]);
        res.status(400).redirect("/error/");
        return;
    }

    // Check if the error is operational
    if (error instanceof ExtendedError && error.isOperational){
        logger.info(error);
        req.flash('error-title', [error.name]);
        req.flash('error-description', [error.description]);
        res.status(error.httpCode).redirect("/error/");
        return;
    }

    // Dangerous error, must be documented fully
    logger.error({
        ...error,
        stack: error instanceof ExtendedError ? error.stack : "",
    });
    req.flash('error-title', ['UNKNOWN ERROR']);
    req.flash('error-description', ['Something happened. Please contact support']);
    res.status(500).redirect("/error/");
    // Terminate the current process signaling that it has exited with an error.
    process.exit(1);
});



/**
 * Catch all routes
 */
app.use('/', (req, res) =>
    res.redirect("/error/page-not-found"));

/**
 * Error handling LAST RESORT
 * Nothing should go there.
 */
const unhandledRejections = new Map();
process
    // emitted when the list of unhandled rejections grows
    .on('unhandledRejection', (reason, promise) => {
        // helps prevent promises from failing silently, ensuring that every rejection is either accounted for or resolved
        logger.error(reason);
        unhandledRejections.set(promise, reason);
    })
    // emitted when the list of unhandled rejections shrinks.
    .on('rejectionHandled', (promise) =>
        unhandledRejections.delete(promise)
    )
    // safeguard against unexpected errors that could crash the application
    .on('uncaughtException', (error, origin) => {
        // if development: no need (otherwise I would log all test errors + node server closing
        if(process.env.NODE_ENV !== 'production')
            return;
        logger.error({
            error,
            origin
        });
        process.exit(1);
    });