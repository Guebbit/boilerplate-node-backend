// import all models and their associations
import "./models";

import 'dotenv/config';
import path from 'path';
import express from 'express';
import i18next from 'i18next';
import helmet from "helmet";
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import mongoose from "mongoose";
import { engine } from 'express-handlebars';

import { session, flash, userConnect } from "./utils/session";
import { rateLimiter } from "./middlewares/security";

import productRoutes from "./routes/products";
// import authRoutes from "./routes/auth";
// import orderRoutes from "./routes/orders";
// import cartRoutes from "./routes/cart";
import indexRoutes from "./routes";
import errorRoutes from "./routes/errors";

/**
 * Server start
 */
const app = express();

/**
 * Templating engine
 */
app.engine('hbs',
    engine({
        layoutsDir: './src/views/layouts/',
        defaultLayout: 'default-layout',
        extname: 'hbs'
    })
);
app.set('view engine', 'hbs');
app.set('views', './src/views');

// mongoose
//     .connect(process.env.NODE_DB_URI || "")
//     .then(result => app.listen(process.env.NODE_PORT || 3000))

/**
 * Sync database then start server
 * AFTER sync we can use the database, since it is initialized
 */
mongoose
    .connect(process.env.NODE_DB_URI || "")
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
        console.log("------------- SERVER START -------------")
        app.listen(process.env.NODE_PORT || 3000);
    })
    .catch(err => console.log("------------- SERVER START ERROR -------------", err));


/**
 * The files in /public folder will be served as static
 */
app.use(
    express.static(
        path.join(__dirname, 'public'),
        {
            maxAge: 60 // 1 min of cache (expressed in seconds)
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
 * TODO bodyParse file upload
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
// app.use('/account', authRoutes);
// app.use('/orders', orderRoutes);
// app.use('/cart', cartRoutes);
app.use('/', indexRoutes);
app.use('/error', errorRoutes);
// catch all routes
app.use('/', (req, res) =>
    res.status(404).redirect("/error/page-not-found"));
