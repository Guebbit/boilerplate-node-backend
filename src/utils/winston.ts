import winston from 'winston';

export default winston.createLogger({
    format: winston.format.json(),
    /**
     * Preloaded data
     */
    defaultMeta: {
        service: 'user-service'
    },
    /**
     * What to do with the logged message
     */
    transports: [
        // only errors will be put in the error.log
        new winston.transports.File({
            level: 'error',
            filename: 'error.log'
        }),
        // // all logs in the info.log
        // new winston.transports.File({
        //     filename: 'info.log'
        // }),
        // regular console.log
        new winston.transports.Console()
    ]
});
