#!/usr/bin/env node

import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import type { ErrorRequestHandler, Request, Response, NextFunction } from "express";
import i18next from 'i18next';
import helmet from "helmet";
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { MulterError } from "multer";
import { ExtendedError } from "@utils/error-helpers";
import { start } from "@utils/database";
import logger from "@utils/winston";
import { getDirname } from "@utils/get-file-url";
import { session, flash, userConnect } from "./middlewares/session";
import { rateLimiter } from "./middlewares/security";
// languages
import enTranslation from './locales/en.json';
// routes
import productRoutes from "./routes/products";
import authRoutes from "./routes/auth";
import orderRoutes from "./routes/orders";
import cartRoutes from "./routes/cart";
import systemRoutes from "./routes";
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
start()
    .then(() => i18next.init({
        // debug: true,
        lng: process.env.NODE_DEFAULT_LOCALE ?? 'en',
        fallbackLng: process.env.NODE_FALLBACK_LOCALE ?? 'en',
        resources: {
            en: {
                translation: enTranslation as Record<string, unknown>,
            }
        }
    }))
    .then(() => {
        logger.info("------------- SERVER START -------------");
        app.listen(process.env.NODE_PORT ?? 3000);
    })
    .catch(error => logger.info("------------- SERVER ERROR -------------", error));

/**
 * The files in /public folder will be served as static
 */
app.use(
    express.static(
        path.join(getDirname(import.meta.url), '../' + (process.env.NODE_PUBLIC_PATH ?? "public")),
        {
            maxAge: process.env.NODE_ENV === 'production' ? (process.env.NODE_STATIC_MAXAGE ?? 0) : 0, // (expressed in seconds)
            // setHeaders: (response) => {
            //     response.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            // }
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
                "https://placedog.net",
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
// app.use((req, response, next) => {
//     req.on("data", (chunk) => {
//         logger.info("------------- REQUEST CHUNK DATA -------------", chunk)
//     });
//     req.on("end", () => {
//         logger.info("------------- REQUEST END -------------")
//         // response.statusCode = 200;
//         // response.setHeader("Location", "/");
//         // response.end();
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
 * Security
 * Limit user to access multiple times and overload the server.
 * Placed before userConnect so the rate limiter fires before any DB access.
 */
app.use(rateLimiter);

/**
 * Connect user (optimize data retrieve)
 */
app.use(userConnect);

/**
 * Generic middleware
 *
 * next() required to proceed in the chain,
 * otherwise response will be sent and connection with client closed
 */
app.use((request, response, next) => {
    logger.info(`Entering URL: ${ request.protocol }://${ request.get('host') }${ request.originalUrl }`);
    next();
});

app.use('/products', productRoutes);
app.use('/account', authRoutes);
app.use('/orders', orderRoutes);
app.use('/', cartRoutes);
app.use('/', systemRoutes);
app.use('/error', errorRoutes);

/**
 * Error handler.
 * Distinguish operational error from critical programmer error
 * Operational error: User redirected to error page explaining the problem
 * Critical errors: Error documented for later study, then current worker is suppressed so a new one is born (from cluster management)
 */
app.use((error: ErrorRequestHandler | ExtendedError | MulterError, request: Request, response: Response, next: NextFunction) => {
    // If headers already has been sent (shouldn't happen) delegate to the default Express error handler
    if (response.headersSent) {
        next(error);
        return;
    }

    // An error (like a database one) could occur during session, so before flash got initialized. Just ignore and go to Home

    if (!request.flash) {
        response.status(200).redirect("/");
        return;
    }

    // File upload error
    if (error instanceof MulterError) {
        logger.info(error);
        request.flash('error-title', [ error.code ]);
        request.flash('error-description', [ error.name + ": " + error.message + " on " + (error.field ?? "") ]);
        response.status(400).redirect("/error/");
        return;
    }

    // Check if the error is operational
    if (error instanceof ExtendedError && error.isOperational) {
        logger.info(error);
        request.flash('error-title', [ error.name ]);
        request.flash('error-description', error.errors);
        response.status(error.httpCode).redirect("/error/");
        return;
    }

    // Dangerous error, must be documented fully
    logger.error({
        ...error,
        stack: error instanceof ExtendedError ? error.stack : "",
    });
    request.flash('error-title', [ 'UNKNOWN ERROR' ]);
    request.flash('error-description', [ 'Something happened. Please contact support' ]);
    response.status(500).redirect("/error/");
    // Terminate the current process signaling that it has exited with an error.
    process.exit(1);
});


/**
 * Catch all routes
 */
app.use('/', (request, response) => {
    response.redirect("/error/page-not-found");
});

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
        if (process.env.NODE_ENV !== 'production')
            return;
        logger.error({
            error,
            origin
        });
        process.exit(1);
    });