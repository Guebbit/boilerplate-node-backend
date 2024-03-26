import winston from "winston";

export default winston.createLogger({
    format: winston.format.json(),
    defaultMeta: {
        service: 'user-service'
    },
    transports: [
        // only errors will be put in the error.log
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        // all logs in the info.log
        new winston.transports.File({ filename: 'info.log' }),
        // regular console.log
        new winston.transports.Console(),
    ],
});