import logger from "./winston";

/**
 * Extension of Error class with some customization
 */
export class ExtendedError extends Error {
    // Error name or identifier
    public readonly name: string;
    // Error message or custom description
    public readonly description: string;
    // HTTP status code appropriate for this error (404, 500, etc)
    public readonly httpCode: number;
    // Flag to indicate if the error is an operational error.
    public readonly isOperational: boolean;

    /**
     *
     * @param name
     * @param httpCode
     * @param description
     * @param isOperational
     */
    constructor(name: string, httpCode: number, description = "", isOperational = true) {
        // Call the parent class (Error) constructor with the message
        super(name + ": " + description);
        // Restore prototype chain
        Object.setPrototypeOf(this, new.target.prototype);
        // set the variables
        this.name = name;
        this.description = description;
        this.httpCode = httpCode;
        this.isOperational = isOperational;
        // Capture stack trace for debugging if NOT extending Error
        // Error.captureStackTrace(this);
        // Dangerous, better log it
        if(!isOperational)
            logger.error(this);
    }
}