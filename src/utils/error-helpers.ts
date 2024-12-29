import logger from "./winston";
import {ValidationError, DatabaseError} from "sequelize";

/**
 * Extension of Error class with some customization
 */
export class ExtendedError extends Error {
    // Error name or identifier
    public readonly name: string;
    // HTTP status code appropriate for this error (404, 500, etc)
    public readonly httpCode: number;
    // Flag to indicate if the error is an operational error.
    public readonly isOperational: boolean;
    // List of UI errors
    public readonly errors: string[];

    /**
     *
     * @param name
     * @param httpCode
     * @param isOperational - false means dangerous
     * @param errors
     */
    constructor(
        name: string,
        httpCode: number,
        isOperational = false,
        errors: string[] = []
    ) {
        // Call the parent class (Error) constructor with the message
        super(name + ": " + errors.join(". "));
        // Restore prototype chain
        Object.setPrototypeOf(this, new.target.prototype);
        // set the variables
        this.name = name;
        this.httpCode = httpCode;
        this.isOperational = isOperational;
        this.errors = errors;
        // Capture stack trace for debugging if NOT extending Error
        // Error.captureStackTrace(this);
        // Dangerous, better log it
        if(!isOperational)
            logger.error(this);
    }
}

/**
 * Interpret sequelize operation error
 * @param error
 */
export function databaseErrorInterpreter(error: ValidationError | DatabaseError | Error) {
    if (error instanceof ValidationError)
        return error.errors.map(({ message }) => message);
    if (error instanceof DatabaseError)
        return [error.message, error.sql];
    if (error instanceof Error)
        return [error.message];
    return ["Unknown error"];
}

/**
 * Interpret and convert sequelize operation error
 * @param error
 */
export function databaseErrorConverter(error: ValidationError | DatabaseError | Error){
    return new ExtendedError(databaseErrorInterpreter(error).join(", "), 500)
}
