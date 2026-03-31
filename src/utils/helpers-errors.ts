import logger from './winston';
import type { CastError } from 'mongoose';

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
    constructor(name: string, httpCode: number, isOperational = false, errors: string[] = []) {
        // Call the parent class (Error) constructor with the message
        super(name + ': ' + errors.join('. '));
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
        if (!isOperational)
            logger.error({
                message: this.message,
                stack: this.stack,
                name: this.name,
                errors: this.errors,
                httpCode: this.httpCode
            });
    }
}

/**
 * Interpret mongoose operation error
 * @param error
 */
export function databaseErrorInterpreter(error: CastError | Error): [number, string] {
    if (Object.prototype.hasOwnProperty.call(error, 'kind'))
        return [Number.parseInt((error as CastError).message), (error as CastError).kind];
    return [500, error.message || 'Unknown error'];
}

/**
 * Interpret and convert mongoose operation error
 * @param error
 */
export function databaseErrorConverter(error: CastError | Error) {
    return Object.prototype.hasOwnProperty.call(error, 'kind')
        ? new ExtendedError((error as CastError).kind, Number.parseInt(error.message))
        : new ExtendedError((error as Error).message, 500);
}
